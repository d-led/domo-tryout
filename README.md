# DomoActors Browser Demo

Trying out [DomoActors](https://github.com/VaughnVernon/DomoActors) in the browser with real-time synchronization.

## Architecture

```
Browser (Client)              WebSocket Server (Node.js)
┌─────────────┐              ┌──────────────────┐
│ DomoActors  │              │  y-websocket     │
│   Actors    │◄────────────►│  Server          │
│             │   WebSocket  │                  │
│ SyncedStore │              │  Security:       │
│  (Yjs)      │              │  - Room check    │
│             │              │  - Origin check  │
│ IndexedDB   │              │  - Secret auth   │
│ Persistence │              └──────────────────┘
└─────────────┘
```

- **Client**: DomoActors actors communicate via SyncedStore (Yjs) over WebSocket
- **Server**: Node.js WebSocket server using `@y/websocket-server` (deployed on Fly.io)
- **UI**: Static frontend deployed on GitHub Pages
- **Sync**: Yjs handles CRDT synchronization, IndexedDB provides offline persistence
- **Security**: Room restriction, origin/referer checks, shared secret authentication

## Setup

```bash
npm install
npm run build  # Build UI to dist/
npm run serve  # Serve UI on http://localhost:8000
npm run server # Start backend WebSocket server on :9870 (in another terminal)
npm test       # Playwright E2E tests
npm run test:unit  # Vitest unit tests
```

**Local Development**:

- Run `npm run serve` in one terminal (serves UI on :8000)
- Run `npm run server` in another terminal (serves backend on :9870)
- Or use `npm run dev` to watch and rebuild UI files (then serve separately)

## Server

```bash
npm run server    # Start Node.js server on :9870
```

Or manually:

```bash
cd server
npm install
npm start
```

## Deployment

**UI (GitHub Pages)**:

- Automatically deployed from `main` branch via `.github/workflows/pages.yml`
- Only builds and deploys `dist/` (static frontend files)
- Server code is NOT included

**Backend (Fly.io)**:

- Deploy from `server/` directory using Fly.io CLI
- See `server/README.md` for deployment instructions
- Only deploys `server/` directory (Node.js WebSocket server)
- UI code is NOT included
- **Deployed URL**: `wss://d-led-y-websocket-server.fly.dev` (Amsterdam region)

**Security Configuration**:

You need to set secrets in two places for authentication to work:

1. **Fly.io** (for the server):
   ```bash
   cd server
   fly secrets set WS_SECRET=your-secret-value-here
   ```
