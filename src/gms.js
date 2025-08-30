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
  if(msg.user.trim() === '' || msg.msg.trim() === '') return null; // Reject empty messages
  if(msg.user.length > 50 || msg.msg.length > 1000) return null; // Reasonable limits
  return {
    user: sanitizeText(msg.user),
    msg: sanitizeText(msg.msg),
    userId: msg.userId || null
  };
}

// Join presets
const joinPresets = { gms: "wss://gms-1-0.onrender.com" };

// Available themes
const availableThemes = {
  default: "theme-default",
  light: "theme-light", 
  blue: "theme-blue",
  red: "theme-red",
  purple: "theme-purple",
  green: "theme-green"
};

// Apply theme to body
function applyTheme(themeName) {
  // Remove all theme classes
  Object.values(availableThemes).forEach(themeClass => {
    document.body.classList.remove(themeClass);
  });
  
  // Apply new theme
  if(availableThemes[themeName]) {
    document.body.classList.add(availableThemes[themeName]);
    gashCurrentTheme = themeName;
    
    // Apply theme-specific CSS overrides
    applyThemeCSS(themeName);
  }
}

// Apply theme-specific CSS for output classes
function applyThemeCSS(themeName) {
  // Remove existing theme style if it exists
  const existingStyle = document.getElementById('theme-overrides');
  if(existingStyle) existingStyle.remove();
  
  // Create new style element
  const style = document.createElement('style');
  style.id = 'theme-overrides';
  
  let css = '';
  
  switch(themeName) {
    case 'light':
      css = `
        .command-output { color: #333333 !important; }
        .error-output { color: #CC0000 !important; }
        .help-output { color: #0066CC !important; }
        .misc-output { color: #666666 !important; opacity: 75%; }
        .misc-urgent-output { color: #CC3333 !important; opacity: 75%; }
        #input-text { color: #333333 !important; }
        #caret { color: #333333 !important; }
      `;
      break;
    case 'default':
    case 'green':
      css = `
        .command-output { color: #00FF00 !important; }
        .error-output { color: red !important; }
        .help-output { color: #00FFFF !important; }
        .misc-output { color: #9e9e9e !important; opacity: 75%; }
        .misc-urgent-output { color: #ff5959 !important; opacity: 75%; }
        #input-text { color: #00FF00 !important; }
        #caret { color: #00FF00 !important; }
      `;
      break;
    case 'blue':
      css = `
        .command-output { color: #1E90FF !important; }
        .error-output { color: #FF6666 !important; }
        .help-output { color: #00FFFF !important; }
        .misc-output { color: #AAAAAA !important; opacity: 75%; }
        .misc-urgent-output { color: #ff5959 !important; opacity: 75%; }
        #input-text { color: #1E90FF !important; }
        #caret { color: #1E90FF !important; }
      `;
      break;
    case 'red':
      css = `
        .command-output { color: #FF4500 !important; }
        .error-output { color: #FF6666 !important; }
        .help-output { color: #00FFFF !important; }
        .misc-output { color: #AAAAAA !important; opacity: 75%; }
        .misc-urgent-output { color: #ff8888 !important; opacity: 75%; }
        #input-text { color: #FF4500 !important; }
        #caret { color: #FF4500 !important; }
      `;
      break;
    case 'purple':
      css = `
        .command-output { color: #BB66BB !important; }
        .error-output { color: #FF6666 !important; }
        .help-output { color: #00FFFF !important; }
        .misc-output { color: #AAAAAA !important; opacity: 75%; }
        .misc-urgent-output { color: #ff5959 !important; opacity: 75%; }
        #input-text { color: #BB66BB !important; }
        #caret { color: #BB66BB !important; }
      `;
      break;
  }
  
  style.textContent = css;
  document.head.appendChild(style);
}

// Input rendering
function renderInput(){
  const before = currentInput.slice(0, cursorIndex);
  const after = currentInput.slice(cursorIndex);
  inputText.textContent = ""; // Use textContent instead of innerHTML
  const spanBefore = document.createTextNode(before);
  const caretSpan = document.createElement("span");
  caretSpan.id = "caret";
  caretSpan.textContent = "█";
  const spanAfter = document.createTextNode(after);
  inputText.appendChild(spanBefore);
  inputText.appendChild(caretSpan);
  inputText.appendChild(spanAfter);
}

// Key handling
document.addEventListener("keydown", (event) => {
  if(event.key === "Backspace"){ 
    if(cursorIndex > 0){ 
      currentInput = currentInput.slice(0, cursorIndex-1) + currentInput.slice(cursorIndex); 
      cursorIndex--; 
    } 
  }
  else if(event.key === "Delete"){ 
    if(cursorIndex < currentInput.length) currentInput = currentInput.slice(0, cursorIndex) + currentInput.slice(cursorIndex+1); 
  }
  else if(event.key.length === 1 && !event.ctrlKey && !event.metaKey){ 
    currentInput = currentInput.slice(0, cursorIndex) + event.key + currentInput.slice(cursorIndex); 
    cursorIndex++; 
  }
  else if(event.key === "ArrowLeft"){ if(cursorIndex > 0) cursorIndex--; }
  else if(event.key === "ArrowRight"){ if(cursorIndex < currentInput.length) cursorIndex++; }
  else if(event.key === "ArrowUp"){ 
    if(historyIndex > 0){ historyIndex--; currentInput = commandHistory[historyIndex]; cursorIndex = currentInput.length;} 
  }
  else if(event.key === "ArrowDown"){ 
    if(historyIndex < commandHistory.length-1){ historyIndex++; currentInput = commandHistory[historyIndex];} 
    else{ historyIndex = commandHistory.length; currentInput = "";} 
    cursorIndex = currentInput.length; 
  }

  renderInput();

  if(event.key === "Enter"){
    const trimmed = currentInput.trim();
    if(!trimmed){ currentInput=""; cursorIndex=0; renderInput(); return; }
    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;

    const parts = trimmed.split(" ");
    // List of commands that should NOT trigger auto-say
    const nonChatCommands = ["int","join","nick","echo","help","clear","autosay","say","theme"];

    if(gashAutoSay && !nonChatCommands.includes(parts[0].toLowerCase())){
      processCommand("say " + trimmed);
    } else {
      processCommand(trimmed);
    }

    currentInput = "";
    cursorIndex = 0;
    renderInput();
  }
});

// REST helpers
async function restSendMessage(msg){
  if(!gashRESTUrl){ addToConsole("> Error: REST not configured.", "error-output"); return; }
  const sanitizedMsg = sanitizeText(msg);
  await fetch(gashRESTUrl + "/send", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({user: sanitizeText(gashNickname), msg: sanitizedMsg, userId: gashUserId})
  });
}

function startRESTPolling(){
  if(!gashRESTUrl) return;
  if(gashRESTPoller) clearInterval(gashRESTPoller);

  gashRESTPoller = setInterval(async()=>{
    try{
      const res = await fetch(gashRESTUrl + "/messages");
      const msgs = await res.json();
      if(Array.isArray(msgs) && msgs.length > lastRestMsgCount){
        msgs.slice(lastRestMsgCount).forEach(rawMsg=>{
          const msg = validateMessage(rawMsg);
          if(msg && msg.userId !== gashUserId) {
            addToConsole(`> ${msg.user}: ${msg.msg}`, "command-output");
          }
        });
        lastRestMsgCount = msgs.length;
      }
    }catch(e){ addToConsole("> REST polling error: " + sanitizeText(e.message), "error-output"); }
  }, 2000);
  addToConsole("> 📡 REST polling started (every 2s)", "misc-output");
}

// Command processor
function processCommand(command){
  const parts = command.split(" ");

  // JOIN preset
  if(parts[0] === "join"){
    const target = parts[1];
    if(!target) return addToConsole("> Error: Missing server/preset name", "error-output");
    const url = joinPresets[target] || target;
    processCommand(`int ws connect ${url}`);
    return;
  }

  // Always-working commands
  if(parts[0] === "nick"){
    const newNick = parts.slice(1).join(" ");
    if(newNick){ 
      gashNickname = sanitizeText(newNick);
      addToConsole(`> Nickname set to ${gashNickname}`, "command-output");
    }
    else addToConsole(`> Current nickname: ${gashNickname}`, "command-output");
    return;
  }

  if(command.startsWith("echo ")){ 
    const echoText = sanitizeText(command.slice(5));
    addToConsole(`> ${echoText}`, "command-output"); 
    return; 
  }
  if(command === "help"){ addToConsole(`> Commands:
  - join {preset|url}        Connect to server or preset
  - int ws connect {url}     Connect to WS/REST server
  - int ws send {msg}        Send raw message
  - int ws disconnect        Disconnect WebSocket/REST
  - int ws check             Show connection status
  - nick {name}              Set your nickname
  - say {msg}                Send a chat message
  - autosay on/off           Toggle auto-say mode
  - theme {name}             Change theme (default/light/blue/red/purple/green)
  - echo {msg}               Print message
  - clear                    Clear console
  - help                     Show this help`, "help-output"); return; }
  if(command === "clear"){ consoleOutput.textContent = ""; return; }
  if(parts[0] === "autosay"){ gashAutoSay = (parts[1] === "on"); addToConsole(`> Auto-say: ${gashAutoSay?"ON":"OFF"}`, "command-output"); return; }
  
  // Theme command
  if(parts[0] === "theme"){
    const themeName = parts[1];
    if(!themeName) {
      addToConsole(`> Current theme: ${gashCurrentTheme}`, "command-output");
      addToConsole(`> Available themes: ${Object.keys(availableThemes).join(", ")}`, "command-output");
      return;
    }
    if(availableThemes[themeName]) {
      applyTheme(themeName);
      addToConsole(`> Theme changed to: ${themeName}`, "command-output");
    } else {
      addToConsole(`> Error: Unknown theme '${themeName}'. Available: ${Object.keys(availableThemes).join(", ")}`, "error-output");
    }
    return;
  }

  // WebSocket / REST commands
  if(command.startsWith("int ws")){
    const subCommand = parts[2];
    if(subCommand === "connect"){
      const url = parts[3];
      if(!url) return addToConsole("> Error: Missing URL", "error-output");
      if(url.startsWith("http")){ gashUseREST = true; gashRESTUrl = url; startRESTPolling(); addToConsole(`> Using REST API at ${url}`, "command-output"); return; }
      if(!url.startsWith("ws://") && !url.startsWith("wss://")) return addToConsole("> Error: Invalid WebSocket URL.", "error-output");
      try{
        gashWebSocket = new WebSocket(url);
        gashWebSocketUrl = url;
        gashWebSocket.onopen = () => addToConsole(`> Connected to WebSocket: ${url}`, "command-output");
        gashWebSocket.onmessage = (event)=>{
          try{ 
            const rawMsg = JSON.parse(event.data);
            const msg = validateMessage(rawMsg);
            if(msg && msg.userId !== gashUserId) {
              addToConsole(`> ${msg.user}: ${msg.msg}`, "command-output");
            }
            // Don't show WS debug messages for valid but filtered messages
          }
          catch{ addToConsole(`> WS: ${sanitizeText(event.data)}`, "misc-output"); }
        };
        gashWebSocket.onerror = () => { addToConsole("> WebSocket error. Switching to REST fallback.", "misc-urgent-output"); gashWebSocket = null; gashUseREST = true; gashRESTUrl = url.replace(/^ws/,"http"); startRESTPolling(); };
        gashWebSocket.onclose = () => { addToConsole("> WebSocket closed.", "misc-output"); gashWebSocket = null; gashWebSocketUrl = null; };
      }catch(e){ addToConsole(`> Error: ${sanitizeText(e.message)}`, "error-output"); }
      return;
    }
    else if(subCommand === "send"){
      const msg = parts.slice(3).join(" ");
      if(!msg || msg.trim() === "") return addToConsole("> Error: No message.", "error-output");
      const sanitizedMsg = sanitizeText(msg);
      if(gashUseREST){ 
        restSendMessage(sanitizedMsg); 
        addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output"); 
      }
      else if(gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN){ 
        gashWebSocket.send(JSON.stringify({user: sanitizeText(gashNickname), msg: sanitizedMsg, userId: gashUserId})); 
        addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output"); 
      }
      else addToConsole("> Error: Not connected.", "error-output");
      return;
    }
    else if(subCommand === "disconnect"){
      if(gashWebSocket){ gashWebSocket.close(); addToConsole("> Closing WebSocket...", "misc-output"); }
      if(gashUseREST && gashRESTPoller){ clearInterval(gashRESTPoller); addToConsole("> Stopped REST polling.", "misc-output"); gashUseREST = false; }
      return;
    }
    else if(subCommand === "check"){
      if(gashUseREST) addToConsole(`> Using REST at ${gashRESTUrl}`, "command-output");
      else if(gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) addToConsole(`> Connected to WS: ${gashWebSocketUrl}`, "command-output");
      else addToConsole("> No active connection.", "misc-output");
      return;
    }
    else { addToConsole("> Usage: int ws {connect|send|disconnect|check}", "error-output"); return; }
  }

  // SAY command - with [ME] indicator
  if(parts[0] === "say"){
    const msg = parts.slice(1).join(" ");
    if(!msg || msg.trim() === "") return addToConsole("> Error: No message.", "error-output");
    const sanitizedMsg = sanitizeText(msg);
    if(gashUseREST){ 
      restSendMessage(sanitizedMsg); 
      addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output"); 
    }
    else if(gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN){ 
      gashWebSocket.send(JSON.stringify({user: sanitizeText(gashNickname), msg: sanitizedMsg, userId: gashUserId})); 
      addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output"); 
    }
    else addToConsole("> Error: Not connected.", "error-output");
    return;
  }

  addToConsole("> Unknown command", "error-output");
}

// Secure console output with CSS classes
function addToConsole(text, cssClass = "command-output"){
  const div = document.createElement("div");
  div.className = cssClass;
  div.textContent = text; // Use textContent instead of innerHTML for safety
  consoleOutput.appendChild(div);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

// Initial render
renderInput();
// Apply default theme on load
applyTheme("default");