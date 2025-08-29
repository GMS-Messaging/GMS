import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const port = process.env.PORT || 10000;

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`🚀 Server listening on ${port}`);
});

// Attach WebSocket server
const wss = new WebSocketServer({ server });

// Broadcast helper
function broadcast(data, sender) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client !== sender) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", (msg) => {
    console.log("📩 Received:", msg.toString());

    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.user && parsed.msg) {
        // Broadcast to all other clients
        broadcast(JSON.stringify(parsed), ws);
        // Echo back to sender
        ws.send(JSON.stringify(parsed));
      } else {
        ws.send(`Echo: ${msg}`);
      }
    } catch {
      ws.send(`Echo: ${msg}`);
    }
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

// Health check route
app.get("/", (req, res) => {
  res.send("WebSocket server is running 🚀");
});
