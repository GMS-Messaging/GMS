// GMS (Gash Messaging Software) - Enhanced
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

// New features
let gashPingSoundEnabled = true;
let isConnected = false;
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|OPR|Opera/i.test(navigator.userAgent)
    || ('ontouchstart' in window || navigator.maxTouchPoints > 0);
// Mobile input handling
let mobileInputBuffer = "";

// Audio context for ping sounds
let audioContext = null;

// Initialize audio context (must be done after user interaction)
function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log("Audio context not supported");
        }
    }
}

// Play ping sound
function playPingSound() {
    if (!gashPingSoundEnabled || !audioContext) return;

    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (e) {
        console.log("Error playing ping sound:", e);
    }
}

// Update connection status
function updateConnectionStatus(connected, viaREST = false) {
    isConnected = connected;
    const statusElement = document.getElementById("connection-status");
    if (statusElement) {
        if (connected) {
            if (viaREST) {
                statusElement.textContent = "● Connected, With REST";
                statusElement.className = "status-rest"; // yellow
            } else {
                statusElement.textContent = "● Connected";
                statusElement.className = "status-connected"; // green
            }
        } else {
            statusElement.textContent = "● Disconnected";
            statusElement.className = "status-disconnected"; // red
        }
    }
}



// Safe text sanitization
function sanitizeText(str) {
    if (typeof str !== 'string') return '';

    return DOMPurify.sanitize(str, {
        ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'img', 'span'],
        ALLOWED_ATTR: ['src', 'alt', 'class']
    });
}

// Process both :shortcodes: → emoji → Twemoji <img>
function processEmojis(text) {
    // 1️⃣ Convert :shortcodes: → Unicode emojis using emoji-toolkit
    if (typeof emojione !== 'undefined') {
        text = emojione.shortnameToUnicode(text);
    }

    // 2️⃣ Convert Unicode emojis → Twemoji <img> tags for consistent display
    if (typeof twemoji !== 'undefined') {
        text = twemoji.parse(text, {
            folder: 'svg', // or '72x72' if you prefer PNGs
            ext: '.svg'
        });
    }

    return text;
}


// Validate message object from server
function validateMessage(msg) {
    if (!msg || typeof msg !== 'object') return null;
    if (!msg.user || !msg.msg) return null;
    if (typeof msg.user !== 'string' || typeof msg.msg !== 'string') return null;
    if (msg.user.trim() === '' || msg.msg.trim() === '') return null;
    if (msg.user.length > 50 || msg.msg.length > 1000) return null;
    return {
        user: sanitizeText(msg.user),
        msg: sanitizeText(msg.msg),
        userId: msg.userId || null
    };
}

// Join presets
const joinPresets = { gms: "wss://gms-1-0.onrender.com", gms_rest: "https://gms-1-0.onrender.com" };

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
    abyss: "theme-abyss",
    sky: "theme-sky",
    bloodshed: "theme-bloodshed",
    autumn: "theme-autumn",
    oreo: "theme-oreo",
    classic: "theme-classic",
};

// Apply theme and save in localStorage
function applyTheme(themeName) {
    Object.values(availableThemes).forEach(c => document.body.classList.remove(c));
    if (availableThemes[themeName]) {
        document.body.classList.add(availableThemes[themeName]);
        gashCurrentTheme = themeName;
        try {
            localStorage.setItem("gmsTheme", themeName);
        } catch (e) {
            console.log("LocalStorage not available");
        }
        applyThemeCSS(themeName);
    }
}

// Theme CSS overrides
function applyThemeCSS(themeName) {
    const existingStyle = document.getElementById('theme-overrides');
    if (existingStyle) existingStyle.remove();

    const style = document.createElement('style');
    style.id = 'theme-overrides';

    let css = '';
    switch (themeName) {
        case 'light':
            css = `
        .command-output { color: #333 !important; }
        .error-output { color: #CC0000 !important; }
        .help-output { color: #0066CC !important; }
        .misc-output { color: #666 !important; opacity:75%; }
        .misc-urgent-output { color: #CC3333 !important; opacity:75%; }
        #input-text, #caret { color: #333 !important; }
        #prompt { background:#f0f0f0; color:#333; padding:4px; border-top:1px solid #ccc; }
        ::selection{background-color: #212121ff; color: #cfcfcfff;}
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
        case 'classic':
            css = `
    .command-output { color: #0F0 !important; }
    .error-output { color: red !important; }
    .help-output { color: #0FF !important; }
    .misc-output { color: #9e9e9e !important; opacity:75%; }
    .misc-urgent-output { color: #f55 !important; opacity:75%; }
    #input-text, #caret { color: #0F0 !important; }
    #prompt { background:#000; color:#0F0; padding:4px; border-top:1px solid #333; }
    body { font-family: "Courier New", monospace; color: #fff }
  `;
            break;

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

        case 'sky':
            css = `
        .command-output { color: #1E90FF !important; }
        .error-output { color: #F66 !important; }
        .help-output { color: #254dda !important; }
        .misc-output { color: #FFF !important; opacity:75%; }
        .misc-urgent-output { color: #f55 !important; opacity:75%; }
        
        #input-text, #caret { color: #FFFFFF !important; }
        #prompt { 
          background: #1E90FF;
          color: #FFFFFF; 
          padding: 4px; 
          border-top: 1px solid #223; 
        }
        
        ::selection { background-color: #1390FF; color: #FFFFFF; }
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
        .command-output { color: #FF69B4 !important; }
        .error-output { color: #FF3366 !important; }
        .help-output { color: #FFB6C1 !important; }
        .misc-output { color: #FF99CC !important; opacity:75%; }
        .misc-urgent-output { color: #FF0066 !important; opacity:75%; }
        #input-text, #caret { color: #FF69B4 !important; }
        #prompt { background: #33001A; color: #FF69B4; padding:4px; border-top:1px solid #660033; }
        ::selection{background-color: #ff136aff; color: #f5f5f5;}
      `;
            break;

        case 'midnight':
            css = `
        .command-output { color: #A59AFF !important; }
        .error-output { color: #FF6B6B !important; }
        .help-output { color: #D8BFFF !important; }
        .misc-output { color: #BFAFFF !important; opacity:75%; }
        .misc-urgent-output { color: #FF99FF !important; opacity:75%; }
        #input-text, #caret { color: #A59AFF !important; }
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

        case 'bloodshed':
            css = `
        .command-output { color: #8a0303 !important; }   
        .error-output { color: #821313 !important; }     
        .help-output { color: #d00707 !important; }     
        .misc-output { color: #6e0e0e !important; opacity:75%; }
        .misc-urgent-output { color: #490404 !important; opacity:75%; }
        #input-text, #caret { color: #7c0909 !important; }
        #prompt { background: #450808; color: #690d0d; padding:4px; border-top:1px solid #820808; }
        ::selection{background-color: #7c1b37; color: #6e0020;}
      `;
            break;

        case 'autumn':
            css = `
        .command-output { color: #5b2f01 !important; }   
        .error-output { color: #070400 !important; }     
        .help-output { color: #4f3519 !important; }     
        .misc-output { color: #2c1803 !important; opacity:75%; }
        .misc-urgent-output { color: #1e0f00 !important; opacity:75%; }
        #input-text, #caret { color: #532f09 !important; }
        #prompt { background: #301a02; color: #3e2b17; padding:4px; border-top:1px solid #472602; }
        ::selection{background-color: #8d581f; color: #724719;}
      `;
            break;

        case 'oreo':
            css = `
        .command-output { color: #ffffff !important; }   
        .error-output { color: #ffffff !important; }     
        .help-output { color: #ffffff !important; }     
        .misc-output { color: #ffffff !important; opacity:75%; }
        .misc-urgent-output { color: #ffffff !important; opacity:75%; }
        #input-text, #caret { color: #ffffff !important; }
        #prompt { background: #000000; color: #ffffff; padding:4px; border-top:1px solid #ffffff; }
        ::selection{background-color: #2a2a2a; color: #535353;}
      `;
            break;
    }

    // Mobile responsive adjustments
    if (isMobile) {
        css += `
      body { font-size: 16px; }
      #console-output { padding: 8px; }
      #prompt { padding: 8px; font-size: 16px; }
      #connection-status { font-size: 12px; top: 2px; right: 4px; }
      #mobile-input-helper { 
        position: fixed; 
        bottom: 0; 
        left: 0; 
        width: 100%; 
        height: 40px; 
        background: rgba(0,0,0,0.8); 
        display: flex; 
        align-items: center; 
        padding: 0 10px; 
        border-top: 1px solid #333;
      }
      #mobile-input { 
        flex: 1; 
        background: transparent; 
        border: none; 
        color: inherit; 
        font-family: inherit; 
        font-size: 14px; 
        outline: none; 
      }
      #mobile-send-btn { 
        background: #333; 
        border: 1px solid #666; 
        color: inherit; 
        padding: 5px 10px; 
        margin-left: 10px; 
        border-radius: 3px; 
        font-family: inherit; 
        font-size: 12px; 
      }
      #prompt { margin-bottom: 40px; }
    `;
    }

    style.textContent = css;
    document.head.appendChild(style);
}

// Render input with caret
function renderInput() {
    const before = currentInput.slice(0, cursorIndex);
    const after = currentInput.slice(cursorIndex);
    inputText.textContent = "";
    inputText.appendChild(document.createTextNode(before));

    const caretSpan = document.createElement("span");
    caretSpan.id = "caret";
    caretSpan.textContent = "|";
    inputText.appendChild(caretSpan);

    inputText.appendChild(document.createTextNode(after));

    // Update mobile input if it exists
    const mobileInput = document.getElementById("mobile-input");
    if (mobileInput) {
        mobileInput.value = currentInput;
    }
}

// Mobile input handling
function setupMobileInput() {
    if (!isMobile) return;

    const mobileHelper = document.createElement("div");
    mobileHelper.id = "mobile-input-helper";

    const mobileInput = document.createElement("input");
    mobileInput.id = "mobile-input";
    mobileInput.type = "text";
    mobileInput.placeholder = "Type your message...";

    const sendBtn = document.createElement("button");
    sendBtn.id = "mobile-send-btn";
    sendBtn.textContent = "Send";

    mobileHelper.appendChild(mobileInput);
    mobileHelper.appendChild(sendBtn);
    document.body.appendChild(mobileHelper);

    // Auto-focus when console tapped
    consoleOutput.addEventListener("touchstart", () => {
        mobileInput.focus();
    });

    mobileInput.addEventListener("input", (e) => {
        currentInput = e.target.value;
        cursorIndex = currentInput.length;
        renderInput();
    });

    mobileInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            sendMobileMessage();
        }
    });

    sendBtn.addEventListener("click", sendMobileMessage);
}


function sendMobileMessage() {
    const trimmed = currentInput.trim();
    if (!trimmed) {
        currentInput = "";
        cursorIndex = 0;
        renderInput();
        return;
    }

    // Initialize audio on first interaction
    initAudio();

    commandHistory.push(trimmed);
    historyIndex = commandHistory.length;

    // auto say exclusion basically
    const nonChatCommands = ["join", "nick", "echo", "help", "clear", "autosay", "say", "theme", "gms", "uid", "updlog", "ping", "users", "upload", "term enable", "term disable"];
    const cmdName = trimmed.split(" ")[0].toLowerCase();

    if (gashAutoSay && !nonChatCommands.includes(cmdName)) {
        processCommand("say " + trimmed);
    } else {
        // Special commands handled first; prevent sending to chat
        if (!["users", "upload"].includes(cmdName)) {
            processCommand(trimmed);
        } else {
            processCommand(trimmed); // processCommand will handle users/upload and stop
        }
    }



    currentInput = "";
    cursorIndex = 0;
    renderInput();

    // Clear mobile input
    const mobileInput = document.getElementById("mobile-input");
    if (mobileInput) {
        mobileInput.value = "";
    }
}

document.addEventListener("keydown", async event => {
    alert("keydown:", event.key); // <- see if Enter is logged)
});


// Enhanced key handling (desktop)
document.addEventListener("keydown", async event => {
    // Initialize audio on first keypress
    if (!audioContext) initAudio();

    if (event.ctrlKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        try { await navigator.clipboard.writeText(currentInput); } catch (err) { console.error("Clipboard write failed", err); }
        return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        try {
            const clipText = await navigator.clipboard.readText();
            currentInput = currentInput.slice(0, cursorIndex) + clipText + currentInput.slice(cursorIndex);
            cursorIndex += clipText.length;
            renderInput();
        } catch (err) { console.error("Clipboard read failed", err); }
        return;
    }

    if (event.key === "Backspace" && cursorIndex > 0) {
        currentInput = currentInput.slice(0, cursorIndex - 1) + currentInput.slice(cursorIndex);
        cursorIndex--;
    } else if (event.key === "Delete" && cursorIndex < currentInput.length) {
        currentInput = currentInput.slice(0, cursorIndex) + currentInput.slice(cursorIndex + 1);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        currentInput = currentInput.slice(0, cursorIndex) + event.key + currentInput.slice(cursorIndex);
        cursorIndex++;
    } else if (event.key === "ArrowLeft" && cursorIndex > 0) cursorIndex--;
    else if (event.key === "ArrowRight" && cursorIndex < currentInput.length) cursorIndex++;
    else if (event.key === "ArrowUp" && historyIndex > 0) {
        historyIndex--; currentInput = commandHistory[historyIndex]; cursorIndex = currentInput.length;
    } else if (event.key === "ArrowDown") {
        if (historyIndex < commandHistory.length - 1) { historyIndex++; currentInput = commandHistory[historyIndex]; }
        else { historyIndex = commandHistory.length; currentInput = ""; }
        cursorIndex = currentInput.length;
    }

    renderInput();

    if (event.key === "Enter") {
        event.preventDefault();  // STOP the browser from doing its thing
        const trimmed = currentInput.trim();
        if (!trimmed) { 
            currentInput = ""; 
            cursorIndex = 0; 
            renderInput(); 
            return; 
        }

        commandHistory.push(trimmed);
        historyIndex = commandHistory.length;

        const cmdName = trimmed.split(" ")[0].toLowerCase();

        // Convert :shortcodes: → Unicode emojis immediately
        let localMsg = trimmed;
        if (typeof emojione !== "undefined") {
            localMsg = emojione.shortnameToUnicode(trimmed);
        }

        // Display instantly
        addToConsole(`[${gashNickname}]: ${localMsg}`);

        // Send to server
        if (gashAutoSay && !nonChatCommands.includes(cmdName)) {
            processCommand("say " + trimmed);
        } else {
            processCommand(trimmed);
        }

        currentInput = "";
        cursorIndex = 0;
        renderInput();
        return;
    }

});



    // REST helpers
    async function restSendMessage(msg) {
        if (!gashRESTUrl) { addToConsole("> Error: REST not configured.", "error-output"); return; }
        const sanitizedMsg = sanitizeText(msg);
        try {
            await fetch(gashRESTUrl + "/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user: gashNickname, msg: sanitizedMsg, userId: gashUserId })
            });
        } catch (e) {
            addToConsole("> REST send error: " + sanitizeText(e.message), "error-output");
            updateConnectionStatus(false);
        }
    }

    function startRESTPolling() {
        if (!gashRESTUrl) return;
        if (gashRESTPoller) clearInterval(gashRESTPoller);

        gashRESTPoller = setInterval(async () => {
            try {
                const res = await fetch(gashRESTUrl + "/messages");
                const msgs = await res.json();
                if (Array.isArray(msgs) && msgs.length > lastRestMsgCount) {
                    msgs.slice(lastRestMsgCount).forEach(rawMsg => {
                        const msg = validateMessage(rawMsg);
                        if (msg && msg.userId !== gashUserId) {
                            playPingSound();
                            addToConsole(`> ${msg.user}: ${msg.msg}`, "command-output");
                        }
                    });
                    lastRestMsgCount = msgs.length;
                }
                updateConnectionStatus(true, true);
            } catch (e) {
                addToConsole("> REST polling error: " + sanitizeText(e.message), "error-output");
                updateConnectionStatus(false);
            }
        }, 2000);
        addToConsole("> 📡 REST polling started (every 2s)", "misc-output");
        updateConnectionStatus(true, true);
    }

    // Command processor
    function processCommand(command) {
        const parts = command.split(" ");
        const cmd = parts[0];
        const nonSendCommands = ["users", "upload"];
        if (nonSendCommands.includes(command.split(" ")[0].toLowerCase())) {
            // Do nothing here; the command-specific block below will handle it
        }

        if (cmd === "join") {
            const target = parts[1];
            if (!target) return addToConsole("> Error: Missing server/preset name", "error-output");
            const url = joinPresets[target] || target;
            processCommand(`gms connect ${url}`);
            return;
        }

        if (cmd === "upload") {
            const wsAvailable = gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN;
            const restAvailable = gashUseREST && gashRESTUrl;

            if (!wsAvailable && !restAvailable) {
                addToConsole("⚠️ You must be connected (WebSocket or REST) to upload.", "error-output");
                return;
            }

            const inputEl = document.createElement("input");
            inputEl.type = "file";
            inputEl.accept = "image/*";
            inputEl.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append("file", file);

                try {
                    const uploadUrl = restAvailable ? gashRESTUrl + "/upload" : "/upload";
                    const res = await fetch(uploadUrl, { method: "POST", body: formData });
                    const data = await res.json();

                    if (!data.url) {
                        addToConsole("❌ Upload failed.", "error-output");
                        return;
                    }

                    // Make URL absolute if using REST
                    const baseUrl = gashRESTUrl.replace(/\/$/, '');
                    const path = data.url.startsWith('/') ? data.url : '/' + data.url;
                    const imageUrl = restAvailable ? baseUrl + path : data.url;

                    const msgPayload = {
                        user: gashNickname,
                        msg: `<img src="${imageUrl}" alt="upload" class="chat-image">`,
                        userId: gashUserId
                    };

                    // Send via REST or WS
                    if (restAvailable) {
                        await fetch(gashRESTUrl + "/send", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(msgPayload)
                        });
                    } else if (wsAvailable) {
                        gashWebSocket.send(JSON.stringify(msgPayload));
                    } else {
                        addToConsole("❌ Not connected, cannot send image.", "error-output");
                        return;
                    }

                    addToConsole(`📷 Uploaded image: ${imageUrl}`, "misc-output");

                } catch (err) {
                    addToConsole("❌ Upload error: " + sanitizeText(err.message), "error-output");
                }
            };

            inputEl.click();
            return; // stop further processing
        }



        if (cmd === "nick") {
            const newNick = parts.slice(1).join(" ");
            if (newNick) {
                gashNickname = sanitizeText(newNick);
                addToConsole(`> Nickname set to ${gashNickname}`, "command-output");

                // Save nickname
                try {
                    localStorage.setItem("gmsNickname", gashNickname);
                } catch (e) {
                    console.log("LocalStorage not available");
                }
            } else {
                addToConsole(`> Current nickname: ${gashNickname}`, "command-output");
            }
            return;
        }


        if (cmd === "echo") { addToConsole(`> ${sanitizeText(parts.slice(1).join(" "))}`, "command-output"); return; }

        if (cmd === "uid") {
            addToConsole(`> User ID: ${gashUserId}`, "command-output");
            return;
        }

        if (cmd === "term enable") {
            EZTerm.enable();
        } else if (cmd === "term disable") {
            EZTerm.disable();
        }

        if (cmd === "ping") {
            const setting = parts[1];
            if (setting === "on") {
                gashPingSoundEnabled = true;
                addToConsole("> Ping sounds: ON", "command-output");
            } else if (setting === "off") {
                gashPingSoundEnabled = false;
                addToConsole("> Ping sounds: OFF", "command-output");
            } else {
                playPingSound();
                addToConsole(`> Ping sounds: ${gashPingSoundEnabled ? "ON" : "OFF"}`, "command-output");
            }
            return;
        }

        if (cmd === "help") {
            addToConsole(`> Commands:
  - join {preset|url}        Connect to server
  - gms connect {url}        Connect WS/REST
  - gms send {msg}           Send raw message
  - gms disconnect           Disconnect WS/REST
  - gms check                Show connection status
  - nick {name}              Set nickname
  - say {msg}                Send chat message
  - autosay on/off           Toggle auto-say
  - ping [on/off]            Toggle/test ping sounds
  - theme {name}             Change theme (default/light/blue/red/purple/green/yellow/pink/midnight/abyss/sky/bloodshed/autumn/oreo)
  - upload                   Allows you to upload image files (png, jpeg, webp(ew), and get this. GIF.)
  - echo {msg}               Print message
  - clear                    Clear console
  - uid                      Prints your userId to the console. (no one will see.)
  - updlog                   Shows GMS update logs
  - users                    Show how many is connected
  - help                     Show this help`, "help-output");
            return;
        }

        if (cmd === "updlog") {
            addToConsole(
                `> Update Log:
    GMS 1.1
- Added mobile support with touch-friendly interface
- Added a buncha themes
- users command (shows how many are connected)
- upload command IMAGE SHARING WOOOOOOOO!
- text sanitization less strict
- shoutout to vodder for the themes!
    GMS 1.1.1
- added merkdawn`,
                "misc-output"
            );
            return;
        }

        if (cmd === "clear") { consoleOutput.textContent = ""; return; }
        if (cmd === "autosay") { gashAutoSay = (parts[1] === "on"); addToConsole(`> Auto-say: ${gashAutoSay ? "ON" : "OFF"}`, "command-output"); return; }

        if (cmd === "theme") {
            const themeName = parts[1];
            if (!themeName) {
                addToConsole(`> Current theme: ${gashCurrentTheme}`, "command-output");
                addToConsole(`> Available themes: ${Object.keys(availableThemes).join(", ")}`, "command-output");
                return;
            }
            if (availableThemes[themeName]) { applyTheme(themeName); addToConsole(`> Theme changed to: ${themeName}`, "command-output"); }
            else addToConsole(`> Error: Unknown theme '${themeName}'`, "error-output");
            return;
        }

        if (cmd === "users") {
            if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
                gashWebSocket.send(JSON.stringify({ type: "users" }));
            } else if (gashUseREST && gashRESTUrl) {
                fetch(gashRESTUrl + "/users")
                    .then(r => r.json())
                    .then(data => addToConsole(`👥 Users online: ${data.count}`, "misc-output"))
                    .catch(err => addToConsole("❌ Failed to get users: " + err.message, "error-output"));
            } else {
                addToConsole("⚠️ Not connected (WebSocket or REST).", "error-output");
            }
            return; // stop here, don't send to chat
        }

        // GMS commands
        if (cmd === "gms") {
            const sub = parts[1];
            if (sub === "connect") {
                const url = parts[2];
                if (!url) return addToConsole("> Error: Missing URL", "error-output");
                if (url.startsWith("http")) {
                    gashUseREST = true;
                    gashRESTUrl = url;
                    startRESTPolling();
                    addToConsole(`> Using REST API at ${url}`, "command-output");
                    return;
                }
                if (!url.startsWith("ws://") && !url.startsWith("wss://"))
                    return addToConsole("> Error: Invalid WebSocket URL.", "error-output");

                try {
                    gashWebSocket = new WebSocket(url);
                    gashWebSocketUrl = url;
                    gashWebSocket.onopen = () => {
                        addToConsole(`> Connected to WebSocket: ${url}`, "command-output");
                        updateConnectionStatus(true);
                    };
                    gashWebSocket.onmessage = e => {
                        try {
                            const rawMsg = JSON.parse(e.data);
                            const msg = validateMessage(rawMsg);
                            if (msg && msg.userId !== gashUserId) {
                                playPingSound();
                                addToConsole(`> ${msg.user}: ${msg.msg}`, "command-output");
                            }
                        } catch {
                            addToConsole(`> WS: ${sanitizeText(e.data)}`, "misc-output");
                        }
                    };
                    gashWebSocket.onerror = () => {
                        addToConsole("> WebSocket error. Switching to REST fallback.", "misc-urgent-output");
                        gashWebSocket = null;
                        gashUseREST = true;
                        gashRESTUrl = url.replace(/^ws/, "http");
                        startRESTPolling();
                    };
                    gashWebSocket.onclose = () => {
                        addToConsole("> WebSocket closed.", "misc-output");
                        gashWebSocket = null;
                        gashWebSocketUrl = null;
                        updateConnectionStatus(false);
                    };
                } catch (e) { addToConsole("> Error: " + sanitizeText(e.message), "error-output"); }
                return;
            }

            if (sub === "send") {
                const msg = parts.slice(2).join(" ");
                if (!msg) return addToConsole("> Error: No message", "error-output");
                const sanitizedMsg = sanitizeText(msg);
                if (gashUseREST) {
                    restSendMessage(sanitizedMsg);
                    addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output");
                } else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
                    gashWebSocket.send(JSON.stringify({ user: gashNickname, msg: sanitizedMsg, userId: gashUserId }));
                    addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output");
                } else addToConsole("> Error: Not connected.", "error-output");
                return;
            }

            if (sub === "disconnect") {
                if (gashWebSocket) {
                    gashWebSocket.close();
                    addToConsole("> Closing WebSocket...", "misc-output");
                }
                if (gashUseREST && gashRESTPoller) {
                    clearInterval(gashRESTPoller);
                    addToConsole("> Stopped REST polling.", "misc-output");
                    gashUseREST = false;
                }
                updateConnectionStatus(false);
                return;
            }

            if (sub === "check") {
                if (gashUseREST) addToConsole(`> Using REST at ${gashRESTUrl}`, "command-output");
                else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) addToConsole(`> Connected to WS: ${gashWebSocketUrl}`, "command-output");
                else addToConsole("> No active connection.", "misc-output");
                return;
            }

            addToConsole("> Usage: gms {connect|send|disconnect|check}", "error-output");
            return;
        }

        // SAY command
        if (cmd === "say") {
            const msg = parts.slice(1).join(" ");
            if (!msg) return addToConsole("> Error: No message", "error-output");
            const sanitizedMsg = sanitizeText(msg);
            if (gashUseREST) {
                restSendMessage(sanitizedMsg);
                addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output");
            } else if (gashWebSocket && gashWebSocket.readyState === WebSocket.OPEN) {
                gashWebSocket.send(JSON.stringify({ user: gashNickname, msg: sanitizedMsg, userId: gashUserId }));
                addToConsole(`> [ME] ${gashNickname}: ${sanitizedMsg}`, "command-output");
            } else addToConsole("> Error: Not connected.", "error-output");
            return;
        }

        addToConsole("> Unknown command", "error-output");
    }

    function processMarkdown(text) {
        // Code blocks (```code```)
        text = text.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);

        // Inline code (`code`)
        text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

        // Bold (**bold** or __bold__)
        text = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

        // Italic (*italic* or _italic_)
        text = text.replace(/(?<!\*)\*(?!\*)(.*?)\*(?!\*)/g, "<i>$1</i>");
        text = text.replace(/(?<!_)_(?!_)(.*?)_(?!_)/g, "<i>$1</i>");

        // Strikethrough (~~text~~)
        text = text.replace(/~~(.*?)~~/g, "<s>$1</s>");

        // Underline (__underline__)
        text = text.replace(/__(.*?)__/g, "<u>$1</u>");

        // Spoilers (||spoiler||)
        text = text.replace(/\|\|(.*?)\|\|/g, "<span class='spoiler'>$1</span>");

        // Links ([text](url))
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g, `<a href="$2" target="_blank">$1</a>`);
        return text;
    }

    function decodeHTMLEntities(str) {
        const txt = document.createElement("textarea");
        txt.innerHTML = str;
        return txt.value;
    }


    // heh. stuff

    function addToConsole(text, cssClass = "command-output") {
        const div = document.createElement("div");
        div.className = cssClass;

        // 1️⃣ Process emojis first
        let processedText = processEmojis(text);

        // 2️⃣ Convert markdown to HTML (adds <img>, <b>, <i>, <a>, etc.)
        processedText = processMarkdown(processedText);

        // 3️⃣ Sanitize HTML (keeps allowed tags, blocks XSS)
        processedText = sanitizeText(processedText);

        // 4️⃣ Render safely as HTML
        div.innerHTML = processedText;

        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }


    // Handle page visibility changes to manage audio context
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
    });

    // Touch event handling for mobile
    if (isMobile) {
        // Prevent default touch behaviors that might interfere
        document.addEventListener('touchstart', (e) => {
            // Allow normal touch on input elements
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
                return;
            }
        });

        // Handle mobile scrolling
        let touchStartY = 0;
        consoleOutput.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        });

        consoleOutput.addEventListener('touchmove', (e) => {
            e.preventDefault(); // Prevent body scroll
            const touchY = e.touches[0].clientY;
            const deltaY = touchStartY - touchY;
            consoleOutput.scrollTop += deltaY;
            touchStartY = touchY;
        });
    }

    // Init
    function initGMS() {
        renderInput();

        // Load saved theme
        let savedTheme = "default";
        try {
            savedTheme = localStorage.getItem("gmsTheme") || "default";
        } catch (e) {
            console.log("LocalStorage not available, using default theme");
        }

        applyTheme(savedTheme);

        // Load saved nickname
        try {
            gashNickname = localStorage.getItem("gmsNickname") || gashNickname;
        } catch (e) {
            console.log("LocalStorage not available, using default nickname");
        }

        addToConsole(`> Loaded Nickname: ${gashNickname}`, "misc-output");


        // Setup mobile input if on mobile device
        if (isMobile) {
            setupMobileInput();
            addToConsole("> 📱 Mobile interface enabled", "misc-output");
        }

        // Initialize connection status
        updateConnectionStatus(false);

    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initGMS);
    } else {
        initGMS();
    }
