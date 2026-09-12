const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

// --- GAME LOGIC CONSTANTS ---
const COLORS = ["red", "green", "yellow", "blue"];
const START_OFFSETS = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39
};
const SAFE_TILES = [0, 8, 13, 21, 26, 34, 39, 47]; // 4 start tiles + 4 star tiles

const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getGlobalTileIndex(color, step) {
  if (step < 0 || step >= 51) return null; // In yard, home stretch, or home
  return (START_OFFSETS[color] + step) % 52;
}

function getValidMoves(room) {
  const { gameState, players } = room;
  const currentPlayer = players[gameState.turnIndex];
  if (!currentPlayer || !gameState.hasRolled || gameState.diceValue === null) {
    return [];
  }

  const color = currentPlayer.color;
  const dice = gameState.diceValue;
  const tokenSteps = gameState.tokens[color];
  const validTokenIndices = [];

  tokenSteps.forEach((step, idx) => {
    if (step === -1 && dice === 6) {
      validTokenIndices.push(idx);
    } else if (step >= 0 && step < 56) {
      if (step + dice <= 56) {
        validTokenIndices.push(idx);
      }
    }
  });

  return validTokenIndices;
}

function advanceTurn(room, reason = "") {
  room.gameState.consecutiveSixes = 0;
  room.gameState.diceValue = null;
  room.gameState.hasRolled = false;

  let attempts = 0;
  do {
    room.gameState.turnIndex = (room.gameState.turnIndex + 1) % room.players.length;
    attempts++;
  } while (!room.players[room.gameState.turnIndex].connected && attempts < room.players.length);
}

function checkWinner(room, color) {
  const tokens = room.gameState.tokens[color];
  return tokens.every((step) => step === 56);
}

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create Room
  socket.on("create_room", ({ playerName, maxPlayers }) => {
    let roomCode = generateRoomCode();
    while (rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const playerMax = Math.min(Math.max(parseInt(maxPlayers) || 2, 2), 4);
    const room = {
      code: roomCode,
      hostId: socket.id,
      maxPlayers: playerMax,
      status: "waiting",
      players: [
        {
          id: socket.id,
          name: playerName ? playerName.trim().substring(0, 15) : "Player 1",
          color: COLORS[0],
          connected: true
        }
      ],
      gameState: {
        turnIndex: 0,
        diceValue: null,
        hasRolled: false,
        consecutiveSixes: 0,
        tokens: {
          red: [-1, -1, -1, -1],
          green: [-1, -1, -1, -1],
          yellow: [-1, -1, -1, -1],
          blue: [-1, -1, -1, -1]
        },
        winner: null,
        logs: [`Room ${roomCode} created. Waiting for players...`]
      }
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit("room_joined", {
      roomCode,
      isHost: true,
      player: room.players[0],
      roomState: room
    });
  });

  // Join Room
  socket.on("join_room", ({ roomCode, playerName }) => {
    const code = (roomCode || "").toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit("error_message", "Room not found. Please check the code.");
    }

    if (room.status === "playing") {
      return socket.emit("error_message", "This game has already started.");
    }

    if (room.players.length >= room.maxPlayers) {
      return socket.emit("error_message", "Room is already full.");
    }

    // For 2 players, use opposite colors (Red vs Yellow or Red vs Green)
    let assignedColor;
    if (room.maxPlayers === 2 && room.players.length === 1) {
      assignedColor = "yellow"; // Great 2-player contrast (opposite sides)
    } else {
      const takenColors = room.players.map((p) => p.color);
      assignedColor = COLORS.find((c) => !takenColors.includes(c)) || COLORS[room.players.length];
    }

    const newPlayer = {
      id: socket.id,
      name: playerName ? playerName.trim().substring(0, 15) : `Player ${room.players.length + 1}`,
      color: assignedColor,
      connected: true
    };

    room.players.push(newPlayer);
    socket.join(code);
    socket.roomCode = code;

    room.gameState.logs.push(`${newPlayer.name} (${newPlayer.color.toUpperCase()}) joined the room.`);

    socket.emit("room_joined", {
      roomCode: code,
      isHost: false,
      player: newPlayer,
      roomState: room
    });

    // Notify all players in room
    io.to(code).emit("room_updated", room);

    // Auto-start game if room is full
    if (room.players.length === room.maxPlayers) {
      room.status = "playing";
      room.gameState.logs.push(`All players connected! Game started. ${room.players[0].name}'s turn!`);
      io.to(code).emit("game_started", room);
    }
  });

  // Start game manually (Host only)
  socket.on("start_game", () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) {
      return socket.emit("error_message", "At least 2 players are needed to start.");
    }

    room.status = "playing";
    room.gameState.logs.push(`Game started by host! ${room.players[0].name}'s turn.`);
    io.to(room.code).emit("game_started", room);
  });

  // Roll Dice
  socket.on("roll_dice", () => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.status !== "playing") return;

    const currentPlayer = room.players[room.gameState.turnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit("error_message", "It is not your turn!");
    }

    if (room.gameState.hasRolled) {
      return socket.emit("error_message", "You have already rolled. Please move a token.");
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;
    room.gameState.diceValue = diceValue;
    room.gameState.hasRolled = true;

    if (diceValue === 6) {
      room.gameState.consecutiveSixes++;
    } else {
      room.gameState.consecutiveSixes = 0;
    }

    room.gameState.logs.push(`${currentPlayer.name} rolled a ${diceValue}!`);

    // Rule: 3 consecutive 6s cancel turn
    if (room.gameState.consecutiveSixes >= 3) {
      room.gameState.logs.push(`Three 6s in a row! Turn forfeited.`);
      advanceTurn(room, "3 consecutive sixes");
      io.to(room.code).emit("turn_passed", {
        room,
        diceValue,
        reason: "Three 6s in a row!"
      });
      return;
    }

    const validMoves = getValidMoves(room);

    // If no valid moves possible, automatically pass turn after brief timeout
    if (validMoves.length === 0) {
      room.gameState.logs.push(`${currentPlayer.name} has no valid moves.`);
      io.to(room.code).emit("dice_rolled", {
        room,
        diceValue,
        validMoves: [],
        autoPass: true
      });

      setTimeout(() => {
        const currentRoom = rooms.get(socket.roomCode);
        if (currentRoom && currentRoom.status === "playing") {
          advanceTurn(currentRoom, "no valid moves");
          io.to(currentRoom.code).emit("turn_passed", {
            room: currentRoom,
            reason: "No valid moves"
          });
        }
      }, 1500);
      return;
    }

    // Broadcast dice roll & valid selectable tokens
    io.to(room.code).emit("dice_rolled", {
      room,
      diceValue,
      validMoves,
      autoPass: false
    });
  });

  // Move Token
  socket.on("move_token", ({ tokenIndex }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.status !== "playing") return;

    const currentPlayer = room.players[room.gameState.turnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit("error_message", "It is not your turn!");
    }

    if (!room.gameState.hasRolled) {
      return socket.emit("error_message", "Please roll the dice first.");
    }

    const validMoves = getValidMoves(room);
    if (!validMoves.includes(tokenIndex)) {
      return socket.emit("error_message", "Invalid token move.");
    }

    const color = currentPlayer.color;
    const dice = room.gameState.diceValue;
    const oldStep = room.gameState.tokens[color][tokenIndex];
    let newStep = oldStep === -1 ? 0 : oldStep + dice;

    room.gameState.tokens[color][tokenIndex] = newStep;

    let capturedTokens = [];
    let bonusRoll = false;

    // Check if entered Home
    if (newStep === 56) {
      room.gameState.logs.push(`🎉 ${currentPlayer.name}'s token reached HOME! Bonus roll awarded.`);
      bonusRoll = true;
    }

    // Check Capture on common path
    if (newStep >= 0 && newStep < 51) {
      const globalPos = getGlobalTileIndex(color, newStep);
      if (!SAFE_TILES.includes(globalPos)) {
        room.players.forEach((p) => {
          if (p.color !== color) {
            room.gameState.tokens[p.color].forEach((otherStep, oIdx) => {
              if (otherStep >= 0 && otherStep < 51) {
                const otherGlobalPos = getGlobalTileIndex(p.color, otherStep);
                if (otherGlobalPos === globalPos) {
                  // Capture opponent token!
                  room.gameState.tokens[p.color][oIdx] = -1;
                  capturedTokens.push({ color: p.color, tokenIndex: oIdx, playerName: p.name });
                  room.gameState.logs.push(
                    `💥 ${currentPlayer.name} captured ${p.name}'s token! Bonus roll awarded.`
                  );
                  bonusRoll = true;
                }
              }
            });
          }
        });
      }
    }

    // Check Win
    if (checkWinner(room, color)) {
      room.status = "ended";
      room.gameState.winner = currentPlayer;
      room.gameState.logs.push(`🏆 ${currentPlayer.name} WON THE GAME!`);
      io.to(room.code).emit("game_over", {
        room,
        winner: currentPlayer
      });
      return;
    }

    // Extra roll on 6, capture, or home
    if (dice === 6) {
      bonusRoll = true;
      room.gameState.logs.push(`🎲 ${currentPlayer.name} rolled a 6 and gets an extra turn!`);
    }

    if (bonusRoll) {
      room.gameState.diceValue = null;
      room.gameState.hasRolled = false;
    } else {
      advanceTurn(room);
    }

    io.to(room.code).emit("token_moved", {
      room,
      movedToken: { color, tokenIndex, oldStep, newStep },
      capturedTokens,
      bonusRoll
    });
  });

  // Chat message
  socket.on("send_message", ({ message }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !message) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const chatEntry = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: player.id,
      sender: player.name,
      color: player.color,
      text: message.substring(0, 100),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    io.to(room.code).emit("chat_message", chatEntry);
  });

  // Reaction / Fast Chat / Couple Emojis
  socket.on("send_reaction", ({ type, content, isRomantic }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || !content) return;
    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const reactionData = {
      id: Math.random().toString(36).substring(2, 9),
      senderId: player.id,
      sender: player.name,
      color: player.color,
      type: type || "emoji", // "emoji" | "fast_chat" | "couple_effect"
      content: String(content).substring(0, 60),
      isRomantic: Boolean(isRomantic),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };

    io.to(room.code).emit("player_reaction", reactionData);
  });

  // Leave Room
  socket.on("leave_room", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const playerIndex = room.players.findIndex((p) => p.id === socket.id);
    if (playerIndex !== -1) {
      const player = room.players[playerIndex];
      player.connected = false;
      room.gameState.logs.push(`${player.name} left the game.`);
      socket.leave(roomCode);
      socket.roomCode = null;

      io.to(roomCode).emit("player_disconnected", { room, player });
    }
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms.has(roomCode)) return;

    const room = rooms.get(roomCode);
    const player = room.players.find((p) => p.id === socket.id);

    if (player) {
      player.connected = false;
      room.gameState.logs.push(`${player.name} disconnected.`);

      // If all disconnected, cleanup room after 5 minutes
      const allDisconnected = room.players.every((p) => !p.connected);
      if (allDisconnected) {
        setTimeout(() => {
          if (rooms.get(roomCode) && rooms.get(roomCode).players.every((p) => !p.connected)) {
            rooms.delete(roomCode);
          }
        }, 300000);
      } else {
        io.to(roomCode).emit("player_disconnected", { room, player });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Ludo server is running on http://localhost:${PORT}`);
});
