# DomoActors Browser Demo

Trying out [DomoActors](https://github.com/VaughnVernon/DomoActors) in the browser with real-time synchronization.

## Architecture

```
Browser (Client)     OAuth2 Proxy      Backend Server (Node.js)
┌─────────────┐     ┌──────────┐      ┌──────────────────┐
│ DomoActors  │     │  Proxy   │      │  y-websocket     │
│   Actors    │────►│ (Public) │─────►│  Server          │
│             │     │          │      │  (Private)       │
│ SyncedStore │     │ GitHub   │      │  Security:       │
│  (Yjs)      │     │  Auth    │      │  - Room check    │
│             │     │          │      │  - Origin check  │
│ IndexedDB   │     └──────────┘      │  - Secret auth   │
│ Persistence │                       └──────────────────┘
└─────────────┘                       (Flycast network)
```

- **Client**: DomoActors actors communicate via SyncedStore (Yjs) over WebSocket
- **Proxy**: OAuth2 proxy (GitHub authentication) - public-facing entry point
- **Backend**: Node.js server serving static files and WebSocket (private, Flycast-only)
- **Sync**: Yjs handles CRDT synchronization, IndexedDB provides offline persistence
- **Security**: OAuth2 authentication, room restriction, origin/referer checks, shared secret authentication

## Setup

```bash
npm install
npm run build  # Build UI to dist/
npm start      # Start unified server (serves UI + WebSocket on :9870)
npm test       # Playwright E2E tests
npm run test:unit  # Vitest unit tests
```

**Local Development**:

- Run `npm start` to build and start the unified server (serves UI and WebSocket on :9870)
- Or run `npm run dev` in one terminal to watch and rebuild UI files, then `npm start` in another terminal

## Server

The unified server (in `server/` directory) serves both static files and WebSocket connections. For server-specific documentation, see [server/README.md](server/README.md).

Quick start:
```bash
npm start    # Builds UI and starts server on :9870
```

## Deployment

**Fly.io**: See [server/README.md](server/README.md) for detailed deployment instructions.

**GitHub Pages**: Redirects to `https://domo-tryout.fly.dev/` (legacy support). Automatically deployed from `main` branch via `.github/workflows/pages.yml`.
