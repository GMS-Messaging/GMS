// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");

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

// ---- Master key ----
const MASTER_KEY = process.env.MASTER_KEY;
if (!MASTER_KEY) {
  console.error("❌ MASTER_KEY not set! Exiting...");
  process.exit(1);
}

// ---- Ephemeral API keys ----
let apiKeys = {
  messages: crypto.randomBytes(32).toString("hex"),
  send: crypto.randomBytes(32).toString("hex"),
  clear: crypto.randomBytes(32).toString("hex"),
};

function regenerateKey(action, reason = "manual") {
  const oldKey = apiKeys[action];
  apiKeys[action] = crypto.randomBytes(32).toString("hex");

  console.log(`🔑 [${action.toUpperCase()}] Key rotated (${reason})`);
  console.log(`   Old: ${oldKey}`);
  console.log(`   New: ${apiKeys[action]}`);
}

// ---- Middleware ----
function requireApiKey(action) {
  return (req, res, next) => {
    const key = req.headers["x-api-key"];
    if (key !== apiKeys[action]) {
      console.log(`🚫 [${action.toUpperCase()}] Invalid key from ${req.ip}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    console.log(`✅ [${action.toUpperCase()}] Key OK from ${req.ip}`);
    regenerateKey(action, "use");
    next();
  };
}

function requireMasterKey(req, res, next) {
  const key = req.headers["x-master-key"];
  if (key !== MASTER_KEY) {
    console.log(`🚫 MASTER invalid from ${req.ip}`);
    return res.status(403).json({ error: "Forbidden" });
  }
  console.log(`✅ MASTER key OK from ${req.ip}`);
  next();
}

// ---- Chat storage ----
let messages = [];

// ---- WebSocket ----
wss.on("connection", (ws) => {
  console.log("🔌 Client connected");

  ws.send(JSON.stringify({ system: true, msg: "✅ Connected to GMS WebSocket" }));
  messages.forEach((m) => ws.send(JSON.stringify(m)));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.user && msg.msg) console.log(`💬 [${msg.user}]: ${msg.msg}`);
      else console.log("📩 Raw:", msg);

      messages.push(msg);
      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) client.send(JSON.stringify(msg));
      });
    } catch (err) {
      console.error("❌ Invalid message:", err);
    }
  });

  ws.on("close", () => console.log("🚪 Client disconnected"));
});

// ---- Routes ----

// Admin: fetch ephemeral keys (requires MASTER_KEY, not exposed to client)
app.get("/admin/keys", requireMasterKey, (req, res) => {
  res.json(apiKeys);
});

// Client bridge: only messages key
app.get("/client/keys/messages", (req, res) => {
  res.json({ key: apiKeys.messages });
});

// Fetch messages
app.get("/messages", requireApiKey("messages"), (req, res) => {
  res.json(messages);
});

// Send message
app.post("/send", requireApiKey("send"), (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) return res.status(400).json({ error: "Missing user or msg" });

  const newMsg = { user, msg };
  messages.push(newMsg);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(newMsg));
  });

  res.json({ success: true });
});

// Clear messages
app.post("/clear", requireApiKey("clear"), (req, res) => {
  messages = [];
  const clearMsg = { system: true, msg: "🧹 Chat history cleared." };
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
  });

  res.json({ success: true });
});

// Cron clear
if (cron) {
  cron.schedule(
    "0 0 * * *",
    () => {
      messages = [];
      const clearMsg = { system: true, msg: "🧹 Auto-cleared at 00:00 EST/EDT." };
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
      });
    },
    { scheduled: true, timezone: "America/New_York" }
  );
}

// Auto-rotate keys every 5 min
setInterval(() => {
  Object.keys(apiKeys).forEach((action) => regenerateKey(action, "timer"));
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
