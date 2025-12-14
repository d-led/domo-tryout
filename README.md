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

The WebSocket server is in the `server/` directory. For server-specific documentation, see [server/README.md](server/README.md).

Quick start:
```bash
npm run server    # Start Node.js server on :9870
```

## Deployment

**Fly.io**: See [server/README.md](server/README.md) for detailed deployment instructions.

**GitHub Pages**: Redirects to `https://domo-tryout.fly.dev/` (legacy support). Automatically deployed from `main` branch via `.github/workflows/pages.yml`.
