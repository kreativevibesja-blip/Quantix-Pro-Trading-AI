# CaribChat Complete (Frontend UI + Backend demo)

This repo includes:
- server/: Node + Express + Baileys (QR login) + SQLite + mock Payoneer billing endpoints
- web/: React (Vite) full UI mock (Login, Dashboard, Messages, Automations, Templates, Billing)

## Run server
cd server
npm install
cp .env.example .env
# optionally add OPENAI_KEY
npm run dev
# server runs at http://localhost:3333

## Run frontend
cd web
npm install
npm run dev
# open http://localhost:5173 and login (any credentials) to view full UI mock
