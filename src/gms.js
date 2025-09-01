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
let gashUseREST = false;
let gashRESTUrl = null;
let gashRESTPoller = null;
let lastRestMsgCount = 0;
let gashNickname = "anon";
let gashAutoSay = true;
let gashUserId = "user_" + Math.random().toString(36).substr(2, 9);
let gashCurrentTheme = "default";

// Safe text sanitization
function sanitizeText(str){
  if(typeof str !== 'string') return '';
  return DOMPurify.sanitize(str, {ALLOWED_TAGS: [], ALLOWED_ATTR: []});
}

// Validate message object from server
function validateMessage(msg){
  if(!msg || typeof msg !== 'object') return null;
  if(!msg.user || !msg.msg) return null;
  if(typeof msg.user !== 'string' || typeof msg.msg !== 'string') return null;
  if(msg.user.trim() === '' || msg.msg.trim() === '') return null;
  if(msg.user.length > 50 || msg.msg.length > 1000) return null;
  return {
    user: sanitizeText(msg.user),
    msg: sanitizeText(msg.msg),
    userId: msg.userId || null
  };
}

// Join presets
const joinPresets = { gms: "wss://gms-1-0.onrender.com"};

// Available themes
const availableThemes = {
  default: "theme-default",
  light: "theme-light",
  blue: "theme-blue",
  red: "theme-red",
  purple: "theme-purple",
  green: "theme-green",
  yellow: "theme-yellow",
  pink: "theme-pink",
  midnight: "theme-midnight",
  abyss: "theme-abyss"
};

// Apply theme
function applyTheme(themeName) {
  Object.values(availableThemes).forEach(c => document.body.classList.remove(c));
  if(availableThemes[themeName]){
    document.body.classList.add(availableThemes[themeName]);
    gashCurrentTheme = themeName;
    applyThemeCSS(themeName);
  }
}

// Theme CSS overrides
function applyThemeCSS(themeName){
  const existingStyle = document.getElementById('theme-overrides');
  if(existingStyle) existingStyle.remove();

  const style = document.createElement('style');
  style.id = 'theme-overrides';

  let css = '';
  switch(themeName){
    case 'light':
      css = `
        .command-output { color: #333 !important; }
        .error-output { color: #CC0000 !important; }
        .help-output { color: #0066CC !important; }
        .misc-output { color: #666 !important; opacity:75%; }
        .misc-urgent-output { color: #CC3333 !important; opacity:75%; }
        #input-text, #caret { color: #333 !important; }
        #prompt { background:#f0f0f0; color:#333; padding:4px; border-top:1px solid #ccc; }
      `;
      break;

    case 'default': case 'green':
      css = `
        .command-output { color: #0F0 !important; }
        .error-output { color: red !important; }
        .help-output { color: #0FF !important; }
        .misc-output { color: #9e9e9e !important; opacity:75%; }
        .misc-urgent-output { color: #f55 !important; opacity:75%; }
        #input-text, #caret { color: #0F0 !important; }
        #prompt { background:#000; color:#0F0; padding:4px; border-top:1px solid #333; }
      `;
      break;

    case 'blue':
      css = `
        .command-output { color: #1E90FF !important; }
        .error-output { color: #F66 !important; }
        .help-output { color: #0FF !important; }
        .misc-output { color: #AAA !important; opacity:75%; }
        .misc-urgent-output { color: #f55 !important; opacity:75%; }
        #input-text, #caret { color: #1E90FF !important; }
        #prompt { background:#001122; color:#1E90FF; padding:4px; border-top:1px solid #223; }
        ::selection{background-color: #1390FF; color: #b8b5fbff;}
      `;
      break;

    case 'red':
      css = `
        .command-output { color: #F30 !important; }
        .error-output { color: #F66 !important; }
        .help-output { color: #0FF !important; }
        .misc-output { color: #AAA !important; opacity:75%; }
        .misc-urgent-output { color: #F88 !important; opacity:75%; }
        #input-text, #caret { color: #F30 !important; }
        #prompt { background:#220000; color:#F30; padding:4px; border-top:1px solid #400; }
        ::selection{background-color: #f30; color: #000;}
      `;
      break;

    case 'purple':
      css = `
        .command-output { color: #B6B !important; }
        .error-output { color: #F66 !important; }
        .help-output { color: #0FF !important; }
        .misc-output { color: #AAA !important; opacity:75%; }
        .misc-urgent-output { color: #f55 !important; opacity:75%; }
        #input-text, #caret { color: #B6B !important; }
        #prompt { background:#110011; color:#B6B; padding:4px; border-top:1px solid #313; }
        ::selection{background-color: #8e0790ff; color: #be5cffff;}
      `;
      break;

    case 'yellow':
      css = `
        .command-output { color: #FFD700 !important; }  
        .error-output { color: #FF6347 !important; }    
        .help-output { color: #FFFF66 !important; }      
        .misc-output { color: #CCCC66 !important; opacity:75%; }
        .misc-urgent-output { color: #FFAA00 !important; opacity:75%; }
        #input-text, #caret { color: #FFD700 !important; }
        #prompt { background: #332B00; color: #FFD700; padding:4px; border-top:1px solid #665500; }
        ::selection{background-color: #a8b700ff; color: #000;}
      `;
      break;
        
     case 'pink':
      css = `
        .command-output { color: #FF69B4 !important; }   /* hot pink */
        .error-output { color: #FF3366 !important; }     /* strong pink-red for errors */
        .help-output { color: #FFB6C1 !important; }      /* light pink */
        .misc-output { color: #FF99CC !important; opacity:75%; }
        .misc-urgent-output { color: #FF0066 !important; opacity:75%; }
        #input-text, #caret { color: #FF69B4 !important; }
        #prompt { background: #33001A; color: #FF69B4; padding:4px; border-top:1px solid #660033; }
        ::selection{background-color: #ff136aff; color: #f5f5f5;}
      `;
      break;

    case 'midnight':
       css = `
         .command-output { color: #A59AFF !important; }       /* soft purple for normal output */
         .error-output { color: #FF6B6B !important; }         /* soft red for errors */
        .help-output { color: #D8BFFF !important; }          /* light purple for help */
        .misc-output { color: #BFAFFF !important; opacity:75%; }   /* muted purple for misc */
        .misc-urgent-output { color: #FF99FF !important; opacity:75%; } /* neon purple for urgent misc */
        #input-text, #caret { color: #A59AFF !important; }   /* match command output */
         #prompt { background: linear-gradient(to bottom, #1B003F, #2E0057, #3A006E); 
                  color: #A59AFF; padding:4px; border-top:1px solid #4B0082; }
        ::selection{background-color: #3b0483ff; color: #b8b5fbff;}
      `;
      break;
  
    case 'abyss':
       css = `
          .command-output { color: #080a45 !important; }   
          .error-output { color: #0c0f55 !important; }     
          .help-output { color: #181932 !important; }     
          .misc-output { color: #212242 !important; opacity:75%; }
          .misc-urgent-output { color: #1c215c !important; opacity:75%; }
          #input-text, #caret { color: #141a5f !important; }
          #prompt { background: #02041d; color: #1b2067; padding:4px; border-top:1px solid #660033; }
        ::selection{background-color: #02041d; color: #b8b5fbff;}
        `;
        break;


  }

  style.textContent = css;
  document.head.appendChild(style);
}


// Render input with caret
function renderInput(){
  const before = currentInput.slice(0, cursorIndex);
  const after = currentInput.slice(cursorIndex);
  inputText.textContent = "";
  inputText.appendChild(document.createTextNode(before));

  const caretSpan = document.createElement("span");
  caretSpan.id = "caret";
  caretSpan.textContent = "█";
  inputText.appendChild(caretSpan);

  inputText.appendChild(document.createTextNode(after));
}

// Key handling
document.addEventListener("keydown", event => {
  if(event.key === "Backspace" && cursorIndex>0){
    currentInput = currentInput.slice(0,cursorIndex-1)+currentInput.slice(cursorIndex);
    cursorIndex--;
  } else if(event.key === "Delete" && cursorIndex<currentInput.length){
    currentInput = currentInput.slice(0,cursorIndex)+currentInput.slice(cursorIndex+1);
  } else if(event.key.length===1 && !event.ctrlKey && !event.metaKey){
    currentInput = currentInput.slice(0,cursorIndex)+event.key+currentInput.slice(cursorIndex);
    cursorIndex++;
  } else if(event.key==="ArrowLeft" && cursorIndex>0) cursorIndex--;
  else if(event.key==="ArrowRight" && cursorIndex<currentInput.length) cursorIndex++;
  else if(event.key==="ArrowUp" && historyIndex>0){
    historyIndex--; currentInput = commandHistory[historyIndex]; cursorIndex=currentInput.length;
  } else if(event.key==="ArrowDown"){
    if(historyIndex<commandHistory.length-1){ historyIndex++; currentInput=commandHistory[historyIndex]; }
    else { historyIndex = commandHistory.length; currentInput=""; }
    cursorIndex = currentInput.length;
  }

  renderInput();

  if(event.key==="Enter"){
    const trimmed = currentInput.trim();
    if(!trimmed){ currentInput=""; cursorIndex=0; renderInput(); return; }
    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;

    const nonChatCommands = ["join","nick","echo","help","clear","autosay","say","theme","gms","uid"];
    if(gashAutoSay && !nonChatCommands.includes(trimmed.split(" ")[0].toLowerCase())){
      processCommand("say "+trimmed);
    } else processCommand(trimmed);

    currentInput=""; cursorIndex=0; renderInput();
  }
});

// REST helpers
async function restSendMessage(msg){
  if(!gashRESTUrl){ addToConsole("> Error: REST not configured.", "error-output"); return; }
  const sanitizedMsg = sanitizeText(msg);
  await fetch(gashRESTUrl+"/send", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({user:gashNickname, msg:sanitizedMsg, userId:gashUserId})
  });
}

function startRESTPolling(){
  if(!gashRESTUrl) return;
  if(gashRESTPoller) clearInterval(gashRESTPoller);

  gashRESTPoller = setInterval(async ()=>{
    try{
      const res = await fetch(gashRESTUrl+"/messages");
      const msgs = await res.json();
      if(Array.isArray(msgs) && msgs.length>lastRestMsgCount){
        msgs.slice(lastRestMsgCount).forEach(rawMsg=>{
          const msg = validateMessage(rawMsg);
          if(msg && msg.userId!==gashUserId) addToConsole(`> ${msg.user}: ${msg.msg}`, "command-output");
        });
        lastRestMsgCount = msgs.length;
      }
    } catch(e){ addToConsole("> REST polling error: "+sanitizeText(e.message),"error-output"); }
  }, 2000);
  addToConsole("> 📡 REST polling started (every 2s)","misc-output");
}

// Command processor
function processCommand(command){
  const parts = command.split(" ");
  const cmd = parts[0];

  if(cmd === "join"){
    const target = parts[1];
    if(!target) return addToConsole("> Error: Missing server/preset name", "error-output");
    const url = joinPresets[target] || target;
    processCommand(`gms connect ${url}`);
    return;
  }

  if(cmd === "nick"){
    const newNick = parts.slice(1).join(" ");
    if(newNick){ gashNickname = sanitizeText(newNick); addToConsole(`> Nickname set to ${gashNickname}`,"command-output"); }
    else addToConsole(`> Current nickname: ${gashNickname}`,"command-output");
    return;
  }

  if(cmd === "echo"){ addToConsole(`> ${sanitizeText(parts.slice(1).join(" "))}`,"command-output"); return; }

  if(cmd === "uid"){
  addToConsole(`> User ID: ${gashUserId}`, "command-output");
  return;
}


  if(cmd === "help"){ 
    addToConsole(`> Commands:
  - join {preset|url}        Connect to server
  - gms connect {url}        Connect WS/REST
  - gms send {msg}           Send raw message
  - gms disconnect           Disconnect WS/REST
  - gms check                Show connection status
  - nick {name}              Set nickname
  - say {msg}                Send chat message
  - autosay on/off           Toggle auto-say
  - theme {name}             Change theme (default/light/blue/red/purple/green/yellow/pink/midnight/abyss)
  - echo {msg}               Print message
  - clear                    Clear console
  - help                     Show this help`, "help-output");
    return;
  }

  if(cmd === "clear"){ consoleOutput.textContent=""; return; }
  if(cmd === "autosay"){ gashAutoSay = (parts[1]==="on"); addToConsole(`> Auto-say: ${gashAutoSay?"ON":"OFF"}`,"command-output"); return; }

  if(cmd === "theme"){
    const themeName = parts[1];
    if(!themeName){
      addToConsole(`> Current theme: ${gashCurrentTheme}`,"command-output");
      addToConsole(`> Available themes: ${Object.keys(availableThemes).join(", ")}`,"command-output");
      return;
    }
    if(availableThemes[themeName]){ applyTheme(themeName); addToConsole(`> Theme changed to: ${themeName}`,"command-output"); }
    else addToConsole(`> Error: Unknown theme '${themeName}'`,"error-output");
    return;
  }

  // GMS commands
  if(cmd === "gms"){
    const sub = parts[1];
    if(sub==="connect"){
      const url = parts[2];
      if(!url) return addToConsole("> Error: Missing URL", "error-output");
      if(url.startsWith("http")){ gashUseREST=true; gashRESTUrl=url; startRESTPolling(); addToConsole(`> Using REST API at ${url}`,"command-output"); return; }
      if(!url.startsWith("ws://") && !url.startsWith("wss://")) return addToConsole("> Error: Invalid WebSocket URL.","error-output");

      try{
        gashWebSocket = new WebSocket(url);
        gashWebSocketUrl = url;
        gashWebSocket.onopen = ()=>addToConsole(`> Connected to WebSocket: ${url}`,"command-output");
        gashWebSocket.onmessage = e=>{
          try{
            const rawMsg = JSON.parse(e.data);
            const msg = validateMessage(rawMsg);
            if(msg && msg.userId!==gashUserId) addToConsole(`> ${msg.user}: ${msg.msg}`,"command-output");
          } catch { addToConsole(`> WS: ${sanitizeText(e.data)}`,"misc-output"); }
        };
        gashWebSocket.onerror = ()=>{ addToConsole("> WebSocket error. Switching to REST fallback.","misc-urgent-output"); gashWebSocket=null; gashUseREST=true; gashRESTUrl=url.replace(/^ws/,"http"); startRESTPolling(); };
        gashWebSocket.onclose = ()=>{ addToConsole("> WebSocket closed.","misc-output"); gashWebSocket=null; gashWebSocketUrl=null; };
      } catch(e){ addToConsole("> Error: "+sanitizeText(e.message),"error-output"); }
      return;
    }

    if(sub==="send"){
      const msg = parts.slice(2).join(" ");
      if(!msg) return addToConsole("> Error: No message","error-output");
      const sanitizedMsg = sanitizeText(msg);
      if(gashUseREST){ restSendMessage(sanitizedMsg); addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`,"command-output"); }
      else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(JSON.stringify({user:gashNickname,msg:sanitizedMsg,userId:gashUserId})); addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`,"command-output"); }
      else addToConsole("> Error: Not connected.","error-output");
      return;
    }

    if(sub==="disconnect"){
      if(gashWebSocket){ gashWebSocket.close(); addToConsole("> Closing WebSocket...","misc-output"); }
      if(gashUseREST && gashRESTPoller){ clearInterval(gashRESTPoller); addToConsole("> Stopped REST polling.","misc-output"); gashUseREST=false; }
      return;
    }

    if(sub==="check"){
      if(gashUseREST) addToConsole(`> Using REST at ${gashRESTUrl}`,"command-output");
      else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN) addToConsole(`> Connected to WS: ${gashWebSocketUrl}`,"command-output");
      else addToConsole("> No active connection.","misc-output");
      return;
    }

    addToConsole("> Usage: gms {connect|send|disconnect|check}","error-output");
    return;
  }

  // SAY command
  if(cmd==="say"){
    const msg = parts.slice(1).join(" ");
    if(!msg) return addToConsole("> Error: No message","error-output");
    const sanitizedMsg = sanitizeText(msg);
    if(gashUseREST){ restSendMessage(sanitizedMsg); addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`,"command-output"); }
    else if(gashWebSocket && gashWebSocket.readyState===WebSocket.OPEN){ gashWebSocket.send(JSON.stringify({user:gashNickname,msg:sanitizedMsg,userId:gashUserId})); addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`,"command-output"); }
    else addToConsole("> Error: Not connected.","error-output");
    return;
  }

  addToConsole("> Unknown command","error-output");
}

// Console helper
function addToConsole(text, cssClass="command-output"){
  const div = document.createElement("div");
  div.className = cssClass;
  div.textContent = text;
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Init
renderInput();
applyTheme("default");
