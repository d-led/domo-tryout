# Yjs WebSocket Server (Node.js)

Minimal Node.js-based WebSocket server for Yjs synchronization.

## Deploy to Fly.io

**Current Deployment**: `wss://d-led-y-websocket-server.fly.dev` (Amsterdam region)

To deploy or update:

1. Install the [Fly CLI](https://fly.io/docs/getting-started/installing-flyctl/)
2. Authenticate: `fly auth login`
3. From the `server/` directory, set the `WS_SECRET` environment variable:
   ```bash
   fly secrets set WS_SECRET=your-secret-value-here
   ```
   **Important**: This must match the `WS_SECRET` GitHub secret used to build the client.
4. Deploy: `fly deploy`
5. Your server will be available at `wss://d-led-y-websocket-server.fly.dev`

### Updating Secrets

```bash
fly secrets set WS_SECRET=new-secret-value
fly deploy  # Restart to apply new secrets
```

### Viewing Logs

```bash
fly logs
```

## Usage

The server accepts WebSocket connections at `wss://your-server.com/room-name`

Example client connection:

```javascript
const wsProvider = new WebsocketProvider(
  "wss://d-led-y-websocket-server.fly.dev",
  "domo-actors-counter",
  doc,
  {
    params: { secret: "your-secret-value" }
  }
);
```

## Local Development

```bash
npm install
npm start
```

Server runs on `ws://localhost:9870` by default (or `PORT` environment variable).
