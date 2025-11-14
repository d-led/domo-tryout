# Yjs WebSocket Server (Go)

Minimal Go-based WebSocket server for Yjs synchronization.

## Deploy to Render.com

1. Push this `server/` directory to a GitHub repository
2. In Render.com dashboard, click "New" → "Blueprint"
3. Connect your GitHub repo
4. Render will detect `render.yaml` and deploy automatically
5. Your server will be available at `wss://your-service.onrender.com`
6. **Important**: The `WS_SECRET` in `render.yaml` must match the `WS_SECRET` GitHub secret used to build the client. Update both to a secure value.

## Usage

The server accepts WebSocket connections at `wss://your-server.com/room-name`

Example client connection:

```javascript
const wsProvider = new WebsocketProvider(
  "wss://your-server.onrender.com",
  "my-room",
  doc,
);
```

## Local Development

```bash
go mod download
go run main.go
```

Server runs on `ws://localhost:10000` by default.
