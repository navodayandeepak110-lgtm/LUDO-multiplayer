const socket = io();

// State
let myPlayer = null;
let currentRoom = null;
let isMyTurn = false;
let validMovableTokens = [];

// Audio Synthesizer (Web Audio API)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
}

function playSound(type) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === "roll") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === "move") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.1);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === "capture") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.3);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === "win") {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.type = "sine";
        o.frequency.setValueAtTime(freq, now + idx * 0.15);
        g.gain.setValueAtTime(0.3, now + idx * 0.15);
        g.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.15 + 0.3);
        o.start(now + idx * 0.15);
        o.stop(now + idx * 0.15 + 0.3);
      });
    }
  } catch (e) {
    console.error("Audio error:", e);
  }
}

// Coordinate mappings for 15x15 board
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

const CENTER_HOME_COORDS = {
  red: [7, 6],
  green: [6, 7],
  yellow: [7, 8],
  blue: [8, 7]
};

const START_OFFSETS = { red: 0, green: 13, yellow: 26, blue: 39 };
const STAR_TILES = [8, 21, 34, 47];

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

const roomInfo = document.getElementById("room-info");
const displayRoomCode = document.getElementById("display-room-code");
const copyCodeBtn = document.getElementById("copy-code-btn");
const waitingCode = document.getElementById("waiting-code");
const waitingCopyBtn = document.getElementById("waiting-copy-btn");
const playersList = document.getElementById("players-list");
const hostControls = document.getElementById("host-controls");
const startGameBtn = document.getElementById("start-game-btn");

const ludoBoard = document.getElementById("ludo-board");
const diceElement = document.getElementById("dice");
const rollDiceBtn = document.getElementById("roll-dice-btn");
const diceHint = document.getElementById("dice-hint");
const turnBanner = document.getElementById("turn-banner");
const turnText = document.getElementById("turn-text");
const gamePlayersList = document.getElementById("game-players-list");

const activityLog = document.getElementById("activity-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const winModal = document.getElementById("win-modal");
const winnerTitle = document.getElementById("winner-title");
const winnerDesc = document.getElementById("winner-desc");

// Tab Switcher
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

// Build 15x15 Board Grid Layout
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

  // 5. Center Home (3x3 in middle)
  const centerHome = document.createElement("div");
  centerHome.className = "center-home";
  centerHome.innerHTML = `
    <svg viewBox="0 0 100 100">
      <polygon points="0,0 50,50 0,100" fill="#ef4444" />
      <polygon points="0,0 50,50 100,0" fill="#10b981" />
      <polygon points="100,0 50,50 100,100" fill="#f59e0b" />
      <polygon points="0,100 50,50 100,100" fill="#3b82f6" />
    </svg>`;
  ludoBoard.appendChild(centerHome);

  // 6. Generate regular track cells (excluding bases and center)
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      // Skip cells covered by bases or center
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

        // Color starts
        if (r === 6 && c === 1) cell.classList.add("cell-red-start");
        if (r === 1 && c === 8) cell.classList.add("cell-green-start");
        if (r === 8 && c === 13) cell.classList.add("cell-yellow-start");
        if (r === 13 && c === 6) cell.classList.add("cell-blue-start");

        // Color home runs
        if (r === 7 && c >= 1 && c <= 5) cell.classList.add("cell-red-home");
        if (c === 7 && r >= 1 && r <= 5) cell.classList.add("cell-green-home");
        if (r === 7 && c >= 9 && c <= 13) cell.classList.add("cell-yellow-home");
        if (c === 7 && r >= 9 && r <= 13) cell.classList.add("cell-blue-home");

        // Star safe spots
        if (
          (r === 2 && c === 6) ||
          (r === 6 && c === 12) ||
          (r === 12 && c === 8) ||
          (r === 8 && c === 2)
        ) {
          cell.innerHTML = '<span class="star-icon">★</span>';
        }

        const tokensContainer = document.createElement("div");
        tokensContainer.className = "cell-tokens-container";
        cell.appendChild(tokensContainer);

        ludoBoard.appendChild(cell);
      }
    }
  }
}

// Helper to get Board Cell for Coordinate
function getCellElement(r, c) {
  return document.getElementById(`cell-${r}-${c}`);
}

// Render Board Pieces
function renderBoard(gameState) {
  // 1. Clear all track cells
  document.querySelectorAll(".cell-tokens-container").forEach((cont) => {
    cont.innerHTML = "";
    cont.classList.remove("multi");
  });

  // 2. Clear all base slots
  document.querySelectorAll(".base-slot").forEach((slot) => {
    slot.innerHTML = "";
  });

  if (!gameState || !gameState.tokens) return;

  // Track map for pieces on board
  const occupiedCells = new Map();

  // 3. Place tokens
  currentRoom.players.forEach((player) => {
    const color = player.color;
    const tokenSteps = gameState.tokens[color] || [];

    tokenSteps.forEach((step, tokenIdx) => {
      const isMovable = isMyTurn && myPlayer.color === color && validMovableTokens.includes(tokenIdx);
      const tokenEl = document.createElement("div");
      tokenEl.className = `token token-${color} ${isMovable ? "selectable" : ""}`;
      tokenEl.dataset.tokenIndex = tokenIdx;
      tokenEl.dataset.color = color;

      if (isMovable) {
        tokenEl.addEventListener("click", () => {
          onTokenClick(tokenIdx);
        });
      }

      if (step === -1) {
        // Inside Base
        const baseSlot = document.getElementById(`slot-${color}-${tokenIdx}`);
        if (baseSlot) baseSlot.appendChild(tokenEl);
      } else if (step >= 0 && step < 51) {
        // Main Track
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
        // Home stretch
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
        // Reached Center Home
        tokenEl.style.transform = "scale(0.85)";
        tokenEl.title = "Home!";
        const [r, c] = CENTER_HOME_COORDS[color];
        const cell = getCellElement(r, c);
        if (cell) {
          const container = cell.querySelector(".cell-tokens-container");
          if (container) container.appendChild(tokenEl);
        }
      }
    });
  });
}

// Render Dice Faces
function updateDiceFace(value) {
  diceElement.className = `dice dice-${value || 1}`;
  diceElement.innerHTML = "";
  for (let i = 0; i < (value || 1); i++) {
    const dot = document.createElement("div");
    dot.className = "dot";
    diceElement.appendChild(dot);
  }
}

// Render Turn Status & Player List
function updateGameUI(room) {
  currentRoom = room;
  const currentPlayer = room.players[room.gameState.turnIndex];
  isMyTurn = currentPlayer && myPlayer && currentPlayer.id === myPlayer.id;

  // Turn Banner
  turnBanner.className = `turn-banner active-${currentPlayer.color}`;
  turnText.textContent = isMyTurn
    ? `✨ It's YOUR turn! (${currentPlayer.color.toUpperCase()})`
    : `⏳ ${currentPlayer.name}'s turn (${currentPlayer.color.toUpperCase()})`;

  // Dice controls
  if (isMyTurn) {
    if (!room.gameState.hasRolled) {
      rollDiceBtn.disabled = false;
      diceHint.textContent = "Click 'Roll Dice' or tap the dice!";
    } else {
      rollDiceBtn.disabled = true;
      diceHint.textContent = validMovableTokens.length > 0
        ? "Tap a glowing piece to move!"
        : "No valid moves. Passing turn...";
    }
  } else {
    rollDiceBtn.disabled = true;
    diceHint.textContent = `Waiting for ${currentPlayer.name}...`;
  }

  // Players list in sidebar
  gamePlayersList.innerHTML = "";
  room.players.forEach((p) => {
    const card = document.createElement("div");
    card.className = `game-player-card ${p.id === currentPlayer.id ? "current-turn" : ""}`;
    card.innerHTML = `
      <div>
        <span class="color-dot dot-${p.color}"></span>
        <strong>${p.name}</strong> ${p.id === myPlayer.id ? "(You)" : ""}
      </div>
      <span style="font-size:0.8rem; color:${p.connected ? "#10b981" : "#ef4444"}">
        ${p.connected ? "Online" : "Disconnected"}
      </span>
    `;
    gamePlayersList.appendChild(card);
  });

  renderBoard(room.gameState);
}

// Action Handlers
function onRollDice() {
  initAudio();
  if (!isMyTurn || currentRoom.gameState.hasRolled) return;
  playSound("roll");
  diceElement.classList.add("rolling");
  setTimeout(() => diceElement.classList.remove("rolling"), 500);
  socket.emit("roll_dice");
}

function onTokenClick(tokenIndex) {
  initAudio();
  if (!isMyTurn || !currentRoom.gameState.hasRolled) return;
  socket.emit("move_token", { tokenIndex });
}

rollDiceBtn.addEventListener("click", onRollDice);
diceElement.addEventListener("click", onRollDice);

// Room Actions
createRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Player 1";
  const maxPlayers = document.querySelector('input[name="max-players"]:checked').value;
  socket.emit("create_room", { playerName: name, maxPlayers });
});

joinRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Player 2";
  const code = roomCodeInput.value.trim();
  if (!code) {
    lobbyError.textContent = "Please enter a game code.";
    return;
  }
  socket.emit("join_room", { roomCode: code, playerName: name });
});

startGameBtn.addEventListener("click", () => {
  socket.emit("start_game");
});

function copyCode() {
  const code = currentRoom ? currentRoom.code : "";
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    alert(`Game code ${code} copied to clipboard! Share it with your friend.`);
  });
}

copyCodeBtn.addEventListener("click", copyCode);
waitingCopyBtn.addEventListener("click", copyCode);

// Chat Form
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit("send_message", { message: msg });
  chatInput.value = "";
});

function appendLog(text) {
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = text;
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
}

function appendChat(data) {
  const entry = document.createElement("div");
  entry.className = "chat-entry";
  entry.innerHTML = `<span class="sender" style="color:var(--${data.color})">${data.sender}:</span> <span>${data.text}</span>`;
  activityLog.appendChild(entry);
  activityLog.scrollTop = activityLog.scrollHeight;
}

// Socket Events
socket.on("room_joined", ({ roomCode, isHost, player, roomState }) => {
  myPlayer = player;
  currentRoom = roomState;

  displayRoomCode.textContent = roomCode;
  waitingCode.textContent = roomCode;
  roomInfo.classList.remove("hidden");

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
    item.className = "player-tag";
    item.innerHTML = `
      <div>
        <span class="color-dot dot-${p.color}"></span>
        <span>${p.name}</span>
      </div>
      <span>${p.color.toUpperCase()}</span>
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
  room.gameState.logs.forEach((log) => appendLog(log));
});

socket.on("dice_rolled", ({ room, diceValue, validMoves, autoPass }) => {
  currentRoom = room;
  validMovableTokens = validMoves || [];
  playSound("roll");
  updateDiceFace(diceValue);
  updateGameUI(room);

  appendLog(`${room.players[room.gameState.turnIndex].name} rolled a ${diceValue}.`);

  // Auto move if only 1 single valid move is available for convenience
  if (isMyTurn && validMoves.length === 1 && !autoPass) {
    setTimeout(() => {
      onTokenClick(validMoves[0]);
    }, 400);
  }
});

socket.on("token_moved", ({ room, movedToken, capturedTokens, bonusRoll }) => {
  validMovableTokens = [];
  currentRoom = room;

  playSound(capturedTokens.length > 0 ? "capture" : "move");
  updateGameUI(room);

  if (bonusRoll) {
    appendLog("⭐ Extra roll awarded!");
  }
});

socket.on("turn_passed", ({ room, reason }) => {
  validMovableTokens = [];
  currentRoom = room;
  updateGameUI(room);
  if (reason) appendLog(`Turn passed (${reason}).`);
});

socket.on("game_over", ({ room, winner }) => {
  currentRoom = room;
  updateGameUI(room);
  playSound("win");

  winnerTitle.textContent = `${winner.name} Won! 🏆`;
  winnerDesc.textContent = `${winner.name} (${winner.color.toUpperCase()}) successfully navigated all 4 tokens home!`;
  winModal.classList.remove("hidden");
});

socket.on("chat_message", (data) => {
  appendChat(data);
});

socket.on("player_disconnected", ({ player }) => {
  appendLog(`⚠️ ${player.name} disconnected.`);
});

socket.on("error_message", (msg) => {
  if (lobbyScreen.classList.contains("active")) {
    lobbyError.textContent = msg;
  } else {
    alert(msg);
  }
});

// Setup Initial Layout
buildBoardGrid();
