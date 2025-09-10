// server.js
const express = require("express");
const { WebSocketServer } = require("ws");
const http = require("http");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

console.log("hello from o-o-o ohio!");

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

// ---- Upload handling (temp dir) ----
const UPLOAD_DIR = "/tmp/uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only images are allowed!"));
  },
});

// ---- In-memory state ----
let messages = [];             // Chat history
const activeUsers = new Set(); // Track all active users (WS + REST)

// ---- Helper ----
function generateUserId() {
  return Math.random().toString(36).substring(2, 10);
}

// ---- WebSocket handling ----
wss.on("connection", (ws) => {
  const wsId = generateUserId();
  activeUsers.add(wsId);
  console.log(`🔌 Client connected (${activeUsers.size} online)`);

  ws.send(JSON.stringify({ system: true, msg: "✅ Connected to GMS WebSocket" }));
  messages.forEach(m => ws.send(JSON.stringify(m)));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "users") {
        ws.send(JSON.stringify({ type: "users", count: activeUsers.size }));
        return;
      }

      if (msg.user && msg.msg) console.log(`💬 [${msg.user}]: ${msg.msg}`);
      else console.log("📩 Raw:", msg);

      messages.push(msg);

      wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) client.send(JSON.stringify(msg));
      });
    } catch (err) {
      console.error("❌ Invalid message:", err);
    }
  });

  ws.on("close", () => {
    activeUsers.delete(wsId);
    console.log(`🚪 Client disconnected (${activeUsers.size} left)`);
  });
});

// ---- REST endpoints ----

// Send chat message
app.post("/send", (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) return res.status(400).json({ error: "Missing user or msg" });

  const newMsg = { user, msg };
  messages.push(newMsg);

  // Track REST user
  activeUsers.add(user);

  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(newMsg));
  });

  res.json({ success: true });
});

// Get all messages
app.get("/messages", (req, res) => res.json(messages));

// Clear chat + uploads
app.post("/clear", (req, res) => {
  messages = [];
  console.log("🧹 Chat history cleared!");

  const clearMsg = { system: true, msg: "🧹 Chat history has been cleared." };
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
  });

  try {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log("🖼️ Uploads cleared!");
  } catch (err) {
    console.error("❌ Failed to clear uploads:", err);
  }

  res.json({ success: true, msg: "Chat history + uploads cleared" });
});

// Get active user count
app.get("/users", (req, res) => {
  res.json({ count: activeUsers.size });
});

// ---- Base64 file upload ----
app.post("/upload-base64", upload.single("file"), (req, res) => {
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    let ext = path.extname(req.file.originalname).substring(1).toLowerCase();

    if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      ext = "png"; // fallback
    }

    const base64Data = `data:image/${ext};base64,${fileBuffer.toString("base64")}`;
    fs.unlinkSync(req.file.path); // cleanup temp file

    console.log(`📷 File uploaded as base64 (${req.file.originalname}, type: ${ext})`);
    res.json({ base64: base64Data, type: ext });
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ---- Cron job: clear chat + uploads at 00:00 EST/EDT ----
if (cron) {
  cron.schedule("0 0 * * *", () => {
    messages = [];
    console.log("🧹 Chat history automatically cleared at 00:00 EST/EDT!");

    try {
      fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      console.log("🖼️ Uploads cleared automatically!");
    } catch (err) {
      console.error("❌ Failed to clear uploads:", err);
    }

    const clearMsg = {
      system: true,
      msg: "🧹 Chat history + uploads automatically cleared (00:00 EST/EDT).",
    };
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
    });
  }, { scheduled: true, timezone: "America/New_York" });
}

// ---- Start server ----
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
