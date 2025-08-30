// GMS (Gash Messaging Software)
let consoleOutput = document.getElementById("console-output");
let inputText = document.getElementById("input-text");

let currentInput = "";
let cursorIndex = 0;
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
function safeHTML(str){ return DOMPurify.sanitize(str); }

// Join presets
const joinPresets = { gms: "wss://gms-1-0.onrender.com" };

// Input rendering
function renderInput(){
  const before=currentInput.slice(0,cursorIndex);
  const after=currentInput.slice(cursorIndex);
  inputText.innerHTML="";
  const spanBefore=document.createTextNode(before);
  const caretSpan=document.createElement("span");
  caretSpan.id="caret"; caretSpan.textContent="█";
  const spanAfter=document.createTextNode(after);
  inputText.appendChild(spanBefore);
  inputText.appendChild(caretSpan);
  inputText.appendChild(spanAfter);
}

// Key handling
document.addEventListener("keydown", (event) => {
  if(event.key==="Backspace"){ if(cursorIndex>0){ currentInput=currentInput.slice(0,cursorIndex-1)+currentInput.slice(cursorIndex); cursorIndex--; } }
  else if(event.key==="Delete"){ if(cursorIndex<currentInput.length) currentInput=currentInput.slice(0,cursorIndex)+currentInput.slice(cursorIndex+1); }
  else if(event.key.length===1 && !event.ctrlKey && !event.metaKey){ currentInput=currentInput.slice(0,cursorIndex)+event.key+currentInput.slice(cursorIndex); cursorIndex++; }
  else if(event.key==="ArrowLeft"){ if(cursorIndex>0)cursorIndex--; }
  else if(event.key==="ArrowRight"){ if(cursorIndex<currentInput.length)cursorIndex++; }
  else if(event.key==="ArrowUp"){ if(historyIndex>0){historyIndex--; currentInput=commandHistory[historyIndex]; cursorIndex=currentInput.length;} }
  else if(event.key==="ArrowDown"){ if(historyIndex<commandHistory.length-1){historyIndex++; currentInput=commandHistory[historyIndex];} else{historyIndex=commandHistory.length; currentInput="";} cursorIndex=currentInput.length; }

  renderInput();

  if(event.key==="Enter"){
    const trimmed=currentInput.trim();
    if(!trimmed){ currentInput=""; cursorIndex=0; renderInput(); return; }
    commandHistory.push(trimmed);
    historyIndex=commandHistory.length;

    const parts = trimmed.split(" ");
    const nonChatCommands = ["int","join","nick","echo","help","clear","autosay"];
    if(gashAutoSay && !nonChatCommands.includes(parts[0])){
      processCommand("say "+trimmed);
    } else { 
      processCommand(trimmed); 
    }

    currentInput=""; cursorIndex=0; renderInput();
  }
});

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

  // JOIN preset
  if(parts[0]==="join"){
    const target=parts[1];
    if(!target) return addToConsole("> Error: Missing server/preset name");
    const url = joinPresets[target] || target;
    processCommand(`int ws connect ${url}`);
    return;
  }

  // Always-working commands
  if(parts[0]==="nick"){
    const newNick=parts.slice(1).join(" ");
    if(newNick){ gashNickname=newNick; addToConsole(`> Nickname set to ${safeHTML(gashNickname)}`);}
    else addToConsole(`> Current nickname: ${safeHTML(gashNickname)}`);
    return;
  }

  if(command.startsWith("echo ")){ addToConsole(`> ${safeHTML(command.slice(5))}`); return; }
  if(command==="help"){ addToConsole(`> Commands:
  - join {preset|url}        Connect to server or preset
  - int ws connect {url}     Connect to WS/REST server
  - int ws send {msg}        Send raw message
  - int ws disconnect        Disconnect WebSocket/REST
  - int ws check             Show connection status
  - nick {name}              Set your nickname
  - say {msg}                Send a chat message
  - autosay on/off           Toggle auto-say mode
  - echo {msg}               Print message
  - clear                    Clear console
  - help                     Show this help`); return; }
  if(command==="clear"){ consoleOutput.innerHTML=""; return; }
  if(parts[0]==="autosay"){ gashAutoSay=(parts[1]==="on"); addToConsole(`> Auto-say: ${gashAutoSay?"ON":"OFF"}`); return; }

  // WebSocket / REST commands
  if(command.startsWith("int ws")){
    const subCommand=parts[2];
    if(subCommand==="connect"){
      const url=parts[3];
      if(!url) return addToConsole("> Error: Missing URL");
      if(url.startsWith("http")){ gashUseREST=true; gashRESTUrl=url; startRESTPolling(); addToConsole(`> Using REST API at ${url}`); return; }
      if(!url.startsWith("ws://") && !url.startsWith("wss://")) return addToConsole("> Error: Invalid WebSocket URL.");
      try{
        gashWebSocket=new WebSocket(url);
        gashWebSocketUrl=url;
        gashWebSocket.onopen=()=>addToConsole(`> Connected to WebSocket: ${url}`);
        gashWebSocket.onmessage=(event)=>{
          try{ const msg=JSON.parse(event.data); if(msg.user && msg.msg) addToConsole(`> ${safeHTML(msg.user)}: ${safeHTML(msg.msg)}`); else addToConsole(`> WS: ${safeHTML(event.data)}`); }
          catch{ addToConsole(`> WS: ${safeHTML(event.data)}`); }
        };
        gashWebSocket.onerror=()=>{ addToConsole("> WebSocket error. Switching to REST fallback."); gashWebSocket=null; gashUseREST=true; gashRESTUrl=url.replace(/^ws/,"http"); startRESTPolling(); };
        gashWebSocket.onclose=()=>{ addToConsole("> WebSocket closed."); gashWebSocket=null; gashWebSocketUrl=null; };
      }catch(e){ addToConsole(`> Error: ${e.message}`); }
      return;
    }
    else if(subCommand==="send"){ const msg=parts.slice(3).join(" "); if(gashUseREST){ restSendMessage(msg); addToConsole(`> (REST) ${gashNickname}: ${safeHTML(msg)}`); } else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(msg); addToConsole(`> Sent: ${safeHTML(msg)}`); } else addToConsole("> Error: Not connected."); return; }
    else if(subCommand==="disconnect"){ if(gashWebSocket){ gashWebSocket.close(); addToConsole("> Closing WebSocket..."); } if(gashUseREST && gashRESTPoller){ clearInterval(gashRESTPoller); addToConsole("> Stopped REST polling."); gashUseREST=false; } return; }
    else if(subCommand==="check"){ if(gashUseREST) addToConsole(`> Using REST at ${gashRESTUrl}`); else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN) addToConsole(`> Connected to WS: ${gashWebSocketUrl}`); else addToConsole("> No active connection."); return; }
    else { addToConsole("> Usage: int ws {connect|send|disconnect|check}"); return; }
  }

  // SAY command
  if(parts[0]==="say"){
    const msg=parts.slice(1).join(" ");
    if(!msg) return addToConsole("> Error: No message.");
    if(gashUseREST){ restSendMessage(msg); addToConsole(`> (REST) ${gashNickname}: ${safeHTML(msg)}`); }
    else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(JSON.stringify({user:gashNickname,msg})); addToConsole(`> ${gashNickname}: ${safeHTML(msg)}`); }
    else addToConsole("> Error: Not connected to a server.");
    return;
  }

  addToConsole("> Unknown command");
}

// Console output
function addToConsole(text){
  consoleOutput.innerHTML += `<div>${safeHTML(text)}</div>`;
  consoleOutput.scrollTop=consoleOutput.scrollHeight;
}

// Initial render
renderInput();
