// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const cors = require("cors");

console.log("hello from o-o-o ohio!")

// Try to load node-cron
let cron;
try {
  cron = require("node-cron");
  console.log("🟢 node-cron loaded successfully");
} catch (err) {
  console.error("❌ Failed to load node-cron:", err);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

let messages = []; // Store chat history

// ---- WebSocket handling ----
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  // Send welcome & recent history
  ws.send(JSON.stringify({ system: true, msg: "✅ Connected to GMS WebSocket" }));
  messages.forEach((m) => ws.send(JSON.stringify(m)));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.user && msg.msg) console.log(`💬 [${msg.user}]: ${msg.msg}`);
      else console.log("📩 Raw:", msg);

      messages.push(msg);

      // Broadcast to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) client.send(JSON.stringify(msg));
      });
    } catch (err) {
      console.error("❌ Invalid message:", err);
    }
  });

  ws.on("close", () => console.log("🚪 Client disconnected"));
});

// ---- REST endpoints ----
app.get("/messages", (req, res) => res.json(messages));

app.post("/send", (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) return res.status(400).json({ error: "Missing user or msg" });

  const newMsg = { user, msg };
  console.log(`💬 [${user}]: ${msg}`);
  messages.push(newMsg);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(newMsg));
  });

  res.json({ success: true });
});

app.post("/clear", (req, res) => {
  messages = [];
  console.log("🧹 Chat history cleared!");

  const clearMsg = { system: true, msg: "🧹 Chat history has been cleared." };
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
  });

  res.json({ success: true, msg: "Chat history cleared" });
});

// ---- Cron job: clear chat every day at 00:00 EST/EDT ----
if (cron) {
  cron.schedule('0 0 * * *', () => {
    messages = [];
    console.log("🧹 Chat history automatically cleared at 00:00 EST/EDT!");

    const clearMsg = { system: true, msg: "🧹 Chat history automatically cleared (00:00 EST/EDT)." };
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
    });
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
}

// ---- Start server ----
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
