const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const bodyParser = require("body-parser");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let messages = []; // store chat messages

// Middleware
app.use(bodyParser.json());

// REST endpoint: get all messages
app.get("/messages", (req, res) => {
  res.json(messages);
});

// REST endpoint: send a message
app.post("/send", (req, res) => {
  const { user, msg } = req.body;
  if (!user || !msg) {
    return res.status(400).json({ error: "Missing user or msg" });
  }

  const newMsg = { user, msg };
  messages.push(newMsg);

  // also broadcast to WS clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(newMsg));
    }
  });

  res.json({ success: true });
});

// WebSocket handling
wss.on("connection", (ws) => {
  console.log("⚡ New WebSocket connection");

  ws.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      messages.push(parsed);

      // broadcast
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsed));
        }
      });
    } catch (err) {
      console.error("Invalid message:", msg);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server listening on ${PORT}`));
