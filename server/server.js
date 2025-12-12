import { setupWSConnection } from "@y/websocket-server/utils";
import http from "http";
import { WebSocketServer } from "ws";

const port = process.env.PORT || 9870;
const WS_SECRET = process.env.WS_SECRET || "wss-changeme";
const MAX_CONNECTIONS_PER_IP = parseInt(process.env.MAX_CONNECTIONS_PER_IP || "5", 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "1000", 10); // 1 second
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5", 10); // 5 requests per second
const MAX_FRAME_SIZE = parseInt(process.env.MAX_FRAME_SIZE || "1048576", 10); // 1MB default
const CONNECTION_TIMEOUT_MS = parseInt(process.env.CONNECTION_TIMEOUT_MS || "300000", 10); // 5 minutes

const server = http.createServer();

// Track connections per IP
const connectionsByIP = new Map();
// Track rate limiting per IP - MOST IMPORTANT SECURITY FEATURE
const rateLimitByIP = new Map();

// Allowed origins (exact match for better security)
const ALLOWED_ORIGINS = new Set([
  "https://d-led.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

// Rate limiting check
function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitByIP.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > record.resetAt) {
    record.count = 1;
    record.resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitByIP.set(ip, record);
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count++;
  rateLimitByIP.set(ip, record);
  return true;
}

// Connection limit check
function checkConnectionLimit(ip) {
  const count = connectionsByIP.get(ip) || 0;
  return count < MAX_CONNECTIONS_PER_IP;
}

function incrementConnectionCount(ip) {
  connectionsByIP.set(ip, (connectionsByIP.get(ip) || 0) + 1);
}

function decrementConnectionCount(ip) {
  const count = connectionsByIP.get(ip) || 0;
  if (count <= 1) {
    connectionsByIP.delete(ip);
  } else {
    connectionsByIP.set(ip, count - 1);
  }
}

// Get client IP from request (handles Fly.io proxy headers)
function getClientIP(request) {
  // Fly.io uses X-Forwarded-For header
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return request.socket.remoteAddress || "unknown";
}

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: MAX_FRAME_SIZE,
  perMessageDeflate: false, // Disable compression to reduce CPU usage and prevent some attacks
});

server.on("upgrade", (request, socket, head) => {
  const clientIP = getClientIP(request);

  // Rate limiting
  if (!checkRateLimit(clientIP)) {
    console.warn(`Rate limit exceeded for IP: ${clientIP}`);
    socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
    socket.destroy();
    return;
  }

  // Connection limit check
  if (!checkConnectionLimit(clientIP)) {
    console.warn(`Connection limit exceeded for IP: ${clientIP}`);
    socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
    socket.destroy();
    return;
  }

  // Extract room name from URL path
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const room = url.pathname.slice(1).split("?")[0];

  // Security: Only allow the specific room
  if (room !== "domo-actors-counter") {
    console.warn(`Invalid room attempted: ${room} from IP: ${clientIP}`);
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Security: Check origin (exact match for better security)
  // Note: Origin can be spoofed by non-browser clients, but browsers enforce it
  // This provides protection against simple XSS/script injection attacks
  const origin = request.headers.origin;
  const referer = request.headers.referer;
  
  // Validate origin - browsers send this automatically, non-browser clients can spoof it
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    // Fallback: check referer as secondary validation (also spoofable, but adds a layer)
    if (!referer || !ALLOWED_ORIGINS.has(new URL(referer).origin)) {
      console.warn(`Invalid origin: ${origin}, referer: ${referer} from IP: ${clientIP}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  
  // Additional check: User-Agent pattern (browsers typically send this)
  // This helps identify non-browser clients attempting to spoof origin
  const userAgent = request.headers["user-agent"] || "";
  const isLikelyBrowser = /Mozilla|Chrome|Safari|Firefox|Edge|Opera/i.test(userAgent);
  
  // If origin is set but User-Agent doesn't look like a browser, be suspicious
  // (This is a heuristic, not foolproof)
  if (origin && !isLikelyBrowser && process.env.STRICT_BROWSER_ONLY === "true") {
    console.warn(`Suspicious: origin set but non-browser User-Agent: ${userAgent} from IP: ${clientIP}`);
    // Don't reject, but log for monitoring - strict mode can be enabled if needed
  }

  // Check for secret in URL query parameter (WebsocketProvider adds it via params)
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== WS_SECRET) {
    console.warn(`Invalid secret attempt from IP: ${clientIP}, origin: ${origin}`);
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  // All checks passed, upgrade connection
  wss.handleUpgrade(request, socket, head, (ws) => {
    incrementConnectionCount(clientIP);

    // Set connection timeout
    const timeout = setTimeout(() => {
      console.warn(`Connection timeout for IP: ${clientIP}`);
      ws.close(1008, "Connection timeout");
    }, CONNECTION_TIMEOUT_MS);

    // Clean up on close
    ws.on("close", () => {
      clearTimeout(timeout);
      decrementConnectionCount(clientIP);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for IP ${clientIP}:`, error.message);
      clearTimeout(timeout);
      decrementConnectionCount(clientIP);
    });

    // Limit frame size
    ws.on("message", (data) => {
      if (data.length > MAX_FRAME_SIZE) {
        console.warn(`Frame size exceeded: ${data.length} bytes from IP: ${clientIP}`);
        ws.close(1009, "Frame too large");
        return;
      }
    });

    setupWSConnection(ws, request);
  });
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server running on port ${port}`);
  const rateLimitWindowSec = RATE_LIMIT_WINDOW_MS / 1000;
  console.log(`Security: Rate limit ${RATE_LIMIT_MAX_REQUESTS} requests/${rateLimitWindowSec}s per IP, max ${MAX_CONNECTIONS_PER_IP} connections/IP`);
});

// Cleanup old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitByIP.entries()) {
    if (now > record.resetAt) {
      rateLimitByIP.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);
