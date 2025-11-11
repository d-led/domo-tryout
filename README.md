# DomoActors Browser Demo

Trying out [DomoActors](https://github.com/VaughnVernon/DomoActors) in the browser with real-time synchronization.

## Architecture

```
Browser (Client)              WebSocket Server (Go)
┌─────────────┐              ┌──────────────────┐
│ DomoActors  │              │  Actor Model     │
│   Actors    │◄────────────►│  (phony)         │
│             │   WebSocket  │                  │
│ SyncedStore │              │  Rate Limiting   │
│  (Yjs)      │              │  Max Clients     │
│             │              │                  │
│ IndexedDB   │              └──────────────────┘
│ Persistence │
└─────────────┘
```

- **Client**: DomoActors actors communicate via SyncedStore (Yjs) over WebSocket
- **Server**: Go-based WebSocket server using actor model (`github.com/Arceliar/phony`)
- **Sync**: Yjs handles CRDT synchronization, IndexedDB provides offline persistence
- **Security**: Room restriction, origin/referer checks, shared secret authentication

## Setup

```bash
npm install
npm run dev    # UI on :8000, server on :9870
npm test       # Playwright E2E tests
npm run test:unit  # Vitest unit tests
```

## Server

```bash
cd server
go run .       # Runs on :9870
```

Deploy to Render.com via `render.yaml` (root directory).

**Security**: Set `WS_SECRET` in both:
- GitHub repository secrets (for client build)
- Render.com environment variables (for server)
Both must match for authentication to work.
