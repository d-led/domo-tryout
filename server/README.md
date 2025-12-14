# Yjs WebSocket Server (Node.js)

Minimal Node.js-based WebSocket server for Yjs synchronization.

This server serves both static frontend files and WebSocket connections for the DomoActors demo.

## Deploy to Fly.io

**Current Deployment**: 
- **Public URL**: `https://domo-tryout.fly.dev` (via OAuth2 proxy)
- **Backend App**: `domo-tryout-app` (private, Flycast-only)
- **Proxy App**: `domo-tryout` (public-facing with GitHub OAuth)

### Deployment

The backend is deployed as part of a unified Docker build that includes both the frontend and backend.

**From the project root:**

1. Set `WS_SECRET` in your environment (e.g., in `~/.zshrc`):
   ```bash
   export WS_SECRET="your-secret-value-here"
   ```

2. Deploy the backend:
   ```bash
   ./deploy-fly.sh
   ```

   This script will:
   - Use `WS_SECRET` from your environment for the build
   - Set it as a Fly.io secret for runtime authentication
   - Deploy the backend app (`domo-tryout-app`)

3. Deploy the proxy (separate app):
   ```bash
   fly deploy -a domo-tryout -c proxy/fly.toml
   ```

**Note**: The backend app is private (Flycast-only) and serves both static files and WebSocket connections. The proxy app handles public access with OAuth2 authentication.

### Updating Secrets

```bash
# Update in your environment
export WS_SECRET="new-secret-value"

# Update Fly.io secret
fly secrets set -a domo-tryout-app WS_SECRET="$WS_SECRET"

# Redeploy
./deploy-fly.sh
```

### Viewing Logs

```bash
# Backend app logs
fly logs -a domo-tryout-app

# Proxy app logs
fly logs -a domo-tryout
```

## Usage

The server accepts WebSocket connections at `wss://your-server.com/room-name`

Example client connection:

```javascript
const wsProvider = new WebsocketProvider(
  "wss://domo-tryout.fly.dev",  // Public proxy URL
  "domo-actors-counter",
  doc,
  {
    params: { secret: "your-secret-value" }
  }
);
```

**Note**: The WebSocket connection goes through the public proxy URL, which routes to the private backend via Flycast.

## Security

The server includes multiple security features:
- Rate limiting (5 requests/second per IP) ⭐ Most important
- Connection limits (5 concurrent connections per IP)
- Origin validation (exact match)
- Secret authentication
- Frame size limits (1MB max)
- Connection timeouts (5 minutes)

See [SECURITY.md](./SECURITY.md) for detailed security documentation and configuration options.

## Local Development

```bash
npm install
npm start
```

Server runs on `ws://localhost:9870` by default (or `PORT` environment variable).

### Security Configuration (Optional)

You can customize security settings via environment variables:

```bash
MAX_CONNECTIONS_PER_IP=5
RATE_LIMIT_WINDOW_MS=1000        # 1 second window
RATE_LIMIT_MAX_REQUESTS=5        # 5 requests per second
MAX_FRAME_SIZE=1048576
CONNECTION_TIMEOUT_MS=300000
```
