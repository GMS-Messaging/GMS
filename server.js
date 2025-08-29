// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

let messages = []; // Store chat history

// ---- WebSocket handling ----
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  // Send recent history on connect
  ws.send(JSON.stringify({ system: true, msg: "✅ Connected to GMS WebSocket" }));
  messages.forEach((m) => ws.send(JSON.stringify(m)));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log("📩", msg);

      // Save message
      messages.push(msg);

      // Broadcast to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify(msg));
        }
      });
    } catch (err) {
      console.error("❌ Invalid message:", err);
    }
  });

  ws.on("close", () => {
    console.log("🚪 Client disconnected");
  });
});

// ---- REST fallback endpoints ----

// Get all messages
app.get("/messages", (req, res) => {
  res.json(messages);
});

// Post a new message
app.post("/send", (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) {
    return res.status(400).json({ error: "Missing user or msg" });
  }

  const newMsg = { user, msg };
  messages.push(newMsg);

  // Broadcast to WS clients too
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(newMsg));
    }
  });

  res.json({ success: true });
});

// ---- Start server ----
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
