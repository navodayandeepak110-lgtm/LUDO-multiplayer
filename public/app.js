/* ===================================================
   MOBILE LUDO MULTIPLAYER - CLIENT JAVASCRIPT
   =================================================== */

const socket = io();

// State
let myPlayer = null;
let currentRoom = null;
let isMyTurn = false;
let validMovableTokens = [];
let soundEnabled = true;
let unreadChatCount = 0;
let isChatModalOpen = false;
let isDiceRolling = false;

// Audio Synthesizer (Realistic Dice Tumble + Game FX)
const AudioContextClass = window.AudioContext || window["webkitAudioContext"];
let audioCtx = null;

function initAudio() {
  if (!audioCtx && AudioContextClass) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Crisp Web Audio Synthesis
function playSound(type) {
  if (!soundEnabled) return;
  initAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;

    if (type === "roll") {
      // Multi-tap realistic dice tumbling physics
      const clatterDelays = [0, 0.08, 0.18, 0.28, 0.42];
      clatterDelays.forEach((delay, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const tapTime = now + delay;
        const isFinal = idx === clatterDelays.length - 1;

        osc.type = isFinal ? "triangle" : "sine";
        const freq = isFinal ? 180 : 300 + Math.random() * 250;
        osc.frequency.setValueAtTime(freq, tapTime);
        osc.frequency.exponentialRampToValueAtTime(80, tapTime + 0.06);

        const vol = isFinal ? 0.35 : 0.18 + Math.random() * 0.1;
        gain.gain.setValueAtTime(vol, tapTime);
        gain.gain.exponentialRampToValueAtTime(0.001, tapTime + 0.06);

        osc.start(tapTime);
        osc.stop(tapTime + 0.06);
      });
    } else if (type === "move") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.09);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === "capture") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(120, now + 0.3);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "reaction") {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(540, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === "romantic") {
      const notes = [440, 554.37, 659.25, 880];
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);

        o.type = "sine";
        const t = now + idx * 0.08;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        o.start(t);
        o.stop(t + 0.25);
      });
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = "triangle";
        const t = now + idx * 0.14;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.start(t);
        o.stop(t + 0.3);
      });
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// 15x15 Coordinate Mappings
const PATH_COORDS = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0]
];

const HOME_STRETCH_COORDS = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

const START_OFFSETS = { red: 0, green: 13, yellow: 26, blue: 39 };

// DOM Elements
const lobbyScreen = document.getElementById("lobby-screen");
const waitingScreen = document.getElementById("waiting-screen");
const gameScreen = document.getElementById("game-screen");

const playerNameInput = document.getElementById("player-name");
const roomCodeInput = document.getElementById("room-code-input");
const lobbyError = document.getElementById("lobby-error");

const tabCreateBtn = document.getElementById("tab-create-btn");
const tabJoinBtn = document.getElementById("tab-join-btn");
const createSection = document.getElementById("create-section");
const joinSection = document.getElementById("join-section");

const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");

const roomInfoPill = document.getElementById("room-info-pill");
const displayRoomCode = document.getElementById("display-room-code");
const copyCodeBtn = document.getElementById("copy-code-btn");
const waitingCode = document.getElementById("waiting-code");
const waitingCopyBtn = document.getElementById("waiting-copy-btn");
const playersList = document.getElementById("players-list");
const hostControls = document.getElementById("host-controls");
const startGameBtn = document.getElementById("start-game-btn");

const topPlayerZone = document.getElementById("top-player-zone");
const bottomPlayerZone = document.getElementById("bottom-player-zone");
const leftPlayerZone = document.getElementById("left-player-zone");
const rightPlayerZone = document.getElementById("right-player-zone");
const ludoBoard = document.getElementById("ludo-board");
const toastContainer = document.getElementById("toast-container");
const reactionOverlayLayer = document.getElementById("reaction-overlay-layer");

// Toolbar & Popups
const toolbarEmojiBtn = document.getElementById("toolbar-emoji-btn");
const toolbarChatBtn = document.getElementById("toolbar-chat-btn");
const toolbarMenuBtn = document.getElementById("toolbar-menu-btn");
const chatBadge = document.getElementById("chat-badge");

const quickReactionPanel = document.getElementById("quick-reaction-panel");
const qtabChatBtn = document.getElementById("qtab-chat-btn");
const qtabEmojiBtn = document.getElementById("qtab-emoji-btn");
const qtabLoveBtn = document.getElementById("qtab-love-btn");
const qpaneChat = document.getElementById("qpane-chat");
const qpaneEmoji = document.getElementById("qpane-emoji");
const qpaneLove = document.getElementById("qpane-love");

const chatModal = document.getElementById("chat-modal");
const closeChatBtn = document.getElementById("close-chat-btn");
const chatMessagesContainer = document.getElementById("chat-messages-container");
const fullChatForm = document.getElementById("full-chat-form");
const fullChatInput = document.getElementById("full-chat-input");
const chatEmojiToggleBtn = document.getElementById("chat-emoji-toggle-btn");

const menuModal = document.getElementById("menu-modal");
const closeMenuBtn = document.getElementById("close-menu-btn");
const menuRulesBtn = document.getElementById("menu-rules-btn");
const menuCopyBtn = document.getElementById("menu-copy-btn");
const menuSoundBtn = document.getElementById("menu-sound-btn");
const soundIcon = document.getElementById("sound-icon");
const soundStatusText = document.getElementById("sound-status-text");
const menuRoomCode = document.getElementById("menu-room-code");
const menuLeaveBtn = document.getElementById("menu-leave-btn");

const rulesModal = document.getElementById("rules-modal");
const closeRulesBtn = document.getElementById("close-rules-btn");

const winModal = document.getElementById("win-modal");
const winnerTitle = document.getElementById("winner-title");
const winnerDesc = document.getElementById("winner-desc");

// Tab Switcher (Lobby)
tabCreateBtn.addEventListener("click", () => {
  tabCreateBtn.classList.add("active");
  tabJoinBtn.classList.remove("active");
  createSection.classList.add("active");
  joinSection.classList.remove("active");
  lobbyError.textContent = "";
});

tabJoinBtn.addEventListener("click", () => {
  tabJoinBtn.classList.add("active");
  tabCreateBtn.classList.remove("active");
  joinSection.classList.add("active");
  createSection.classList.remove("active");
  lobbyError.textContent = "";
});

// Quick Reaction Tabs
qtabChatBtn.addEventListener("click", () => {
  qtabChatBtn.classList.add("active");
  qtabEmojiBtn.classList.remove("active");
  qtabLoveBtn.classList.remove("active");
  qpaneChat.classList.add("active");
  qpaneEmoji.classList.remove("active");
  qpaneLove.classList.remove("active");
});

qtabEmojiBtn.addEventListener("click", () => {
  qtabEmojiBtn.classList.add("active");
  qtabChatBtn.classList.remove("active");
  qtabLoveBtn.classList.remove("active");
  qpaneEmoji.classList.add("active");
  qpaneChat.classList.remove("active");
  qpaneLove.classList.remove("active");
});

qtabLoveBtn.addEventListener("click", () => {
  qtabLoveBtn.classList.add("active");
  qtabChatBtn.classList.remove("active");
  qtabEmojiBtn.classList.remove("active");
  qpaneLove.classList.add("active");
  qpaneChat.classList.remove("active");
  qpaneEmoji.classList.remove("active");
});

// Toolbar Actions
toolbarEmojiBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  initAudio();
  quickReactionPanel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!quickReactionPanel.classList.contains("hidden") &&
      !quickReactionPanel.contains(e.target) &&
      e.target !== toolbarEmojiBtn &&
      !toolbarEmojiBtn.contains(e.target)) {
    quickReactionPanel.classList.add("hidden");
  }
});

toolbarChatBtn.addEventListener("click", () => {
  initAudio();
  openChatModal();
});

closeChatBtn.addEventListener("click", () => {
  closeChatModal();
});

function openChatModal() {
  chatModal.classList.remove("hidden");
  isChatModalOpen = true;
  unreadChatCount = 0;
  chatBadge.classList.add("hidden");
  chatBadge.textContent = "0";
  setTimeout(() => {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }, 50);
}

function closeChatModal() {
  chatModal.classList.add("hidden");
  isChatModalOpen = false;
}

chatEmojiToggleBtn.addEventListener("click", () => {
  quickReactionPanel.classList.toggle("hidden");
});

// Menu Actions
toolbarMenuBtn.addEventListener("click", () => {
  initAudio();
  menuModal.classList.remove("hidden");
  if (currentRoom) {
    menuRoomCode.textContent = "Code: " + currentRoom.code;
  }
});

closeMenuBtn.addEventListener("click", () => {
  menuModal.classList.add("hidden");
});

menuRulesBtn.addEventListener("click", () => {
  menuModal.classList.add("hidden");
  rulesModal.classList.remove("hidden");
});

closeRulesBtn.addEventListener("click", () => {
  rulesModal.classList.add("hidden");
});

menuSoundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundIcon.textContent = soundEnabled ? "🔊" : "🔇";
  soundStatusText.textContent = soundEnabled ? "Sound: ON" : "Sound: OFF";
  showToast(soundEnabled ? "🔊 Sound Enabled" : "🔇 Sound Muted");
});

menuCopyBtn.addEventListener("click", copyCode);

menuLeaveBtn.addEventListener("click", () => {
  if (confirm("Are you sure you want to leave the game?")) {
    socket.emit("leave_room");
    location.reload();
  }
});

// Toast system
function showToast(text) {
  const toast = document.createElement("div");
  toast.className = "game-toast";
  toast.textContent = text;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 2500);
}

// 1-Tap Fast Chat click handler
document.querySelectorAll(".fast-chat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    initAudio();
    const msg = btn.getAttribute("data-msg");
    socket.emit("send_reaction", { type: "fast_chat", content: msg, isRomantic: false });
    quickReactionPanel.classList.add("hidden");
  });
});

// 1-Tap Emoji click handler
document.querySelectorAll(".quick-emoji-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    initAudio();
    const emoji = btn.getAttribute("data-emoji");
    const isRomantic = btn.classList.contains("romantic");
    socket.emit("send_reaction", { type: "emoji", content: emoji, isRomantic: isRomantic });
    quickReactionPanel.classList.add("hidden");
  });
});

// ROBUST MULTIPLAYER FLOATING REACTION RENDERER
function displayPlayerReaction(data) {
  const { senderId, sender, color, type, content, isRomantic } = data;
  playSound(isRomantic ? "romantic" : "reaction");

  // Determine screen coordinates of the sender's avatar
  let targetX = window.innerWidth / 2;
  let targetY = window.innerHeight * 0.35;

  const playerCard = document.querySelector(`[data-player-id="${senderId}"]`) || 
                     document.querySelector(`[data-player-color="${color}"]`);

  if (playerCard) {
    const rect = playerCard.getBoundingClientRect();
    targetX = rect.left + rect.width / 2;
    targetY = rect.top;
  } else {
    // Default 1v1 positioning fallback
    const isMe = myPlayer && (senderId === myPlayer.id || color === myPlayer.color);
    if (isMe) {
      targetX = window.innerWidth * 0.25;
      targetY = window.innerHeight * 0.82;
    } else {
      targetX = window.innerWidth * 0.75;
      targetY = window.innerHeight * 0.12;
    }
  }

  if (type === "fast_chat") {
    const bubble = document.createElement("div");
    bubble.className = "overlay-reaction-bubble";
    bubble.textContent = content;
    bubble.style.left = `${targetX}px`;
    bubble.style.top = `${targetY}px`;
    reactionOverlayLayer.appendChild(bubble);

    setTimeout(() => {
      if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
    }, 3000);

    // Sync to Chat history
    appendChatMessage({
      sender,
      color,
      text: content,
      time: data.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isMine: myPlayer && (senderId === myPlayer.id || color === myPlayer.color)
    });
  } else if (type === "emoji") {
    const emojiEl = document.createElement("div");
    emojiEl.className = "overlay-floating-emoji";
    emojiEl.textContent = content;
    emojiEl.style.left = `${targetX}px`;
    emojiEl.style.top = `${targetY}px`;
    reactionOverlayLayer.appendChild(emojiEl);

    setTimeout(() => {
      if (emojiEl.parentNode) emojiEl.parentNode.removeChild(emojiEl);
    }, 2200);

    // Romantic Heart Particle Constellation
    if (isRomantic) {
      for (let i = 0; i < 7; i++) {
        setTimeout(() => {
          const h = document.createElement("div");
          h.className = "overlay-heart-particle";
          h.textContent = ["❤️", "💖", "✨", "💕", "💋", "🫶", "🌹"][Math.floor(Math.random() * 7)];
          const tx = (Math.random() - 0.5) * 120;
          const ty = -(80 + Math.random() * 90);
          h.style.setProperty("--tx", `${tx}px`);
          h.style.setProperty("--ty", `${ty}px`);
          h.style.left = `${targetX}px`;
          h.style.top = `${targetY}px`;
          reactionOverlayLayer.appendChild(h);

          setTimeout(() => {
            if (h.parentNode) h.parentNode.removeChild(h);
          }, 2500);
        }, i * 130);
      }
    }
  }
}

// Build 15x15 Ludo Board Grid Layout
function buildBoardGrid() {
  ludoBoard.innerHTML = "";

  // 1. Red Base (Top-Left 6x6)
  const redBase = document.createElement("div");
  redBase.className = "base-red";
  redBase.innerHTML = `
    <div class="base-inner">
      <div class="base-slot" id="slot-red-0"></div>
      <div class="base-slot" id="slot-red-1"></div>
      <div class="base-slot" id="slot-red-2"></div>
      <div class="base-slot" id="slot-red-3"></div>
    </div>`;
  ludoBoard.appendChild(redBase);

  // 2. Green Base (Top-Right 6x6)
  const greenBase = document.createElement("div");
  greenBase.className = "base-green";
  greenBase.innerHTML = `
    <div class="base-inner">
      <div class="base-slot" id="slot-green-0"></div>
      <div class="base-slot" id="slot-green-1"></div>
      <div class="base-slot" id="slot-green-2"></div>
      <div class="base-slot" id="slot-green-3"></div>
    </div>`;
  ludoBoard.appendChild(greenBase);

  // 3. Yellow Base (Bottom-Right 6x6)
  const yellowBase = document.createElement("div");
  yellowBase.className = "base-yellow";
  yellowBase.innerHTML = `
    <div class="base-inner">
      <div class="base-slot" id="slot-yellow-0"></div>
      <div class="base-slot" id="slot-yellow-1"></div>
      <div class="base-slot" id="slot-yellow-2"></div>
      <div class="base-slot" id="slot-yellow-3"></div>
    </div>`;
  ludoBoard.appendChild(yellowBase);

  // 4. Blue Base (Bottom-Left 6x6)
  const blueBase = document.createElement("div");
  blueBase.className = "base-blue";
  blueBase.innerHTML = `
    <div class="base-inner">
      <div class="base-slot" id="slot-blue-0"></div>
      <div class="base-slot" id="slot-blue-1"></div>
      <div class="base-slot" id="slot-blue-2"></div>
      <div class="base-slot" id="slot-blue-3"></div>
    </div>`;
  ludoBoard.appendChild(blueBase);

  // 5. Center Home (3x3 in middle) with 4 triangular home slots
  const centerHome = document.createElement("div");
  centerHome.className = "center-home";
  centerHome.innerHTML = `
    <svg viewBox="0 0 100 100">
      <polygon points="0,0 50,50 0,100" fill="#ef4444" />
      <polygon points="0,0 50,50 100,0" fill="#10b981" />
      <polygon points="100,0 50,50 100,100" fill="#f59e0b" />
      <polygon points="0,100 50,50 100,100" fill="#3b82f6" />
    </svg>
    <div class="center-home-slots">
      <div class="center-slot slot-red" id="center-home-red"></div>
      <div class="center-slot slot-green" id="center-home-green"></div>
      <div class="center-slot slot-yellow" id="center-home-yellow"></div>
      <div class="center-slot slot-blue" id="center-home-blue"></div>
    </div>`;
  ludoBoard.appendChild(centerHome);

  // 6. Regular track cells
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const inRedBase = r < 6 && c < 6;
      const inGreenBase = r < 6 && c > 8;
      const inYellowBase = r > 8 && c > 8;
      const inBlueBase = r > 8 && c < 6;
      const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

      if (!inRedBase && !inGreenBase && !inYellowBase && !inBlueBase && !inCenter) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridRow = `${r + 1} / ${r + 2}`;
        cell.style.gridColumn = `${c + 1} / ${c + 2}`;
        cell.id = `cell-${r}-${c}`;

        // Start tiles
        if (r === 6 && c === 1) cell.classList.add("cell-red-start");
        if (r === 1 && c === 8) cell.classList.add("cell-green-start");
        if (r === 8 && c === 13) cell.classList.add("cell-yellow-start");
        if (r === 13 && c === 6) cell.classList.add("cell-blue-start");

        // Home stretches
        if (r === 7 && c >= 1 && c <= 5) cell.classList.add("cell-red-home");
        if (c === 7 && r >= 1 && r <= 5) cell.classList.add("cell-green-home");
        if (r === 7 && c >= 9 && c <= 13) cell.classList.add("cell-yellow-home");
        if (c === 7 && r >= 9 && r <= 13) cell.classList.add("cell-blue-home");

        // Safe star spot cells
        if (
          (r === 2 && c === 6) ||
          (r === 6 && c === 12) ||
          (r === 12 && c === 8) ||
          (r === 8 && c === 2)
        ) {
          cell.innerHTML = '<span class="star-icon">★</span>';
        }

        // Colored entry arrows
        if (r === 7 && c === 0) cell.innerHTML = '<span class="entry-arrow" style="color:var(--red);">▶</span>';
        if (r === 0 && c === 7) cell.innerHTML = '<span class="entry-arrow" style="color:var(--green);">▼</span>';
        if (r === 7 && c === 14) cell.innerHTML = '<span class="entry-arrow" style="color:var(--yellow);">◀</span>';
        if (r === 14 && c === 7) cell.innerHTML = '<span class="entry-arrow" style="color:var(--blue);">▲</span>';

        const tokensContainer = document.createElement("div");
        tokensContainer.className = "cell-tokens-container";
        cell.appendChild(tokensContainer);

        ludoBoard.appendChild(cell);
      }
    }
  }
}

function getCellElement(r, c) {
  return document.getElementById(`cell-${r}-${c}`);
}

// Render Board Pieces with strict aspect-ratio & transform cleanup
function renderBoard(gameState) {
  document.querySelectorAll(".cell-tokens-container").forEach((cont) => {
    cont.innerHTML = "";
    cont.classList.remove("multi");
  });

  document.querySelectorAll(".base-slot").forEach((slot) => {
    slot.innerHTML = "";
  });

  document.querySelectorAll(".center-slot").forEach((slot) => {
    slot.innerHTML = "";
  });

  if (!gameState || !gameState.tokens) return;

  currentRoom.players.forEach((player) => {
    const color = player.color;
    const tokenSteps = gameState.tokens[color] || [];

    tokenSteps.forEach((step, tokenIdx) => {
      const isMovable = isMyTurn && myPlayer.color === color && validMovableTokens.includes(tokenIdx);
      const tokenEl = document.createElement("div");
      tokenEl.className = `token token-${color} ${isMovable ? "selectable" : ""}`;
      tokenEl.dataset.tokenIndex = tokenIdx;
      tokenEl.dataset.color = color;
      // Clean any inline transform state
      tokenEl.style.transform = "";

      if (isMovable) {
        tokenEl.addEventListener("click", () => {
          onTokenClick(tokenIdx);
        });
      }

      if (step === -1) {
        const baseSlot = document.getElementById(`slot-${color}-${tokenIdx}`);
        if (baseSlot) baseSlot.appendChild(tokenEl);
      } else if (step >= 0 && step < 51) {
        const globalIdx = (START_OFFSETS[color] + step) % 52;
        const [r, c] = PATH_COORDS[globalIdx];
        const cell = getCellElement(r, c);
        if (cell) {
          const container = cell.querySelector(".cell-tokens-container");
          if (container) {
            container.appendChild(tokenEl);
            if (container.children.length > 1) {
              container.classList.add("multi");
            }
          }
        }
      } else if (step >= 51 && step <= 55) {
        const stretchIdx = step - 51;
        const [r, c] = HOME_STRETCH_COORDS[color][stretchIdx];
        const cell = getCellElement(r, c);
        if (cell) {
          const container = cell.querySelector(".cell-tokens-container");
          if (container) {
            container.appendChild(tokenEl);
            if (container.children.length > 1) {
              container.classList.add("multi");
            }
          }
        }
      } else if (step === 56) {
        tokenEl.title = "Home!";
        const centerHomeSlot = document.getElementById(`center-home-${color}`);
        if (centerHomeSlot) {
          centerHomeSlot.appendChild(tokenEl);
        }
      }
    });
  });
}

// Render Player Profile Card HTML
function createPlayerProfileHTML(player, isCurrentTurn, isMe) {
  const isFemale = player.name.toLowerCase().includes("vandana") || player.name.toLowerCase().includes("girl");
  const avatarChar = isFemale ? "👩" : (isMe ? "👤" : "🧑");
  return `
    <div class="player-profile-card ${isCurrentTurn ? "active-turn" : ""}" data-player-id="${player.id}" data-player-color="${player.color}">
      <div class="avatar-wrapper">
        <div class="avatar-frame">
          <span class="avatar-char">${avatarChar}</span>
        </div>
        <div class="avatar-gift-badge">🎁</div>
        ${isCurrentTurn ? `<div class="avatar-turn-badge">${isMe ? "YOUR TURN" : "TURN"}</div>` : ""}
      </div>
      <div class="player-details">
        <div class="player-name-row">
          <span class="player-flag">🇮🇳</span>
          <strong class="player-title">${player.name} ${isMe ? "(You)" : ""}</strong>
        </div>
        <div class="player-status-row">
          <span class="status-dot ${player.connected ? "" : "offline"}"></span>
          <span class="player-color-pill ${player.color}">${player.color.toUpperCase()}</span>
        </div>
      </div>
    </div>
  `;
}

// Render Dice Controls Attached to Local Player
function createDiceControlsHTML(diceValue, canRoll) {
  const dotsHtml = Array.from({ length: diceValue || 1 }, () => '<div class="dice-dot"></div>').join("");
  return `
    <div class="dice-interactive-container">
      <div class="dice-box ${canRoll && !isDiceRolling ? "active" : ""}" id="game-dice-box" title="Tap to Roll">
        <div class="dice-3d dice-face-${diceValue || 1}" id="game-dice-cube">
          ${dotsHtml}
        </div>
      </div>
      <div class="dice-action-tag">
        <button class="roll-btn-pill" id="action-roll-btn" ${canRoll && !isDiceRolling ? "" : "disabled"}>
          ROLL
        </button>
        <span class="dice-hint-txt">${canRoll ? "Your turn to roll!" : (isMyTurn ? "Select a token" : "Waiting...")}</span>
      </div>
    </div>
  `;
}

// Update Game Screen UI
function updateGameUI(room) {
  currentRoom = room;
  const currentPlayer = room.players[room.gameState.turnIndex];
  isMyTurn = currentPlayer && myPlayer && currentPlayer.id === myPlayer.id;
  const canRoll = isMyTurn && !room.gameState.hasRolled;

  // Split players into Opponents (Top / Sides) and Me (Bottom)
  const opponents = room.players.filter((p) => p.id !== myPlayer.id);

  // Top Opponent Zone (Primary Opponent in 2P, e.g. Vandana)
  topPlayerZone.innerHTML = "";
  if (opponents.length >= 1) {
    const primaryOpponent = opponents[0];
    const isCurrent = primaryOpponent.id === currentPlayer.id;
    topPlayerZone.innerHTML = createPlayerProfileHTML(primaryOpponent, isCurrent, false);
  }

  // Side Opponents (for 3P / 4P games)
  leftPlayerZone.innerHTML = "";
  rightPlayerZone.innerHTML = "";
  if (opponents.length >= 2) {
    leftPlayerZone.style.display = "flex";
    const isCurrent = opponents[1].id === currentPlayer.id;
    leftPlayerZone.innerHTML = createPlayerProfileHTML(opponents[1], isCurrent, false);
  } else {
    leftPlayerZone.style.display = "none";
  }

  if (opponents.length >= 3) {
    rightPlayerZone.style.display = "flex";
    const isCurrent = opponents[2].id === currentPlayer.id;
    rightPlayerZone.innerHTML = createPlayerProfileHTML(opponents[2], isCurrent, false);
  } else {
    rightPlayerZone.style.display = "none";
  }

  // Bottom Zone: My Profile + Interactive 3D Dice
  bottomPlayerZone.innerHTML = "";
  const isMyTurnActive = currentPlayer && myPlayer && currentPlayer.id === myPlayer.id;
  const myProfileHtml = createPlayerProfileHTML(myPlayer, isMyTurnActive, true);
  const diceControlsHtml = createDiceControlsHTML(room.gameState.diceValue, canRoll);
  bottomPlayerZone.innerHTML = myProfileHtml + diceControlsHtml;

  // Attach Dice click listeners
  const diceBox = document.getElementById("game-dice-box");
  const actionRollBtn = document.getElementById("action-roll-btn");
  if (diceBox && canRoll && !isDiceRolling) diceBox.addEventListener("click", onRollDice);
  if (actionRollBtn && canRoll && !isDiceRolling) actionRollBtn.addEventListener("click", onRollDice);

  renderBoard(room.gameState);
}

// Action Handlers
function onRollDice() {
  initAudio();
  if (!isMyTurn || currentRoom.gameState.hasRolled || isDiceRolling) return;
  isDiceRolling = true;

  // Disable button immediately
  const actionRollBtn = document.getElementById("action-roll-btn");
  if (actionRollBtn) actionRollBtn.disabled = true;

  playSound("roll");

  const diceCube = document.getElementById("game-dice-cube");
  if (diceCube) {
    diceCube.classList.add("rolling");
  }

  socket.emit("roll_dice");
}

function onTokenClick(tokenIndex) {
  initAudio();
  if (!isMyTurn || !currentRoom.gameState.hasRolled) return;
  socket.emit("move_token", { tokenIndex });
}

// Room Actions
createRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Deepak";
  const maxPlayers = document.querySelector('input[name="max-players"]:checked').value;
  socket.emit("create_room", { playerName: name, maxPlayers });
});

joinRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Vandana";
  const code = roomCodeInput.value.trim();
  if (!code) {
    lobbyError.textContent = "Please enter a room code.";
    return;
  }
  socket.emit("join_room", { roomCode: code, playerName: name });
});

startGameBtn.addEventListener("click", () => {
  initAudio();
  socket.emit("start_game");
});

function copyCode() {
  const code = currentRoom ? currentRoom.code : "";
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`📋 Code ${code} copied to clipboard!`);
  });
}

copyCodeBtn.addEventListener("click", copyCode);
waitingCopyBtn.addEventListener("click", copyCode);

// Full Chat Form
fullChatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = fullChatInput.value.trim();
  if (!msg) return;
  socket.emit("send_message", { message: msg });
  fullChatInput.value = "";
});

function appendChatMessage(data) {
  const { sender, color, text, time, isMine } = data;
  const msgRow = document.createElement("div");
  msgRow.className = `chat-msg-row ${isMine ? "mine" : "opponent"}`;
  msgRow.innerHTML = `
    <span class="chat-msg-sender" style="color:var(--${color})">${sender}</span>
    <div class="chat-msg-bubble">${text}</div>
    <span class="chat-msg-time">${time}</span>
  `;
  chatMessagesContainer.appendChild(msgRow);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  if (!isChatModalOpen && !isMine) {
    unreadChatCount++;
    chatBadge.textContent = String(unreadChatCount);
    chatBadge.classList.remove("hidden");
    showToast(`💬 ${sender}: ${text.substring(0, 25)}`);
  }
}

// Socket Events
socket.on("room_joined", ({ roomCode, isHost, player, roomState }) => {
  myPlayer = player;
  currentRoom = roomState;

  displayRoomCode.textContent = roomCode;
  waitingCode.textContent = roomCode;
  roomInfoPill.classList.remove("hidden");

  lobbyScreen.classList.remove("active");
  waitingScreen.classList.add("active");

  renderWaitingPlayers(roomState);

  if (isHost) {
    hostControls.classList.remove("hidden");
  }
});

socket.on("room_updated", (room) => {
  currentRoom = room;
  renderWaitingPlayers(room);
});

function renderWaitingPlayers(room) {
  playersList.innerHTML = "";
  room.players.forEach((p) => {
    const item = document.createElement("div");
    item.className = "player-status-tag";
    item.innerHTML = `
      <div class="player-tag-left">
        <span class="color-badge ${p.color}"></span>
        <span>${p.name} ${myPlayer && p.id === myPlayer.id ? "(You)" : ""}</span>
      </div>
      <span style="color:var(--${p.color});font-weight:700;">${p.color.toUpperCase()}</span>
    `;
    playersList.appendChild(item);
  });
}

socket.on("game_started", (room) => {
  currentRoom = room;
  waitingScreen.classList.remove("active");
  gameScreen.classList.add("active");

  buildBoardGrid();
  updateGameUI(room);
  showToast(`🎲 Game Started! ${room.players[0].name}'s turn`);
});

// Realistic Multi-Frame Dice Deceleration Sequence
socket.on("dice_rolled", ({ room, diceValue, validMoves, autoPass }) => {
  currentRoom = room;
  validMovableTokens = validMoves || [];
  const diceCube = document.getElementById("game-dice-cube");

  // Multi-frame face tumbling animation before settling
  let frameCount = 0;
  const maxFrames = 7;
  const frameIntervals = [45, 55, 65, 80, 100, 130, 160];

  function runDiceCycle() {
    if (frameCount < maxFrames) {
      const randVal = Math.floor(Math.random() * 6) + 1;
      if (diceCube) {
        diceCube.className = `dice-3d rolling dice-face-${randVal}`;
        diceCube.innerHTML = Array.from({ length: randVal }, () => '<div class="dice-dot"></div>').join("");
      }
      const delay = frameIntervals[frameCount] || 80;
      frameCount++;
      setTimeout(runDiceCycle, delay);
    } else {
      // Settle on the server's actual dice value
      isDiceRolling = false;
      if (diceCube) {
        diceCube.className = `dice-3d dice-face-${diceValue}`;
        diceCube.innerHTML = Array.from({ length: diceValue }, () => '<div class="dice-dot"></div>').join("");
      }
      updateGameUI(room);

      const rollingPlayer = room.players[room.gameState.turnIndex];
      if (diceValue === 6) {
        showToast(`🎉 ${rollingPlayer.name} rolled a 6! Extra roll!`);
      }

      // Convenient auto-move if only 1 single valid token move
      if (isMyTurn && validMoves.length === 1 && !autoPass) {
        setTimeout(() => {
          onTokenClick(validMoves[0]);
        }, 450);
      }
    }
  }

  runDiceCycle();
});

socket.on("token_moved", ({ room, capturedTokens, bonusRoll }) => {
  validMovableTokens = [];
  currentRoom = room;
  isDiceRolling = false;

  if (capturedTokens && capturedTokens.length > 0) {
    playSound("capture");
    showToast(`💥 Token Captured! Extra turn awarded!`);
  } else {
    playSound("move");
  }

  if (bonusRoll && (!capturedTokens || capturedTokens.length === 0)) {
    showToast("⭐ Extra turn awarded!");
  }

  updateGameUI(room);
});

socket.on("turn_passed", ({ room, reason }) => {
  validMovableTokens = [];
  currentRoom = room;
  isDiceRolling = false;
  updateGameUI(room);
  if (reason) showToast(`Turn passed: ${reason}`);
});

socket.on("game_over", ({ room, winner }) => {
  currentRoom = room;
  updateGameUI(room);
  playSound("win");

  winnerTitle.textContent = `${winner.name} Won! 🏆`;
  winnerDesc.textContent = `${winner.name} successfully navigated all 4 tokens to Home!`;
  winModal.classList.remove("hidden");
});

socket.on("chat_message", (data) => {
  appendChatMessage({
    ...data,
    isMine: myPlayer && data.senderId === myPlayer.id
  });
});

socket.on("player_reaction", (data) => {
  displayPlayerReaction(data);
});

socket.on("player_disconnected", ({ player }) => {
  showToast(`⚠️ ${player.name} disconnected.`);
});

socket.on("error_message", (msg) => {
  if (lobbyScreen.classList.contains("active")) {
    lobbyError.textContent = msg;
  } else {
    showToast(`⚠️ ${msg}`);
  }
});

// Setup Initial Layout
buildBoardGrid();
