// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const cors = require("cors");
const crypto = require("crypto");

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

// Master key (set via env var ideally)
const MASTER_KEY = process.env.MASTER_KEY || "GalaxyGlitchYT#144";

// Chat history
let messages = [];

// Ephemeral keys
let apiKeys = {
  messages: crypto.randomBytes(16).toString("hex"),
  clear: crypto.randomBytes(16).toString("hex"),
  send: crypto.randomBytes(16).toString("hex"),
};

function regenerateKey(action, reason = "manual") {
  const oldKey = apiKeys[action];
  apiKeys[action] = crypto.randomBytes(16).toString("hex");

  console.log(`🔑 [${action.toUpperCase()}] Key rotated (${reason})`);
  console.log(`   Old: ${oldKey}`);
  console.log(`   New: ${apiKeys[action]}`);
}

// Middleware for ephemeral keys
function requireApiKey(action) {
  return (req, res, next) => {
    const key = req.headers["x-api-key"];
    if (key !== apiKeys[action]) {
      console.log(`🚫 [${action.toUpperCase()}] Invalid key attempt from ${req.ip}`);
      return res.status(403).json({ error: "Forbidden" });
    }

    console.log(`✅ [${action.toUpperCase()}] Key used successfully from ${req.ip}`);
    regenerateKey(action, "use");
    next();
  };
}

// Middleware for master key
function requireMasterKey(req, res, next) {
  const key = req.headers["x-master-key"];
  if (key !== MASTER_KEY) {
    console.log(`🚫 MASTER key invalid attempt from ${req.ip}`);
    return res.status(403).json({ error: "Forbidden" });
  }

  console.log(`✅ MASTER key used successfully from ${req.ip}`);
  next();
}

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

      // Broadcast
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

// Admin: fetch current ephemeral keys
app.get("/admin/keys", requireMasterKey, (req, res) => {
  console.log(`📥 Admin requested keys from ${req.ip}`);
  res.json(apiKeys);
});

app.get("/messages", requireApiKey("messages"), (req, res) => {
  res.json(messages);
});

app.post("/send", requireApiKey("send"), (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) return res.status(400).json({ error: "Missing user or msg" });

  const newMsg = { user, msg };
  messages.push(newMsg);

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(newMsg));
  });

  console.log(`💬 Message sent by ${user}: "${msg}"`);
  res.json({ success: true });
});

app.post("/clear", requireApiKey("clear"), (req, res) => {
  messages = [];
  console.log("🧹 Chat history cleared manually!");

  const clearMsg = { system: true, msg: "🧹 Chat history cleared by admin." };
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
  });

  res.json({ success: true });
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

// ---- Auto-rotate keys every 5 minutes ----
setInterval(() => {
  Object.keys(apiKeys).forEach(action => {
    regenerateKey(action, "timer");
  });
}, 5 * 60 * 1000);

// ---- Start server ----
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
