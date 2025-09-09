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

// ---- Upload handling ----
const UPLOAD_DIR = "/tmp/uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

// File upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  const ext = path.extname(req.file.originalname);
  const newPath = path.join(UPLOAD_DIR, req.file.filename + ext);

  fs.renameSync(req.file.path, newPath);

  const url = `/uploads/${path.basename(newPath)}`;
  console.log(`📷 File uploaded: ${url}`);

  res.json({ url });
});

// Serve uploaded files
app.use("/uploads", express.static(UPLOAD_DIR));

// ---- In-memory state ----
let messages = []; // Store chat history
let connectedUsers = 0; // Track connected clients

// ---- WebSocket handling ----
wss.on("connection", (ws) => {
  connectedUsers++;
  console.log(`🔌 Client connected (${connectedUsers} online)`);

  ws.send(JSON.stringify({ system: true, msg: "✅ Connected to GMS WebSocket" }));
  messages.forEach((m) => ws.send(JSON.stringify(m)));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === "users") {
        ws.send(JSON.stringify({ type: "users", count: connectedUsers }));
        return;
      }

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

  ws.on("close", () => {
    connectedUsers--;
    console.log(`🚪 Client disconnected (${connectedUsers} left)`);
  });
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

  // Also clear uploads
  try {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log("🖼️ Uploads cleared!");
  } catch (err) {
    console.error("❌ Failed to clear uploads:", err);
  }

  res.json({ success: true, msg: "Chat history + uploads cleared" });
});

app.get("/users", (req, res) => {
  res.json({ count: connectedUsers });
});

// ---- Cron job: clear chat + uploads at 00:00 EST/EDT ----
if (cron) {
  cron.schedule(
    "0 0 * * *",
    () => {
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
      wss.clients.forEach((client) => {
        if (client.readyState === 1) client.send(JSON.stringify(clearMsg));
      });
    },
    {
      scheduled: true,
      timezone: "America/New_York",
    }
  );
}

// ---- Start server ----
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
