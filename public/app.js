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
  yellow: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  blue: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  red: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  green: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
};

const START_OFFSETS = { yellow: 0, blue: 13, red: 26, green: 39 };

// 12 Customizable High-Resolution Illustrated Avatars
const AVATAR_CATALOG = [
  {
    id: "boy-1",
    name: "Deepak",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><linearGradient id="skin_b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fed7aa"/><stop offset="100%" stop-color="#fdba74"/></linearGradient><linearGradient id="hair_b1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#d97706"/><stop offset="100%" stop-color="#92400e"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_b1)"/><path d="M50 78 C32 78 18 86 14 100 L86 100 C82 86 68 78 50 78 Z" fill="#2563eb"/><path d="M42 78 L50 89 L58 78 Z" fill="#ffffff"/><path d="M36 50 C36 67 42 76 50 76 C58 76 64 67 64 50 C64 36 58 28 50 28 C42 28 36 36 36 50 Z" fill="url(#skin_b1)"/><path d="M32 38 C32 20 40 14 50 14 C60 14 68 20 68 38 C66 28 58 24 50 24 C42 24 35 28 32 38 Z" fill="url(#hair_b1)"/><path d="M33 34 Q50 18 67 34 Q57 26 50 27 Q43 26 33 34 Z" fill="url(#hair_b1)"/><circle cx="44" cy="48" r="3" fill="#0f172a"/><circle cx="56" cy="48" r="3" fill="#0f172a"/><circle cx="45" cy="47" r="1" fill="#ffffff"/><circle cx="57" cy="47" r="1" fill="#ffffff"/><path d="M45 61 Q50 66 55 61" stroke="#c2410c" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="39" cy="53" r="3.5" fill="#f87171" opacity="0.45"/><circle cx="61" cy="53" r="3.5" fill="#f87171" opacity="0.45"/></svg>`
  },
  {
    id: "girl-1",
    name: "Vandana",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fce7f3"/><stop offset="100%" stop-color="#fbcfe8"/></linearGradient><linearGradient id="skin_g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#fed7aa"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_g1)"/><path d="M50 78 C34 78 18 86 14 100 L86 100 C82 86 66 78 50 78 Z" fill="#ec4899"/><path d="M42 78 L50 90 L58 78 Z" fill="#ffffff"/><path d="M38 52 C38 66 43 76 50 76 C57 76 62 66 62 52 C62 38 57 30 50 30 C43 30 38 38 38 52 Z" fill="url(#skin_g1)"/><path d="M32 44 C31 22 40 14 50 14 C60 14 69 22 68 44 C68 56 65 66 63 70 C60 56 64 34 50 34 C36 34 40 56 37 70 C35 66 32 56 32 44 Z" fill="#1e1b4b"/><circle cx="45" cy="50" r="2.8" fill="#0f172a"/><circle cx="55" cy="50" r="2.8" fill="#0f172a"/><circle cx="46" cy="49" r="0.9" fill="#ffffff"/><circle cx="56" cy="49" r="0.9" fill="#ffffff"/><path d="M46 62 Q50 66 54 62" stroke="#e11d48" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="41" cy="54" r="3.2" fill="#fda4af" opacity="0.75"/><circle cx="59" cy="54" r="3.2" fill="#fda4af" opacity="0.75"/><circle cx="34" cy="28" r="4" fill="#ec4899"/><circle cx="34" cy="28" r="1.5" fill="#fef08a"/></svg>`
  },
  {
    id: "boy-glasses",
    name: "Smart Guy",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0f766e"/><stop offset="100%" stop-color="#115e59"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_bg)"/><path d="M50 78 C32 78 18 86 14 100 L86 100 C82 86 68 78 50 78 Z" fill="#ea580c"/><path d="M36 50 C36 67 42 76 50 76 C58 76 64 67 64 50 C64 36 58 28 50 28 C42 28 36 36 36 50 Z" fill="#fed7aa"/><path d="M33 36 C33 20 40 14 50 14 C60 14 67 20 67 36 C64 26 56 24 50 24 C44 24 36 26 33 36 Z" fill="#292524"/><circle cx="43" cy="49" r="6" fill="none" stroke="#f59e0b" stroke-width="2.5"/><circle cx="57" cy="49" r="6" fill="none" stroke="#f59e0b" stroke-width="2.5"/><line x1="49" y1="49" x2="51" y2="49" stroke="#f59e0b" stroke-width="2.5"/><circle cx="43" cy="49" r="2.2" fill="#0f172a"/><circle cx="57" cy="49" r="2.2" fill="#0f172a"/><path d="M46 62 Q50 66 54 62" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "girl-bun",
    name: "Princess",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#4338ca"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_gb)"/><circle cx="50" cy="18" r="11" fill="#78350f"/><path d="M50 78 C34 78 18 86 14 100 L86 100 C82 86 66 78 50 78 Z" fill="#8b5cf6"/><path d="M38 52 C38 66 43 76 50 76 C57 76 62 66 62 52 C62 38 57 30 50 30 C43 30 38 38 38 52 Z" fill="#fed7aa"/><path d="M34 38 C34 24 42 20 50 20 C58 20 66 24 66 38 C63 32 58 28 50 28 C42 28 37 32 34 38 Z" fill="#78350f"/><circle cx="45" cy="50" r="2.5" fill="#0f172a"/><circle cx="55" cy="50" r="2.5" fill="#0f172a"/><path d="M46 62 Q50 66 54 62" stroke="#e11d48" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="40" cy="54" r="3" fill="#f472b6" opacity="0.6"/><circle cx="60" cy="54" r="3" fill="#f472b6" opacity="0.6"/><circle cx="50" cy="22" r="3" fill="#fde047"/></svg>`
  },
  {
    id: "king",
    name: "Royal King",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_k" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#831843"/><stop offset="100%" stop-color="#500724"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_k)"/><path d="M50 78 C32 78 16 86 12 100 L88 100 C84 86 68 78 50 78 Z" fill="#dc2626"/><path d="M38 78 L50 94 L62 78 Z" fill="#ffffff"/><path d="M36 50 C36 67 42 76 50 76 C58 76 64 67 64 50 C64 36 58 28 50 28 C42 28 36 36 36 50 Z" fill="#fed7aa"/><polygon points="32,26 40,34 50,22 60,34 68,26 66,38 34,38" fill="#fbbf24" stroke="#d97706" stroke-width="1.5"/><circle cx="50" cy="22" r="2.5" fill="#ef4444"/><circle cx="32" cy="26" r="2" fill="#3b82f6"/><circle cx="68" cy="26" r="2" fill="#3b82f6"/><circle cx="44" cy="49" r="2.5" fill="#0f172a"/><circle cx="56" cy="49" r="2.5" fill="#0f172a"/><path d="M42 58 Q50 63 58 58 Q54 66 50 66 Q46 66 42 58 Z" fill="#b45309"/></svg>`
  },
  {
    id: "queen",
    name: "Royal Queen",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_q" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#4c1d95"/><stop offset="100%" stop-color="#2e1065"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_q)"/><path d="M50 78 C34 78 18 86 14 100 L86 100 C82 86 66 78 50 78 Z" fill="#7c3aed"/><path d="M38 52 C38 66 43 76 50 76 C57 76 62 66 62 52 C62 38 57 30 50 30 C43 30 38 38 38 52 Z" fill="#fef08a"/><path d="M32 44 C31 22 40 14 50 14 C60 14 69 22 68 44 C68 56 65 66 63 70 C60 56 64 34 50 34 C36 34 40 56 37 70 C35 66 32 56 32 44 Z" fill="#312e81"/><polygon points="38,26 44,22 50,16 56,22 62,26 60,30 40,30" fill="#fbbf24"/><circle cx="50" cy="16" r="2" fill="#ec4899"/><circle cx="45" cy="50" r="2.5" fill="#0f172a"/><circle cx="55" cy="50" r="2.5" fill="#0f172a"/><path d="M46 62 Q50 66 54 62" stroke="#e11d48" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "gamer-boy",
    name: "Cyber Gamer",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_gm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0284c7"/><stop offset="100%" stop-color="#0369a1"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_gm)"/><path d="M50 78 C32 78 18 86 14 100 L86 100 C82 86 68 78 50 78 Z" fill="#0f172a"/><path d="M36 50 C36 67 42 76 50 76 C58 76 64 67 64 50 C64 36 58 28 50 28 C42 28 36 36 36 50 Z" fill="#fed7aa"/><path d="M33 36 C33 20 40 14 50 14 C60 14 67 20 67 36 Z" fill="#09090b"/><path d="M28 48 C28 30 38 18 50 18 C62 18 72 30 72 48" stroke="#38bdf8" stroke-width="4.5" fill="none" stroke-linecap="round"/><rect x="25" y="44" width="7" height="14" rx="3.5" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/><rect x="68" y="44" width="7" height="14" rx="3.5" fill="#0284c7" stroke="#38bdf8" stroke-width="2"/><circle cx="44" cy="49" r="2.8" fill="#0f172a"/><circle cx="56" cy="49" r="2.8" fill="#0f172a"/><path d="M46 62 Q50 66 54 62" stroke="#c2410c" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "gamer-girl",
    name: "Gamer Girl",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#be185d"/><stop offset="100%" stop-color="#9d174d"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_gg)"/><path d="M50 78 C34 78 18 86 14 100 L86 100 C82 86 66 78 50 78 Z" fill="#18181b"/><path d="M38 52 C38 66 43 76 50 76 C57 76 62 66 62 52 C62 38 57 30 50 30 C43 30 38 38 38 52 Z" fill="#fed7aa"/><path d="M34 38 C34 22 42 16 50 16 C58 16 66 22 66 38 Z" fill="#0f172a"/><polygon points="32,24 38,12 44,24" fill="#f43f5e"/><polygon points="56,24 62,12 68,24" fill="#f43f5e"/><path d="M28 48 C28 32 38 20 50 20 C62 20 72 32 72 48" stroke="#f43f5e" stroke-width="4.5" fill="none" stroke-linecap="round"/><rect x="25" y="44" width="7" height="14" rx="3.5" fill="#e11d48"/><rect x="68" y="44" width="7" height="14" rx="3.5" fill="#e11d48"/><circle cx="45" cy="50" r="2.8" fill="#0f172a"/><circle cx="55" cy="50" r="2.8" fill="#0f172a"/><path d="M46 62 Q50 66 54 62" stroke="#e11d48" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "cool-shades",
    name: "Cool Dude",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_cs)"/><path d="M50 78 C32 78 18 86 14 100 L86 100 C82 86 68 78 50 78 Z" fill="#09090b"/><path d="M36 50 C36 67 42 76 50 76 C58 76 64 67 64 50 C64 36 58 28 50 28 C42 28 36 36 36 50 Z" fill="#fed7aa"/><path d="M32 36 C32 18 40 12 50 12 C60 12 68 18 68 36 Z" fill="#1c1917"/><polygon points="34,44 48,44 46,54 36,54" fill="#0f172a"/><polygon points="52,44 66,44 64,54 54,54" fill="#0f172a"/><line x1="48" y1="46" x2="52" y2="46" stroke="#0f172a" stroke-width="3"/><line x1="36" y1="46" x2="44" y2="52" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/><line x1="54" y1="46" x2="62" y2="52" stroke="#ffffff" stroke-width="1.2" opacity="0.6"/><path d="M46 64 Q50 67 54 64" stroke="#c2410c" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`
  },
  {
    id: "ninja",
    name: "Ninja Warrior",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_nj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#020617"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_nj)"/><path d="M50 78 C32 78 18 86 14 100 L86 100 C82 86 68 78 50 78 Z" fill="#0f172a"/><circle cx="50" cy="50" r="24" fill="#09090b"/><rect x="36" y="44" width="28" height="12" rx="6" fill="#fed7aa"/><rect x="28" y="32" width="44" height="8" rx="4" fill="#dc2626"/><circle cx="44" cy="50" r="2.8" fill="#0f172a"/><circle cx="56" cy="50" r="2.8" fill="#0f172a"/><path d="M41 46 L47 48" stroke="#0f172a" stroke-width="1.5"/><path d="M59 46 L53 48" stroke="#0f172a" stroke-width="1.5"/></svg>`
  },
  {
    id: "lucky-cat",
    name: "Lucky Cat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_lc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_lc)"/><path d="M50 78 C34 78 20 86 16 100 L84 100 C80 86 66 78 50 78 Z" fill="#ffffff"/><polygon points="30,40 38,18 48,34" fill="#ffffff"/><polygon points="70,40 62,18 52,34" fill="#ffffff"/><polygon points="33,36 38,24 45,34" fill="#fda4af"/><polygon points="67,36 62,24 55,34" fill="#fda4af"/><ellipse cx="50" cy="52" rx="22" ry="20" fill="#ffffff"/><circle cx="42" cy="48" r="3" fill="#0f172a"/><circle cx="58" cy="48" r="3" fill="#0f172a"/><ellipse cx="50" cy="55" rx="2.5" ry="2" fill="#fda4af"/><path d="M46 58 Q50 62 54 58" stroke="#e11d48" stroke-width="2" fill="none"/><line x1="30" y1="52" x2="38" y2="54" stroke="#0f172a" stroke-width="1.5"/><line x1="30" y1="58" x2="38" y2="57" stroke="#0f172a" stroke-width="1.5"/><line x1="70" y1="52" x2="62" y2="54" stroke="#0f172a" stroke-width="1.5"/><line x1="70" y1="58" x2="62" y2="57" stroke="#0f172a" stroke-width="1.5"/></svg>`
  },
  {
    id: "cute-panda",
    name: "Lucky Panda",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="bg_pd" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><rect width="100" height="100" rx="18" fill="url(#bg_pd)"/><circle cx="34" cy="30" r="9" fill="#09090b"/><circle cx="66" cy="30" r="9" fill="#09090b"/><path d="M50 78 C34 78 20 86 16 100 L84 100 C80 86 66 78 50 78 Z" fill="#09090b"/><ellipse cx="50" cy="54" rx="24" ry="22" fill="#ffffff"/><ellipse cx="40" cy="50" rx="6" ry="7" fill="#09090b" transform="rotate(-15 40 50)"/><ellipse cx="60" cy="50" rx="6" ry="7" fill="#09090b" transform="rotate(15 60 50)"/><circle cx="41" cy="49" r="2" fill="#ffffff"/><circle cx="59" cy="49" r="2" fill="#ffffff"/><ellipse cx="50" cy="58" rx="3.5" ry="2.5" fill="#09090b"/><path d="M46 64 Q50 68 54 64" stroke="#09090b" stroke-width="2" fill="none"/><circle cx="34" cy="58" r="3.5" fill="#fca5a5" opacity="0.6"/><circle cx="66" cy="58" r="3.5" fill="#fca5a5" opacity="0.6"/></svg>`
  }
];

function getAvatarById(id) {
  return AVATAR_CATALOG.find((a) => a.id === id) || AVATAR_CATALOG[0];
}

function getAvatarSrc(id) {
  const avatar = getAvatarById(id);
  return `data:image/svg+xml;utf8,${encodeURIComponent(avatar.svg)}`;
}

let mySelectedAvatarId = localStorage.getItem("ludo_player_avatar") || "boy-1";

// Helper to generate 3D Pawn SVG
function getPawnSvgHtml(color) {
  return `
    <svg class="pawn-svg" viewBox="0 0 36 50" fill="none">
      <ellipse cx="18" cy="46" rx="13" ry="3.5" fill="rgba(0,0,0,0.28)"/>
      <ellipse cx="18" cy="42" rx="12" ry="4" fill="url(#pawnBase-${color})"/>
      <path d="M6 42 C6 38 10 36 18 36 C26 36 30 38 30 42 C30 46 26 48 18 48 C10 48 6 46 6 42 Z" fill="url(#pawnBase-${color})"/>
      <path d="M10 40 C12.5 28 13.5 21 15 17 C16.5 17 19.5 17 21 17 C22.5 21 23.5 28 26 40 Z" fill="url(#pawnBody-${color})"/>
      <ellipse cx="18" cy="17" rx="5.5" ry="1.6" fill="url(#pawnRing-${color})"/>
      <circle cx="18" cy="9.5" r="8" fill="url(#pawnHead-${color})"/>
      <ellipse cx="15.5" cy="7" rx="2.5" ry="1.6" fill="white" opacity="0.65" transform="rotate(-25 15.5 7)"/>
    </svg>
  `;
}

// Helper to generate Star SVG
function getStarSvgHtml(colorClass = "") {
  return `<svg class="star-svg ${colorClass}" viewBox="0 0 24 24"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" /></svg>`;
}

// Helper to generate Chevron SVG
function getChevronSvgHtml(dir, colorClass = "") {
  const rot = dir === "right" ? "0" : dir === "down" ? "90" : dir === "left" ? "180" : "270";
  return `<svg class="chevron-svg ${colorClass}" style="transform:rotate(${rot}deg)" viewBox="0 0 24 24"><path d="M8 5 L15 12 L8 19" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

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
const menuAvatarBtn = document.getElementById("menu-avatar-btn");
const menuRulesBtn = document.getElementById("menu-rules-btn");
const menuCopyBtn = document.getElementById("menu-copy-btn");
const menuSoundBtn = document.getElementById("menu-sound-btn");
const soundIcon = document.getElementById("sound-icon");
const soundStatusText = document.getElementById("sound-status-text");
const menuRoomCode = document.getElementById("menu-room-code");
const menuLeaveBtn = document.getElementById("menu-leave-btn");

const avatarModal = document.getElementById("avatar-modal");
const closeAvatarBtn = document.getElementById("close-avatar-btn");

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

    // Heart Particle Constellation
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

// Build 15x15 Ludo Board Grid Layout matching Reference Screenshot
function buildBoardGrid() {
  ludoBoard.innerHTML = "";

  // 1. Yellow Base (Top-Left 6x6)
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

  // 2. Blue Base (Top-Right 6x6) with Opponent name header
  const blueBase = document.createElement("div");
  blueBase.className = "base-blue";
  blueBase.innerHTML = `
    <div class="base-player-label" id="blue-base-label">Vandana</div>
    <div class="base-inner">
      <div class="base-slot" id="slot-blue-0"></div>
      <div class="base-slot" id="slot-blue-1"></div>
      <div class="base-slot" id="slot-blue-2"></div>
      <div class="base-slot" id="slot-blue-3"></div>
    </div>`;
  ludoBoard.appendChild(blueBase);

  // 3. Green Base (Bottom-Left 6x6) with "YOU" bottom label
  const greenBase = document.createElement("div");
  greenBase.className = "base-green";
  greenBase.innerHTML = `
    <div class="base-inner">
      <div class="base-slot" id="slot-green-0"></div>
      <div class="base-slot" id="slot-green-1"></div>
      <div class="base-slot" id="slot-green-2"></div>
      <div class="base-slot" id="slot-green-3"></div>
    </div>
    <div class="base-player-label" id="green-base-label">YOU</div>`;
  ludoBoard.appendChild(greenBase);

  // 4. Red Base (Bottom-Right 6x6)
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

  // 5. Center Home (3x3 in middle) with 4 sharp colored triangles
  const centerHome = document.createElement("div");
  centerHome.className = "center-home";
  centerHome.innerHTML = `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      <polygon points="0,0 50,50 0,100" fill="#f5b82e" />
      <polygon points="0,0 50,50 100,0" fill="#3b88d8" />
      <polygon points="100,0 50,50 100,100" fill="#d9383a" />
      <polygon points="0,100 50,50 100,100" fill="#2f9e44" />
    </svg>
    <div class="center-home-slots">
      <div class="center-slot slot-yellow" id="center-home-yellow"></div>
      <div class="center-slot slot-blue" id="center-home-blue"></div>
      <div class="center-slot slot-red" id="center-home-red"></div>
      <div class="center-slot slot-green" id="center-home-green"></div>
    </div>`;
  ludoBoard.appendChild(centerHome);

  // 6. Regular track cells (15x15)
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const inYellowBase = r < 6 && c < 6;
      const inBlueBase = r < 6 && c > 8;
      const inGreenBase = r > 8 && c < 6;
      const inRedBase = r > 8 && c > 8;
      const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;

      if (!inYellowBase && !inBlueBase && !inGreenBase && !inRedBase && !inCenter) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.style.gridRow = `${r + 1} / ${r + 2}`;
        cell.style.gridColumn = `${c + 1} / ${c + 2}`;
        cell.id = `cell-${r}-${c}`;

        // Colored Start tiles
        if (r === 6 && c === 1) cell.classList.add("cell-yellow-start");
        if (r === 1 && c === 8) cell.classList.add("cell-blue-start");
        if (r === 8 && c === 13) cell.classList.add("cell-red-start");
        if (r === 13 && c === 6) cell.classList.add("cell-green-start");

        // Colored Home stretches
        if (r === 7 && c >= 1 && c <= 5) cell.classList.add("cell-yellow-home");
        if (c === 7 && r >= 1 && r <= 5) cell.classList.add("cell-blue-home");
        if (r === 7 && c >= 9 && c <= 13) cell.classList.add("cell-red-home");
        if (c === 7 && r >= 9 && r <= 13) cell.classList.add("cell-green-home");

        // Safe star spot cells matching reference screenshot
        if (r === 2 && c === 6) {
          cell.innerHTML = getStarSvgHtml("star-blue");
        } else if (r === 6 && c === 12) {
          cell.innerHTML = getStarSvgHtml("star-white");
        } else if (r === 8 && c === 13) {
          cell.innerHTML = getStarSvgHtml("star-red");
        } else if (r === 13 && c === 6) {
          cell.innerHTML = getStarSvgHtml("star-green");
        } else if (r === 12 && c === 8) {
          cell.innerHTML = getStarSvgHtml("star-white");
        } else if (r === 8 && c === 2) {
          cell.innerHTML = getStarSvgHtml("star-white");
        }

        // Colored entry chevron arrows
        if (r === 7 && c === 0) cell.innerHTML = getChevronSvgHtml("right", "chevron-yellow");
        if (r === 0 && c === 7) cell.innerHTML = getChevronSvgHtml("down", "chevron-blue");
        if (r === 7 && c === 14) cell.innerHTML = getChevronSvgHtml("left", "chevron-red");
        if (r === 14 && c === 7) cell.innerHTML = getChevronSvgHtml("up", "chevron-green");

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

// Render Board Pieces with 3D Pawn Styling
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
      tokenEl.innerHTML = getPawnSvgHtml(color);

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

// Render Player Profile Card HTML (Matching Reference Image)
function createPlayerProfileHTML(player, isCurrentTurn, isMe) {
  if (!player) return "";
  const avatarId = player.avatar || (player.name && player.name.toLowerCase().includes("vandana") ? "girl-1" : "boy-1");
  const avatarSrc = getAvatarSrc(avatarId);
  const isOpponent = !isMe;
  const flag = "🇮🇳";

  return `
    <div class="game-player-card ${isOpponent ? "opponent-card" : "local-card"} ${isCurrentTurn ? "active-turn" : ""}" data-player-id="${player.id}" data-player-color="${player.color}">
      <div class="card-avatar-box">
        <div class="card-gift-badge" title="Level / Gift">🎁</div>
        <div class="avatar-frame">
          <img class="avatar-img" src="${avatarSrc}" alt="${player.name}">
        </div>
        ${isCurrentTurn ? '<div class="turn-indicator-badge">TURN</div>' : ""}
      </div>
      <div class="card-player-meta">
        <div class="card-name-row">
          <span class="card-flag">${flag}</span>
          <span class="card-name-txt">${player.name}${isMe ? " (You)" : ""}</span>
        </div>
        <div class="card-color-pill pill-${player.color}">
          <span class="pill-dot"></span>
          <span class="pill-name">${player.color.toUpperCase()}</span>
        </div>
      </div>
    </div>
  `;
}

// Render 3D Dice Box Attached Next to Local Player Avatar (Matching Reference Image)
function createDiceControlsHTML(diceValue, canRoll) {
  const val = diceValue || 6;
  const dotsHtml = Array.from({ length: val }, () => '<div class="dice-dot"></div>').join("");
  const subText = isMyTurn ? (canRoll ? "Tap to roll" : (isDiceRolling ? "Rolling..." : "Select token")) : "Waiting...";
  return `
    <div class="bottom-dice-controls">
      <div class="dice-interactive-container">
        <div class="dice-box ${canRoll && !isDiceRolling ? "active" : ""}" id="game-dice-box" title="Tap to Roll">
          <div class="dice-3d dice-face-${val}" id="game-dice-cube">
            ${dotsHtml}
          </div>
        </div>
      </div>
      <div class="dice-action-wrap">
        <button class="roll-status-btn ${canRoll && !isDiceRolling ? "can-roll" : ""}" id="roll-action-btn" ${canRoll && !isDiceRolling ? "" : "disabled"}>
          <span>ROLL</span>
        </button>
        <div class="dice-status-sub">${subText}</div>
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

  // Update quadrant labels
  const blueLabel = document.getElementById("blue-base-label");
  const greenLabel = document.getElementById("green-base-label");
  const opponents = room.players.filter((p) => p.id !== myPlayer.id);

  if (blueLabel) {
    if (opponents.length > 0) {
      blueLabel.textContent = opponents[0].name;
    } else {
      blueLabel.textContent = "Vandana";
    }
  }

  if (greenLabel) {
    greenLabel.textContent = myPlayer ? "YOU" : "YOU";
  }

  // Top Opponent Zone (Top Right above blue yard)
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

  // Bottom Zone: My Profile (Bottom Left) + Adjacent 3D Dice & Action Box
  bottomPlayerZone.innerHTML = "";
  const isMyTurnActive = currentPlayer && myPlayer && currentPlayer.id === myPlayer.id;
  const myProfileHtml = createPlayerProfileHTML(myPlayer, isMyTurnActive, true);
  const diceControlsHtml = createDiceControlsHTML(room.gameState.diceValue, canRoll);
  bottomPlayerZone.innerHTML = myProfileHtml + diceControlsHtml;

  // Attach Dice & Roll button click listeners
  const diceBox = document.getElementById("game-dice-box");
  const rollActionBtn = document.getElementById("roll-action-btn");
  if (diceBox && canRoll && !isDiceRolling) {
    diceBox.addEventListener("click", onRollDice);
  }
  if (rollActionBtn && canRoll && !isDiceRolling) {
    rollActionBtn.addEventListener("click", onRollDice);
  }

  // Allow clicking on local player card to customize avatar mid-game
  const localPlayerCard = document.querySelector(".game-player-card.local-card");
  if (localPlayerCard) {
    localPlayerCard.style.cursor = "pointer";
    localPlayerCard.title = "Tap to customize your avatar";
    localPlayerCard.addEventListener("click", () => {
      if (avatarModal) avatarModal.classList.remove("hidden");
    });
  }

  renderBoard(room.gameState);
}

// Action Handlers
function onRollDice() {
  initAudio();
  if (!isMyTurn || currentRoom.gameState.hasRolled || isDiceRolling) return;
  isDiceRolling = true;

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

// Avatar Picker Initialization
function initAvatarPicker() {
  const lobbyPickerList = document.getElementById("avatar-picker-list");
  const lobbyPreviewBox = document.getElementById("lobby-avatar-preview");
  const modalAvatarGrid = document.getElementById("modal-avatar-grid");
  const modalPreviewBox = document.getElementById("modal-avatar-preview-box");
  const modalAvatarTitle = document.getElementById("modal-avatar-title");

  function updateActiveAvatars() {
    const avatar = getAvatarById(mySelectedAvatarId);
    const src = getAvatarSrc(mySelectedAvatarId);

    if (lobbyPreviewBox) {
      lobbyPreviewBox.innerHTML = `<img src="${src}" alt="${avatar.name}">`;
    }
    if (modalPreviewBox) {
      modalPreviewBox.innerHTML = `<img src="${src}" alt="${avatar.name}">`;
    }
    if (modalAvatarTitle) {
      modalAvatarTitle.textContent = avatar.name;
    }

    document.querySelectorAll(".avatar-choice-item").forEach((el) => {
      if (el.dataset.avatarId === mySelectedAvatarId) {
        el.classList.add("selected");
      } else {
        el.classList.remove("selected");
      }
    });
  }

  // Populate lobby list
  if (lobbyPickerList) {
    lobbyPickerList.innerHTML = "";
    AVATAR_CATALOG.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = `avatar-choice-item ${item.id === mySelectedAvatarId ? "selected" : ""}`;
      itemEl.dataset.avatarId = item.id;
      itemEl.title = item.name;
      itemEl.innerHTML = `<img src="${getAvatarSrc(item.id)}" alt="${item.name}">`;
      itemEl.addEventListener("click", () => {
        mySelectedAvatarId = item.id;
        localStorage.setItem("ludo_player_avatar", item.id);
        updateActiveAvatars();
      });
      lobbyPickerList.appendChild(itemEl);
    });
  }

  // Populate modal grid
  if (modalAvatarGrid) {
    modalAvatarGrid.innerHTML = "";
    AVATAR_CATALOG.forEach((item) => {
      const itemEl = document.createElement("div");
      itemEl.className = `avatar-choice-item ${item.id === mySelectedAvatarId ? "selected" : ""}`;
      itemEl.dataset.avatarId = item.id;
      itemEl.title = item.name;
      itemEl.innerHTML = `<img src="${getAvatarSrc(item.id)}" alt="${item.name}">`;
      itemEl.addEventListener("click", () => {
        mySelectedAvatarId = item.id;
        localStorage.setItem("ludo_player_avatar", item.id);
        updateActiveAvatars();
        if (myPlayer) {
          myPlayer.avatar = item.id;
          socket.emit("update_avatar", { avatar: item.id });
        }
        if (currentRoom) {
          updateGameUI(currentRoom);
        }
        setTimeout(() => {
          if (avatarModal) avatarModal.classList.add("hidden");
        }, 200);
      });
      modalAvatarGrid.appendChild(itemEl);
    });
  }

  updateActiveAvatars();
}

// Room Actions
createRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Deepak";
  const maxPlayers = document.querySelector('input[name="max-players"]:checked').value;
  socket.emit("create_room", { playerName: name, maxPlayers, avatar: mySelectedAvatarId });
});

joinRoomBtn.addEventListener("click", () => {
  initAudio();
  const name = playerNameInput.value.trim() || "Vandana";
  const code = roomCodeInput.value.trim();
  if (!code) {
    lobbyError.textContent = "Please enter a room code.";
    return;
  }
  socket.emit("join_room", { roomCode: code, playerName: name, avatar: mySelectedAvatarId });
});

if (menuAvatarBtn) {
  menuAvatarBtn.addEventListener("click", () => {
    menuModal.classList.add("hidden");
    if (avatarModal) avatarModal.classList.remove("hidden");
  });
}

if (closeAvatarBtn) {
  closeAvatarBtn.addEventListener("click", () => {
    if (avatarModal) avatarModal.classList.add("hidden");
  });
}

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
    const avatarId = p.avatar || "boy-1";
    const avatarSrc = getAvatarSrc(avatarId);
    const item = document.createElement("div");
    item.className = "player-status-tag";
    item.innerHTML = `
      <div class="player-tag-left">
        <img class="waiting-avatar-mini" src="${avatarSrc}" alt="${p.name}">
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
initAvatarPicker();
