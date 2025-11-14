import { setupWSConnection } from "@y/websocket-server/utils";
import http from "http";
import { WebSocketServer } from "ws";

const port = process.env.PORT || 9870;
const WS_SECRET = process.env.WS_SECRET || "wss-changeme";
const server = http.createServer();

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  // Extract room name from URL path
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  const room = url.pathname.slice(1).split("?")[0];

  // Security: Only allow the specific room
  if (room !== "domo-actors-counter") {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Security: Check origin/referer (optional but recommended)
  const origin = request.headers.origin || request.headers.referer || "";
  const allowedOrigins = [
    "https://d-led.github.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
  ];
  if (origin && !allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  // Check for secret in URL query parameter (WebsocketProvider adds it via params)
  const secret = url.searchParams.get("secret");
  if (!secret || secret !== WS_SECRET) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    setupWSConnection(ws, request);
  });
});

server.listen(port, () => {
  console.log(`Yjs WebSocket server running on port ${port}`);
});
