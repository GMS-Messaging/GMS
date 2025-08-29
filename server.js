import express from "express";
import { WebSocketServer } from "ws";
import http from "http";

const app = express();
app.use(express.json());

let messages = []; // store chat history in memory

// REST endpoint: send a message
app.post("/send", (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) return res.status(400).json({ error: "Invalid payload" });

  const payload = { user, msg };
  messages.push(payload);

  // also broadcast to WebSocket clients
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  });

  res.json({ status: "ok" });
});

// REST endpoint: get messages
app.get("/messages", (req, res) => {
  res.json(messages);
});

// Setup HTTP + WS server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", ws => {
  console.log("🔌 WebSocket client connected");
  ws.on("message", msg => {
    try {
      const data = JSON.parse(msg);
      if (data.user && data.msg) {
        const payload = { user: data.user, msg: data.msg };
        messages.push(payload);

        // broadcast
        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify(payload));
          }
        });
      }
    } catch (e) {
      console.error("Bad WS message", e);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
