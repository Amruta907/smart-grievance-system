# NagarSeva (MERN-style with SQLite)

NagarSeva is now structured as:
- `M`: replaced with SQLite (instead of MongoDB)
- `E`: Express API (TypeScript)
- `R`: React frontend (TypeScript + Tailwind)
- `N`: Node.js runtime

## Stack
- Backend: Express + TypeScript + `node:sqlite`
- Frontend: React + TypeScript + Tailwind + Vite
- Auth: bcryptjs + token sessions
- Map: React Leaflet + OpenStreetMap tiles

## Project Layout
- `src/server.ts` - Express API + production static hosting
- `src/db.ts` - SQLite schema + seed data
- `client/` - React + Tailwind app

## Run
1. Install root dependencies:
```bash
npm install
```
2. Install frontend dependencies:
```bash
npm --prefix client install
```
3. Start backend + frontend:
```bash
npm run dev
```

## Default Logins
- Citizen:
  - Email: `citizen@nagarseva.com`
  - Password: `citizen123`
- Authority:
  - Email: `admin@nagarseva.gov`
  - Password: `admin123`

## UI Coverage
The React screens are aligned to your references:
- `/` landing hero
- `/login` role-switch login/register
- `/dashboard` feature card dashboard
- `/map` city map with status markers and legend

## Telegram Complaint Bot Integration
The backend now includes Telegram complaint filing via webhook.

### Environment Variables
Set these before starting server:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_WEBHOOK_SECRET=your_random_secret_token
APP_BASE_URL=https://your-public-domain
```

### Endpoints Added
- `POST /webhooks/telegram`
  - Receives Telegram updates
  - Verifies header `x-telegram-bot-api-secret-token` when secret is set
- `POST /api/telegram/set-webhook`
  - Registers Telegram webhook to `${APP_BASE_URL}/webhooks/telegram`

### Bot Commands
- `/start` or `/new` to begin complaint filing
- `/status <ticket_number>` to check complaint status
- `/cancel` to cancel current complaint draft
- `/help` for command help

### Conversation Flow
1. Select language (English/Hindi/Marathi)
2. Select category
3. Enter issue description
4. Enter location text or send live location
5. Confirm and submit

### Database Changes
- New table: `telegram_sessions`
- New table: `telegram_updates` (for dedup/idempotency)
- `users.telegram_chat_id` column
- `grievances.source_channel` and `grievances.source_user_id` columns
