/**
 * Arcade Multiplayer Relay Server
 * Works on Fly.io and Render.com
 * - Allows all origins (needed for file:// and any domain)
 * - Handles WebSocket upgrades explicitly
 * - /health endpoint for keep-alive pings
 */

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;

// rooms: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

function getRoomSize(code) {
  return rooms.has(code) ? rooms.get(code).size : 0;
}

function joinRoom(code, ws) {
  if (!rooms.has(code)) rooms.set(code, new Set());
  rooms.get(code).add(ws);
  ws._roomCode = code;
  console.log(`[join] room=${code} size=${getRoomSize(code)}`);
}

function leaveRoom(ws) {
  const code = ws._roomCode;
  if (!code || !rooms.has(code)) return;
  rooms.get(code).delete(ws);
  console.log(`[leave] room=${code} size=${getRoomSize(code)}`);
  if (rooms.get(code).size === 0) {
    rooms.delete(code);
    console.log(`[cleanup] room=${code} deleted`);
  }
}

function broadcast(senderWs, data) {
  const code = senderWs._roomCode;
  if (!code || !rooms.has(code)) return;
  for (const client of rooms.get(code)) {
    if (client !== senderWs && client.readyState === 1) {
      client.send(data);
    }
  }
}

// HTTP server
const httpServer = http.createServer((req, res) => {
  // Allow all origins — needed so file:// and any website can connect
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/health" || req.url === "/") {
    const roomCount = rooms.size;
    const clientCount = [...rooms.values()].reduce((n, s) => n + s.size, 0);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Arcade relay OK\nRooms: ${roomCount}\nClients: ${clientCount}\n`);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

// WebSocket server — verifyClient accepts all origins (file://, localhost, school wifi, etc.)
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: () => true
});

wss.on("connection", (ws, req) => {
  const match = req.url.match(/\/room\/([A-Za-z0-9_-]{1,20})/);
  if (!match) {
    ws.close(4000, "No room code. Use /room/YOURCODE");
    return;
  }
  const code = match[1].toUpperCase();

  if (getRoomSize(code) >= 8) {
    ws.close(4001, "Room full");
    return;
  }

  joinRoom(code, ws);

  const size = getRoomSize(code);
  ws.send(JSON.stringify({ _type: "welcome", room: code, size }));
  broadcast(ws, JSON.stringify({ _type: "peer_joined", room: code, size }));

  ws.on("message", (data) => {
    broadcast(ws, data);
  });

  ws.on("close", () => {
    const code = ws._roomCode;
    leaveRoom(ws);
    const size = getRoomSize(code || "");
    broadcast(ws, JSON.stringify({ _type: "peer_left", room: code, size }));
  });

  ws.on("error", (err) => {
    console.error(`[error] room=${ws._roomCode} ${err.message}`);
    leaveRoom(ws);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Arcade relay listening on 0.0.0.0:${PORT}`);
});
