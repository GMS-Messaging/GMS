// server.js
const express = require("express");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 10000;
const app = express();

// --- HTTP route so the Render URL shows something ---
app.get("/", (req, res) => {
  res.send("✅ GMS WebSocket server is running!");
});

// --- Start HTTP server ---
const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});

// --- Attach WebSocket server ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🌐 New WebSocket connection");

  // Send greeting when someone connects
  ws.send("👋 Hello from GMS WebSocket server!");

  // Handle incoming messages
  ws.on("message", (message) => {
    console.log("📩 Received:", message.toString());

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === ws.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on("close", () => {
    console.log("❌ WebSocket closed");
  });
});
