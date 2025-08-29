import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const port = process.env.PORT || 10000; // Render assigns PORT

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`🚀 Server listening on ${port}`);
});

// Attach WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  ws.on("message", (msg) => {
    console.log("📩 Received:", msg.toString());
    ws.send(`Echo: ${msg}`);
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });
});

// Optional health check route
app.get("/", (req, res) => {
  res.send("WebSocket server is running 🚀");
});
