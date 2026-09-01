# Transport ERP Deployment Scaffold

This repository contains the foundational scaffolding for your Transport ERP, configured specifically to be easily deployed to a GoDaddy Node.js cPanel environment.

## Folder Structure
- `app.js`: The Express server entry point.
- `prisma/`: Contains your MySQL database schema for Vehicles, Drivers, Trips, etc.
- `client/`: The React (Vite) frontend scaffold.

## How to Work on This Locally
1. Run `npm install` in the root folder.
2. Run `npm install` inside the `client/` folder.
3. Copy `.env.example` to `.env` and add your MySQL connection string.
   - For Aiven MySQL, use this format: `mysql://avnadmin:YOUR_AIVEN_PASSWORD@YOUR_AIVEN_HOST:PORT/defaultdb?ssl-mode=REQUIRED`
4. Run `npx prisma db push` to generate the database tables.
5. For a one-click local setup in VS Code, run the `Start dev agent` task. It starts the frontend and backend together, watches `prisma/schema.prisma`, runs `prisma generate` and `prisma db push` after schema changes, and then restarts the backend automatically.
6. If you prefer manual development commands, run the backend with `npm run dev` and frontend with `npm run dev` inside `client/`.

## Multi-Company Use
The app uses a selected company key to keep operational data separate across companies. Choose or enter a company key in the sidebar before entering data. Each browser/user session keeps its selected company locally and sends it with API requests.

For production, set `CORS_ORIGIN` in `.env` to your deployed frontend origin. Use comma-separated origins only when you intentionally serve from multiple domains.

## Render + Aiven MySQL
In Render, set these environment variables on the web service:
- `DATABASE_URL`: `mysql://avnadmin:YOUR_AIVEN_PASSWORD@YOUR_AIVEN_HOST:PORT/defaultdb?ssl-mode=REQUIRED`
- `AUTH_SECRET`: a long random secret
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_NAME`
- `SUPERADMIN_PASSWORD`
- `SUPERADMIN_TENANT`: `default`
- `CORS_ORIGIN`: your Render app URL
- Optional reminder email settings: `BREVO_API_KEY`, `REMINDER_FROM_EMAIL`, `REMINDER_TO_EMAIL`, `REMINDER_EMAIL_ENABLED=true`

Use these Render commands:
- Build command: `npm install && npx prisma generate && cd client && npm install && npm run build`
- Start command: `npm start`

Set Node to `20.x` using the Render environment variable `NODE_VERSION=20.19.0` or the committed `.node-version` file.

## Reminder Email
The Reminders page can send driver, truck compliance, and loan due reminders by email through Brevo transactional email. Brevo's API uses `POST https://api.brevo.com/v3/smtp/email` with an `api-key` header, so no extra Node package is required.

Set these values in `.env` or Render:
- `BREVO_API_KEY`: Brevo transactional API key.
- `REMINDER_FROM_EMAIL`: a verified Brevo sender email.
- `REMINDER_TO_EMAIL`: default comma-separated recipient list.
- `REMINDER_DAYS_AHEAD`: due window, default `30`.
- `REMINDER_TRIGGER_DAYS`: automatic send days before due date, default `30,15,7,3,2,1`.
- `REMINDER_EMAIL_ENABLED=true`: enables the daily automatic send at `REMINDER_DAILY_TIME`.

## How to Deploy to GoDaddy cPanel
1. Connect to your GoDaddy MySQL database, and put those credentials in your GoDaddy `.env` file.
2. Build your React app locally: `cd client && npm run build`. This generates a `client/dist` folder.
3. Zip the entire directory (excluding `node_modules`).
4. Upload to GoDaddy File Manager.
5. In cPanel, go to "Setup Node.js App".
6. Set Application startup file to `app.js`.
7. Run NPM install from the cPanel Node interface.
8. Start the app. Your React frontend will be served by the Node app automatically!
