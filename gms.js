// GMS (Gash Messaging Software)
let consoleOutput = document.getElementById("console-output");
let inputText = document.getElementById("input-text");

let currentInput = "";
let commandHistory = [];
let historyIndex = -1;

// WebSocket globals
let gashWebSocket = null;
let gashWebSocketUrl = null;
let gashWsMessages = [];

// REST globals
let gashUseREST = false;
let gashRESTUrl = null;
let gashRESTPoller = null;
let gashNickname = "anon";

// Input handling
document.addEventListener("keydown", (event) => {
  if (event.key === "Backspace") {
    currentInput = currentInput.slice(0, -1);
  } else if (event.key.length === 1 || event.key === " ") {
    currentInput += event.key;
  } else if (event.key === "ArrowUp" && historyIndex > 0) {
    historyIndex--;
    currentInput = commandHistory[historyIndex];
  } else if (event.key === "ArrowDown") {
    if (historyIndex < commandHistory.length - 1) {
      historyIndex++;
      currentInput = commandHistory[historyIndex];
    } else {
      historyIndex = commandHistory.length;
      currentInput = "";
    }
  }

  inputText.textContent = currentInput;

  if (event.key === "Enter") {
    commandHistory.push(currentInput.trim());
    historyIndex = commandHistory.length;
    addToConsole(`${currentInput.trim()}`);
    processCommand(currentInput.trim());
    currentInput = "";
    inputText.textContent = "";
  }
});

// ---- REST HELPERS ----
async function restSendMessage(msg) {
  if (!gashRESTUrl) {
    addToConsole("> Error: REST not configured.");
    return;
  }
  await fetch(gashRESTUrl + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: gashNickname, msg })
  });
}

function startRESTPolling() {
  if (!gashRESTUrl) return;
  if (gashRESTPoller) clearInterval(gashRESTPoller);

  gashRESTPoller = setInterval(async () => {
    try {
      const res = await fetch(gashRESTUrl + "/messages");
      const msgs = await res.json();
      consoleOutput.innerHTML = ""; // clear screen each tick
      msgs.forEach(m => addToConsole(`> ${m.user}: ${m.msg}`));
    } catch (e) {
      addToConsole("> REST polling error: " + e.message);
    }
  }, 2000);

  addToConsole("> 📡 REST polling started (every 2s)");
}

// ---- COMMAND PROCESSOR ----
function processCommand(command) {
  const parts = command.split(" ");

  // ---- WEBSOCKET COMMANDS ----

    // ---- GMS SHORTCUTS ----
  if (command === "gms join") {
    // just reuse your int ws connect logic
    processCommand("int ws connect wss://gms-1-0.onrender.com");
    return;
  }

  if (command.startsWith("int ws")) {
    const subCommand = parts[2];

    if (subCommand === "connect") {
      const url = parts[3];
      if (!url) {
        addToConsole("> Error: Missing URL");
        return;
      }

      if (url.startsWith("http")) {
        // REST mode
        gashUseREST = true;
        gashRESTUrl = url;
        startRESTPolling();
        addToConsole(`> Using REST API at ${url}`);
        return;
      }

      if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
        addToConsole("> Error: Invalid WebSocket URL.");
        return;
      }

      try {
        gashWebSocket = new WebSocket(url);
        gashWebSocketUrl = url;

        gashWebSocket.onopen = () => {
          addToConsole(`> Connected to WebSocket: ${url}`);
        };

        gashWebSocket.onmessage = (event) => {
          gashWsMessages.push(event.data);
          try {
            const msg = JSON.parse(event.data);
            if (msg.user && msg.msg) {
              addToConsole(`> ${msg.user}: ${msg.msg}`);
            } else {
              addToConsole(`> WS Message: ${event.data}`);
            }
          } catch {
            addToConsole(`> WS Message: ${event.data}`);
          }
        };

        gashWebSocket.onerror = () => {
          addToConsole("> WebSocket error occurred. Switching to REST fallback.");
          gashWebSocket = null;
          gashUseREST = true;
          gashRESTUrl = url.replace(/^ws/, "http"); // ws://foo → http://foo
          startRESTPolling();
        };

        gashWebSocket.onclose = () => {
          addToConsole("> WebSocket connection closed.");
          gashWebSocket = null;
          gashWebSocketUrl = null;
        };

      } catch (e) {
        addToConsole(`> Error: ${e.message}`);
      }
    }

    else if (subCommand === "send") {
      const msg = parts.slice(3).join(" ");
      if (gashUseREST) {
        restSendMessage(msg);
        addToConsole(`> (REST) ${gashNickname}: ${msg}`);
      } else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
        gashWebSocket.send(msg);
        addToConsole(`> Sent: ${msg}`);
      } else {
        addToConsole("> Error: Not connected to a WebSocket/REST server.");
      }
    }

    else if (subCommand === "disconnect") {
      if (gashWebSocket) {
        gashWebSocket.close();
        addToConsole("> Closing WebSocket connection...");
      }
      if (gashUseREST && gashRESTPoller) {
        clearInterval(gashRESTPoller);
        addToConsole("> Stopped REST polling.");
        gashUseREST = false;
      }
    }

    else if (subCommand === "check") {
      if (gashUseREST) {
        addToConsole(`> Using REST at ${gashRESTUrl}`);
      } else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
        addToConsole(`> Connected to WS: ${gashWebSocketUrl}`);
      } else {
        addToConsole("> No active connection.");
      }
    }

    else {
      addToConsole("> Usage: int ws {connect|send|disconnect|check}");
    }
  }

  // ---- CHAT COMMANDS ----
  else if (parts[0] === "nick") {
    const newNick = parts.slice(1).join(" ");
    if (newNick) {
      gashNickname = newNick;
      addToConsole(`> Nickname set to ${gashNickname}`);
    } else {
      addToConsole(`> Current nickname: ${gashNickname}`);
    }
  }

  else if (parts[0] === "say") {
    const msg = parts.slice(1).join(" ");
    if (!msg) {
      addToConsole("> Error: No message provided.");
      return;
    }
    if (gashUseREST) {
      restSendMessage(msg);
      addToConsole(`> (REST) ${gashNickname}: ${msg}`);
    } else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
      const payload = JSON.stringify({ user: gashNickname, msg });
      gashWebSocket.send(payload);
      addToConsole(`> ${gashNickname}: ${msg}`);
    } else {
      addToConsole("> Error: Not connected to a server.");
    }
  }

  // ---- OTHER COMMANDS ----
  else if (command.startsWith("echo ")) {
    addToConsole(`> ${command.slice(5)}`);
  }

  else if (command === "help") {
    addToConsole(`> Commands:
  - echo {msg}                 Print a message
  - int ws connect {url}       Connect to WebSocket OR REST server
  - int ws send {msg}          Send raw message
  - int ws disconnect          Disconnect WebSocket/REST
  - int ws check               Show connection status
  - nick {name}                Set your nickname
  - say {msg}                  Send a chat message
  - help                       Show this help
  - clear                      Clear the console`);
  }

  else if (command === "clear") {
    consoleOutput.innerHTML = "";
  }

  else {
    addToConsole("> Unknown command");
  }
}

// Output
function addToConsole(text) {
  consoleOutput.innerHTML += `<div><span>GMS $ </span> ${text}</div>`;
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}
