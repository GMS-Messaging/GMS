// GMS (Gash Messaging Software)
let consoleOutput = document.getElementById("console-output");
let inputText = document.getElementById("input-text");

let currentInput = "";
let cursorIndex = 0; // caret position
let commandHistory = [];
let historyIndex = -1;

// WebSocket / REST
let gashWebSocket = null;
let gashWebSocketUrl = null;
let gashWsMessages = [];
let gashUseREST = false;
let gashRESTUrl = null;
let gashRESTPoller = null;
let lastRestMsgCount = 0;
let gashNickname = "anon";
let gashAutoSay = true;

// DOMPurify helper
function safeHTML(str) { return DOMPurify.sanitize(str); }

// Input handling
document.addEventListener("keydown", (event) => {
  if (event.key === "Backspace") {
    if (cursorIndex > 0) {
      currentInput = currentInput.slice(0,cursorIndex-1)+currentInput.slice(cursorIndex);
      cursorIndex--;
    }
  } else if (event.key === "Delete") {
    if (cursorIndex < currentInput.length) currentInput = currentInput.slice(0,cursorIndex)+currentInput.slice(cursorIndex+1);
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
    currentInput = currentInput.slice(0,cursorIndex)+event.key+currentInput.slice(cursorIndex);
    cursorIndex++;
  } else if (event.key === "ArrowLeft") { if(cursorIndex>0)cursorIndex--; }
  else if (event.key === "ArrowRight") { if(cursorIndex<currentInput.length)cursorIndex++; }
  else if (event.key === "ArrowUp" && historyIndex>0) { historyIndex--; currentInput=commandHistory[historyIndex]; cursorIndex=currentInput.length; }
  else if (event.key === "ArrowDown") { if(historyIndex<commandHistory.length-1){historyIndex++; currentInput=commandHistory[historyIndex];} else {historyIndex=commandHistory.length; currentInput="";} cursorIndex=currentInput.length; }

  renderInput();

  if (event.key === "Enter") {
    const trimmed = currentInput.trim();
    if(!trimmed){ currentInput=""; cursorIndex=0; renderInput(); return; }

    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;

    if(gashAutoSay && !trimmed.startsWith("say") && !trimmed.startsWith("int") && !trimmed.startsWith("join")){
      processCommand("say "+trimmed);
    } else { processCommand(trimmed); }

    currentInput=""; cursorIndex=0; renderInput();
  }
});

function renderInput(){
  const before=currentInput.slice(0,cursorIndex);
  const after=currentInput.slice(cursorIndex);
  inputText.innerHTML = safeHTML(before)+`<span id="caret">█</span>`+safeHTML(after);
}

// REST helpers
async function restSendMessage(msg){
  if(!gashRESTUrl){ addToConsole("> Error: REST not configured."); return; }
  await fetch(gashRESTUrl+"/send",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:gashNickname,msg})});
}

function startRESTPolling(){
  if(!gashRESTUrl) return;
  if(gashRESTPoller) clearInterval(gashRESTPoller);

  gashRESTPoller=setInterval(async()=>{
    try{
      const res=await fetch(gashRESTUrl+"/messages");
      const msgs=await res.json();
      if(msgs.length>lastRestMsgCount){
        msgs.slice(lastRestMsgCount).forEach(m=>addToConsole(`> ${safeHTML(m.user)}: ${safeHTML(m.msg)}`));
        lastRestMsgCount=msgs.length;
      }
    }catch(e){ addToConsole("> REST polling error: "+e.message); }
  },2000);
  addToConsole("> 📡 REST polling started (every 2s)");
}

// Command processor
function processCommand(command){
  const parts=command.split(" ");

  if(command==="gms join"){ processCommand("join wss://gms-1-0.onrender.com"); return; }

  if(parts[0]==="join"){ const url=parts[1]; if(!url)return addToConsole("> Error: Missing URL"); processCommand(`int ws connect ${url}`); return; }

  if(command.startsWith("int ws")){
    const subCommand=parts[2];
    if(subCommand==="connect"){
      const url=parts[3]; if(!url)return addToConsole("> Error: Missing URL");
      if(url.startsWith("http")){ gashUseREST=true; gashRESTUrl=url; startRESTPolling(); addToConsole(`> Using REST API at ${url}`); return; }
      if(!url.startsWith("ws://") && !url.startsWith("wss://")) return addToConsole("> Error: Invalid WebSocket URL.");
      try{
        gashWebSocket=new WebSocket(url);
        gashWebSocketUrl=url;
        gashWebSocket.onopen=()=>addToConsole(`> Connected to WebSocket: ${url}`);
        gashWebSocket.onmessage=(event)=>{try{ const msg=JSON.parse(event.data); if(msg.user&&msg.msg){addToConsole(`> ${safeHTML(msg.user)}: ${safeHTML(msg.msg)}`);} else addToConsole(`> WS: ${safeHTML(event.data)}`);}catch{addToConsole(`> WS: ${safeHTML(event.data)}`);}};
        gashWebSocket.onerror=()=>{addToConsole("> WebSocket error. Switching to REST fallback."); gashWebSocket=null; gashUseREST=true; gashRESTUrl=url.replace(/^ws/,"http"); startRESTPolling();};
        gashWebSocket.onclose=()=>{addToConsole("> WebSocket closed."); gashWebSocket=null; gashWebSocketUrl=null;};
      }catch(e){ addToConsole(`> Error: ${e.message}`); }
    } else if(subCommand==="send"){
      const msg=parts.slice(3).join(" ");
      if(gashUseREST){ restSendMessage(msg); addToConsole(`> (REST) ${gashNickname}: ${safeHTML(msg)}`); }
      else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(msg); addToConsole(`> Sent: ${safeHTML(msg)}`); }
      else addToConsole("> Error: Not connected.");
    } else if(subCommand==="disconnect"){
      if(gashWebSocket){ gashWebSocket.close(); addToConsole("> Closing WebSocket..."); }
      if(gashUseREST && gashRESTPoller){ clearInterval(gashRESTPoller); addToConsole("> Stopped REST polling."); gashUseREST=false; }
    } else if(subCommand==="check"){
      if(gashUseREST) addToConsole(`> Using REST at ${gashRESTUrl}`);
      else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN) addToConsole(`> Connected to WS: ${gashWebSocketUrl}`);
      else addToConsole("> No active connection.");
    }
  }

  else if(parts[0]==="nick"){ const newNick=parts.slice(1).join(" "); if(newNick){gashNickname=newNick; addToConsole(`> Nickname set to ${safeHTML(gashNickname)}`);} else addToConsole(`> Current nickname: ${safeHTML(gashNickname)}`); }

  else if(parts[0]==="say"){ const msg=parts.slice(1).join(" "); if(!msg)return addToConsole("> Error: No message."); if(gashUseREST){ restSendMessage(msg); addToConsole(`> (REST) ${gashNickname}: ${safeHTML(msg)}`);} else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(JSON.stringify({user:gashNickname,msg})); addToConsole(`> ${gashNickname}: ${safeHTML(msg)}`);} else addToConsole("> Error: Not connected."); }

  else if(parts[0]==="autosay"){ const arg=parts[1]; if(arg==="on")gashAutoSay=true; else if(arg==="off")gashAutoSay=false; addToConsole(`> Auto-say: ${gashAutoSay?"ON":"OFF"}`); }

  else if(command.startsWith("echo ")) addToConsole(`> ${safeHTML(command.slice(5))}`);

  else if(command==="help") addToConsole(`> Commands:
  - join {url}              Connect to server
  - leave                   Disconnect
  - say {msg}               Send a chat message
  - autosay on/off          Toggle auto-say mode
  - nick {name}             Set nickname
  - status                  Show connection status
  - echo {msg}              Print message
  - help                    Show this help
  - clear                   Clear console`);

  else if(command==="clear") consoleOutput.innerHTML="";

  else addToConsole("> Unknown command");
}

// Console output
function addToConsole(text){
  consoleOutput.innerHTML += `<div>${safeHTML(text)}</div>`;
  consoleOutput.scrollTop=consoleOutput.scrollHeight;
}

// Initial render
renderInput();
