# Transport ERP Deployment Scaffold

This repository contains the foundational scaffolding for your Transport ERP, configured specifically to be easily deployed to a GoDaddy Node.js cPanel environment.

## Folder Structure
- `app.js`: The Express server entry point.
- `prisma/`: Contains your MySQL database schema for Vehicles, Drivers, Trips, etc.
- `client/`: The React (Vite) frontend scaffold.

## How to Work on This Locally
1. Run `npm install` in the root folder.
2. Run `npm install` inside the `client/` folder.
3. Copy `.env.example` to `.env` and add your local MySQL connection string.
4. Run `npx prisma db push` to generate the database tables.
5. For a one-click local setup in VS Code, run the `Start dev agent` task. It starts the frontend and backend together, watches `prisma/schema.prisma`, runs `prisma generate` and `prisma db push` after schema changes, and then restarts the backend automatically.
6. If you prefer manual development commands, run the backend with `npm run dev` and frontend with `npm run dev` inside `client/`.

## Multi-Company Use
The app uses a selected company key to keep operational data separate across companies. Choose or enter a company key in the sidebar before entering data. Each browser/user session keeps its selected company locally and sends it with API requests.

For production, set `CORS_ORIGIN` in `.env` to your deployed frontend origin. Use comma-separated origins only when you intentionally serve from multiple domains.

## How to Deploy to GoDaddy cPanel
1. Connect to your GoDaddy MySQL database, and put those credentials in your GoDaddy `.env` file.
2. Build your React app locally: `cd client && npm run build`. This generates a `client/dist` folder.
3. Zip the entire directory (excluding `node_modules`).
4. Upload to GoDaddy File Manager.
5. In cPanel, go to "Setup Node.js App".
6. Set Application startup file to `app.js`.
7. Run NPM install from the cPanel Node interface.
8. Start the app. Your React frontend will be served by the Node app automatically!
