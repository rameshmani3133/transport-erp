const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const clientDir = path.join(rootDir, 'client');
const schemaPath = path.join(rootDir, 'prisma', 'schema.prisma');
const prismaBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.cmd' : 'prisma');
const nodemonBin = path.join(rootDir, 'node_modules', 'nodemon', 'bin', 'nodemon.js');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let backendProcess = null;
let frontendProcess = null;
let schemaSyncInProgress = false;
let schemaSyncQueued = false;
let schemaSyncTimer = null;
let shuttingDown = false;

function log(message) {
  console.log(`[dev-agent] ${message}`);
}

function ensureFileExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${description} not found at ${filePath}. Run npm install before starting the dev agent.`);
  }
}

function escapeForCmd(value) {
  if (!/[\s"&|<>^()%!]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}

function spawnProcess(command, args, options) {
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(command)) {
    const comSpec = process.env.ComSpec || 'cmd.exe';
    const commandLine = [escapeForCmd(command), ...args.map(escapeForCmd)].join(' ');

    return spawn(comSpec, ['/d', '/s', '/c', commandLine], options);
  }

  return spawn(command, args, options);
}

function runCommand(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    log(`Running ${label}...`);

    const child = spawnProcess(command, args, {
      cwd,
      stdio: 'inherit',
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      if (signal) {
        reject(new Error(`${label} was terminated by signal ${signal}.`));
        return;
      }

      reject(new Error(`${label} exited with code ${code}.`));
    });
  });
}

function waitForExit(child, label) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    child.once('exit', finish);
    child.once('error', finish);

    if (process.platform === 'win32' && child.pid) {
      try {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      } catch (e) {
        // Process may have already exited
      }
      finish();
      return;
    }

    const terminated = child.kill('SIGTERM');
    if (!terminated) {
      finish();
      return;
    }

    setTimeout(() => {
      if (!settled) {
        log(`${label} did not stop in time, forcing shutdown.`);
        child.kill('SIGKILL');
      }
    }, 5000);
  });
}

async function stopBackend() {
  if (!backendProcess) {
    return;
  }

  const runningBackend = backendProcess;
  backendProcess = null;
  await waitForExit(runningBackend, 'Backend');
}

function startBackend() {
  if (backendProcess || shuttingDown) {
    return;
  }

  log('Starting backend server...');
  backendProcess = spawn(process.execPath, [nodemonBin, 'app.js'], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  backendProcess.once('exit', (code, signal) => {
    backendProcess = null;

    if (!shuttingDown && code !== 0 && signal !== 'SIGTERM') {
      log(`Backend process exited (code=${code}, signal=${signal || 'none'}).`);
    }
  });
}

function startFrontend() {
  if (frontendProcess || shuttingDown) {
    return;
  }

  log('Starting frontend dev server...');
  frontendProcess = spawnProcess(npmCmd, ['run', 'dev'], {
    cwd: clientDir,
    stdio: 'inherit',
  });

  frontendProcess.once('exit', (code, signal) => {
    frontendProcess = null;

    if (!shuttingDown) {
      log(`Frontend process exited (code=${code}, signal=${signal || 'none'}). Stopping dev agent.`);
      void shutdown(code || 1);
    }
  });
}

async function syncPrismaSchema(trigger) {
  if (schemaSyncInProgress) {
    schemaSyncQueued = true;
    return;
  }

  schemaSyncInProgress = true;

  try {
    if (trigger === 'change') {
      log('Detected Prisma schema change. Restarting backend after Prisma sync.');
    } else {
      log('Preparing backend with the latest Prisma schema.');
    }

    await stopBackend();
    await runCommand(prismaBin, ['generate'], rootDir, 'Prisma generate');
    await runCommand(prismaBin, ['db', 'push', '--skip-generate'], rootDir, 'Prisma db push');
    startBackend();

    if (trigger === 'startup') {
      log('Development services are running.');
    } else {
      log('Backend restarted with the updated Prisma schema.');
    }
  } catch (error) {
    log(`${error.message} Backend will remain stopped until the next successful Prisma sync.`);

    if (trigger === 'startup') {
      throw error;
    }
  } finally {
    schemaSyncInProgress = false;

    if (schemaSyncQueued && !shuttingDown) {
      schemaSyncQueued = false;
      schemaSyncTimer = setTimeout(() => {
        schemaSyncTimer = null;
        void syncPrismaSchema('change');
      }, 300);
    }
  }
}

function scheduleSchemaSync() {
  if (shuttingDown) {
    return;
  }

  if (schemaSyncTimer) {
    clearTimeout(schemaSyncTimer);
  }

  schemaSyncTimer = setTimeout(() => {
    schemaSyncTimer = null;
    void syncPrismaSchema('change');
  }, 300);
}

function watchSchema() {
  fs.watchFile(schemaPath, { interval: 500 }, (current, previous) => {
    if (current.mtimeMs !== previous.mtimeMs) {
      scheduleSchemaSync();
    }
  });
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (schemaSyncTimer) {
    clearTimeout(schemaSyncTimer);
    schemaSyncTimer = null;
  }

  fs.unwatchFile(schemaPath);

  const pendingStops = [];

  if (backendProcess) {
    pendingStops.push(waitForExit(backendProcess, 'Backend'));
    backendProcess = null;
  }

  if (frontendProcess) {
    pendingStops.push(waitForExit(frontendProcess, 'Frontend'));
    frontendProcess = null;
  }

  await Promise.all(pendingStops);
  process.exit(exitCode);
}

async function main() {
  ensureFileExists(schemaPath, 'Prisma schema');
  ensureFileExists(prismaBin, 'Prisma CLI');
  ensureFileExists(nodemonBin, 'Nodemon');

  log('Starting development services...');
  watchSchema();
  startFrontend();
  await syncPrismaSchema('startup');
}

process.on('SIGINT', () => {
  void shutdown(0);
});

process.on('SIGTERM', () => {
  void shutdown(0);
});

main().catch(async (error) => {
  log(error.message);
  await shutdown(1);
});
