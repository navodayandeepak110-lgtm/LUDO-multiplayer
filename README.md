# 🎲 D❤️V. LUDO — Real-Time Online Multiplayer

A modern, lightweight, real-time online multiplayer Ludo game. Play with friends across different cities using private **Game Codes (Room Codes)** directly from any mobile or desktop browser!

---

## ✨ Features

- 🌐 **Room Code Matchmaking:** Create a private room, copy a 5-character code, and share it with friends to join instantly.
- 👥 **2 to 4 Players Support:** Play 1v1 duels or up to 4-player showdowns.
- ⚡ **Real-Time Synchronization:** Powered by WebSockets (`Socket.io`) with server-side validation to prevent cheating.
- 📱 **Mobile & Desktop Responsive:** Optimized 15×15 CSS Grid with responsive tap controls for smartphones, tablets, and PCs.
- 🎵 **Interactive Sound Effects:** Built-in audio chimes for rolling, moving, capturing pieces, and victory fanfare using the Web Audio API.
- 💬 **Live Chat & Activity Feed:** In-game activity logs and instant messaging while you play.

---

## 🚀 Quick Start (Play Locally)

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)

### Installation
```bash
# 1. Clone or navigate to the project directory
cd ludo-game

# 2. Install dependencies
npm install

# 3. Start the game server
npm start
```

Open your browser and visit: **`http://localhost:3000`**

---

## 🎮 How to Play

1. **Host:** Click **Create Game**, choose player count, and click **Create Room**.
2. **Share:** Copy the 5-character **Game Code** (e.g. `7K2X9`) and send it to your friend.
3. **Join:** Your friend visits the link, clicks **Join Game**, types the code, and hits **Join Room**.
4. **Gameplay:**
   - Roll a **6** to bring a piece out of your yard.
   - Rolling a **6**, capturing an opponent piece, or reaching **HOME** awards an extra roll!
   - Land on safe star tiles (★) to avoid getting captured.
   - The first player to bring all 4 pieces to the center home wins! 🏆

---

## 🌍 Free 1-Click Online Deployment

Host it online for free so anyone in the world can play:

### Deploy on Render.com:
1. Push this folder to a new repository on **GitHub**.
2. Go to **[Render.com](https://render.com)** $\rightarrow$ **New +** $\rightarrow$ **Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Click **Create Web Service** to get your free live game URL!

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Networking:** Socket.io (WebSockets)
- **Frontend:** HTML5, CSS3 (Grid & Flexbox), Vanilla JavaScript
- **Audio:** Web Audio API (Synthesized SFX)

---

Enjoy playing **D❤️V. LUDO**! ❤️🎲
