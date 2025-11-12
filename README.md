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
│             │              │  - Origin check │
│ IndexedDB   │              │  - Secret auth  │
│ Persistence │              └──────────────────┘
└─────────────┘
```

- **Client**: DomoActors actors communicate via SyncedStore (Yjs) over WebSocket
- **Server**: Node.js WebSocket server using `@y/websocket-server` (deployed on Render.com)
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

**Backend (Render.com)**:
- Deploy via `render.yaml` (root directory)
- Only deploys `server/` directory (Node.js WebSocket server)
- UI code is NOT included

**Security**: Set `WS_SECRET` in both:
- GitHub repository secrets (for client build)
- Render.com environment variables (for server)
Both must match for authentication to work.
