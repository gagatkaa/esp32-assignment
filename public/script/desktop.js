const socket = io({ reconnection: true });

// DOM
const canvas = document.getElementById("tank");
const ctx = canvas.getContext("2d");

const statusEl = document.getElementById("status");
const qrEl = document.getElementById("qr");
const overlay = document.getElementById("overlay");
const countdownEl = document.getElementById("countdown");
const countdownNumber = document.getElementById("countdown-number");
const readyScreenEl = document.getElementById("ready-screen");

// Theme
const FONT = '"Press Start 2P", monospace';

const COLOR_GRID = "#222";
const COLOR_TANK = "#4a9";
const COLOR_BARREL = "#2d7";
const COLOR_BULLET = "#00ffaa";
const COLOR_HUD_BG = "rgba(0,0,0,0.45)";
const COLOR_TEXT = "white";
const COLOR_TEXT_DIM = "#aaa";
const COLOR_CONNECTED = "#2d7";
const COLOR_WAITING = "#f80";
const COLOR_GAMEOVER_BG = "rgba(0,0,0,0.6)";
const COLOR_BEST = "#ffd400";
const COLOR_MUSIC_ICON = "#ccc";
const COLOR_HEART = "#ff2d2d";
const COLOR_HEART_EMPTY = "#333";

const ENEMY_COLORS = ["#ff2d2d", "#ff7a00", "#ffd400"];

// Game constants
const BULLET_SIZE = 10;
const BULLET_SPEED = 14;
const MUZZLE_LEN = 36;
const TANK_SIZE = 48;
const SPAWN_MARGIN = 60;

const MOVE_SPEED = 0.006;
const AUTO_SHOOT_INTERVAL = 220;

const ENEMY_SPEED_MIN = 0.6;
const ENEMY_SPEED_MAX = 1.2;
const ENEMY_SIZE_MIN = 18;
const ENEMY_SIZE_MAX = 34;

const POWERUP_SIZE = 24;
const POWERUP_SPEED = 0.6;
const POWERUP_SPAWN_INTERVAL = 10000;
const POWERUP_MAX = 2;

const POWERUPS = [
  { type: "extraLife", color: "#44ff88", weight: 4 },
  { type: "bigBullet", color: "#44aaff", weight: 2 },
  { type: "tripleShot", color: "#2266ff", weight: 2 },
  { type: "nuke", color: "#cc44ff", weight: 3 },
  { type: "slow", color: "#aa22ff", weight: 2 },
];

// State
let tankX = 0;
let tankY = 0;
let moveX = 0;
let moveY = 0;
let aimX = 1;
let aimY = 0;

let score = 0;
let bestScore = parseInt(localStorage.getItem("tiltSmashBest"), 10) || 0;
let lives = 5;
let gameOver = false;
let gameStarted = false;
let startTime = Date.now();

let espConnected = false;
let lastShotAt = 0;
let gameOverSoundPlayed = false;

const bullets = [];
const enemies = [];
const particles = [];
const powerups = [];

let spawnTimeoutId = null;
let powerupIntervalId = null;

let bigBulletActive = false;
let tripleShotActive = false;
let slowActive = false;
let bigBulletTimer = null;
let tripleShotTimer = null;
let slowTimer = null;

let activeToast = null;

// Audio
let musicPlaying = true;

const soundLibrary = {
  boost: [],
  gameOver: [],
  hit: [],
  music: [],
};

const bgMusic = new Audio("/sound/music.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.4;

async function loadSounds() {
  try {
    const response = await fetch("/api/sounds");
    const sounds = await response.json();

    soundLibrary.boost = sounds.boost || [];
    soundLibrary.gameOver = sounds.gameOver || [];
    soundLibrary.hit = sounds.hit || [];

    console.log("Loaded sounds:", soundLibrary);
  } catch (err) {
    console.error("Failed to load sounds:", err);
  }
}

function playRandomSound(category, volume = 0.5) {
  const files = soundLibrary[category];

  if (!files || files.length === 0) return;

  const src = files[(Math.random() * files.length) | 0];
  const sound = new Audio(src);

  sound.volume = volume;
  sound.play().catch(() => { });
}

function primeAudio() {
  playRandomSound("hit", 0);
  playRandomSound("boost", 0);
  playRandomSound("gameOver", 0);
}

loadSounds();

// ESP32 Web Serial
function createEsp32ConnectButton() {
  const button = document.createElement("button");
  button.textContent = "Connect ESP32";

  button.style.position = "fixed";
  button.style.left = "20px";
  button.style.bottom = "20px";
  button.style.zIndex = "9999";
  button.style.padding = "12px 16px";
  button.style.border = "0";
  button.style.borderRadius = "8px";
  button.style.background = "#2d7";
  button.style.color = "#000";
  button.style.fontFamily = "monospace";
  button.style.fontWeight = "bold";
  button.style.cursor = "pointer";

  button.addEventListener("click", connectEsp32Controller);
  document.body.appendChild(button);
}

async function connectEsp32Controller() {
  if (!("serial" in navigator)) {
    statusEl.textContent = "Web Serial not supported. Use Chrome or Edge.";
    return;
  }

  try {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });

    espConnected = true;
    statusEl.textContent = "ESP32 connected!";
    overlay.classList.add("hidden");
    showReadyScreen();

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable);

    const reader = decoder.readable.getReader();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;
      if (!value) continue;

      buffer += value;

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          handleEsp32Message(JSON.parse(trimmed));
        } catch {
          console.warn("Invalid ESP32 JSON:", trimmed);
        }
      }
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "ESP32 connection failed.";
  }
}

function handleEsp32Message(msg) {
  if (msg.move) {
    moveX = clamp(msg.move.x, -1, 1);
    moveY = clamp(msg.move.y, -1, 1);
  }

  if (msg.aim) {
    const x = Number(msg.aim.x);
    const y = Number(msg.aim.y);
    const mag = Math.hypot(x, y);

    if (mag > 0.05) {
      aimX = x / mag;
      aimY = y / mag;
    }
  }

  if (msg.restart && gameOver) {
    restartGame();
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

createEsp32ConnectButton();

// Ready screen
function showReadyScreen() {
  if (gameStarted) return;

  overlay.classList.add("hidden");
  readyScreenEl.classList.add("show");
}

function handleLetsGo() {
  readyScreenEl.classList.remove("show");

  primeAudio();

  if (musicPlaying) {
    bgMusic.src = "/sound/music.mp3";
    bgMusic.loop = true;
    bgMusic.volume = 0.4;
    bgMusic.play().catch((err) => {
      console.warn("Music play failed:", err);
    });
  }

  startCountdown();
}

window.handleLetsGo = handleLetsGo;

function startCountdown() {
  if (gameStarted) return;

  countdownEl.classList.add("show");

  let count = 3;
  countdownNumber.textContent = count;

  const interval = setInterval(() => {
    count -= 1;

    playRandomSound("hit", 0.25);

    if (count > 0) {
      countdownNumber.textContent = count;
      return;
    }

    clearInterval(interval);

    countdownEl.classList.remove("show");

    startTime = Date.now();
    gameStarted = true;

    startSpawnCycle();
    startPowerupCycle();
  }, 1000);
}

// Music button
const musicBtn = { x: 160, y: 12, w: 44, h: 44 };

canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (
    mx >= musicBtn.x &&
    mx <= musicBtn.x + musicBtn.w &&
    my >= musicBtn.y &&
    my <= musicBtn.y + musicBtn.h
  ) {
    musicPlaying = !musicPlaying;

    if (musicPlaying) {
      if (gameStarted && !gameOver && bgMusic.src) bgMusic.play().catch(() => { });
    } else {
      bgMusic.pause();
    }
  }
});

// Socket fallback only
socket.on("connect", () => {
  statusEl.textContent = "Connect ESP32 controller:";
  qrEl.innerHTML = "";
});

// Resize
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

window.addEventListener("resize", resize);
resize();

// Controls
function updateTankFromController() {
  if (!gameStarted || gameOver) return;

  tankX += moveX * MOVE_SPEED;
  tankY += moveY * MOVE_SPEED;

  tankX = clamp(tankX, -1, 1);
  tankY = clamp(tankY, -1, 1);

  const now = Date.now();

  if (Math.hypot(aimX, aimY) > 0.05 && now - lastShotAt > AUTO_SHOOT_INTERVAL) {
    handleShoot({ dirX: aimX, dirY: aimY });
    lastShotAt = now;
  }
}

function handleShoot(payload = {}) {
  if (!gameStarted || gameOver) return;

  let dirX = typeof payload.dirX === "number" ? payload.dirX : aimX;
  let dirY = typeof payload.dirY === "number" ? payload.dirY : aimY;

  const mag = Math.hypot(dirX, dirY);
  if (mag < 0.001) return;

  dirX /= mag;
  dirY /= mag;

  const W = canvas.width;
  const H = canvas.height;

  const cx = W / 2 + tankX * (W / 2 - 40);
  const cy = H / 2 + tankY * (H / 2 - 40);

  function shootBullet(cx, cy, dirX, dirY) {
    bullets.push({
      x: cx + dirX * MUZZLE_LEN,
      y: cy + dirY * MUZZLE_LEN,
      vx: dirX * BULLET_SPEED,
      vy: dirY * BULLET_SPEED,
      size: bigBulletActive ? BULLET_SIZE * 2.5 : BULLET_SIZE,
    });
  }

  if (tripleShotActive) {
    const spread = 0.3;

    const left = {
      x: dirX * Math.cos(-spread) - dirY * Math.sin(-spread),
      y: dirX * Math.sin(-spread) + dirY * Math.cos(-spread),
    };

    const right = {
      x: dirX * Math.cos(spread) - dirY * Math.sin(spread),
      y: dirX * Math.sin(spread) + dirY * Math.cos(spread),
    };

    shootBullet(cx, cy, dirX, dirY);
    shootBullet(cx, cy, left.x, left.y);
    shootBullet(cx, cy, right.x, right.y);
  } else {
    shootBullet(cx, cy, dirX, dirY);
  }
}

function restartGame() {
  score = 0;
  lives = 5;
  gameOver = false;
  gameStarted = false;
  gameOverSoundPlayed = false;
  startTime = Date.now();

  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  powerups.length = 0;

  tankX = 0;
  tankY = 0;
  moveX = 0;
  moveY = 0;
  aimX = 1;
  aimY = 0;
  lastShotAt = 0;

  if (spawnTimeoutId) {
    clearTimeout(spawnTimeoutId);
    spawnTimeoutId = null;
  }

  if (powerupIntervalId) {
    clearInterval(powerupIntervalId);
    powerupIntervalId = null;
  }

  clearTimeout(bigBulletTimer);
  clearTimeout(tripleShotTimer);
  clearTimeout(slowTimer);

  bigBulletActive = false;
  tripleShotActive = false;
  slowActive = false;
  activeToast = null;

  if (musicPlaying && bgMusic.src) bgMusic.play().catch(() => { });

  startCountdown();
}

function endGame() {
  if (gameOverSoundPlayed) return;

  gameOver = true;
  gameOverSoundPlayed = true;

  playRandomSound("gameOver", 0.8);
}

// Power-ups
function pickWeighted() {
  const total = POWERUPS.reduce((sum, p) => sum + p.weight, 0);

  let r = Math.random() * total;

  for (const p of POWERUPS) {
    r -= p.weight;
    if (r <= 0) return p;
  }

  return POWERUPS[0];
}

function spawnPowerup() {
  if (powerups.length >= POWERUP_MAX) return;

  const W = canvas.width;
  const H = canvas.height;
  const side = (Math.random() * 4) | 0;

  let x;
  let y;

  if (side === 0) {
    x = -SPAWN_MARGIN;
    y = rand(0, H);
  } else if (side === 1) {
    x = W + SPAWN_MARGIN;
    y = rand(0, H);
  } else if (side === 2) {
    x = rand(0, W);
    y = -SPAWN_MARGIN;
  } else {
    x = rand(0, W);
    y = H + SPAWN_MARGIN;
  }

  const def = pickWeighted();
  powerups.push({ x, y, ...def });
}

function startPowerupCycle() {
  if (powerupIntervalId) clearInterval(powerupIntervalId);

  powerupIntervalId = setInterval(() => {
    if (!gameOver && gameStarted) spawnPowerup();
  }, POWERUP_SPAWN_INTERVAL);
}

function showToast(message, color) {
  activeToast = { message, color, life: 1 };
}

function applyPowerup(type) {
  playRandomSound("boost", 0.6);

  if (type === "extraLife") {
    lives = Math.min(lives + 1, 5);
    showToast("+1 LIFE", "#44ff88");
  }

  if (type === "nuke") {
    spawnParticles_nuke();
    enemies.length = 0;
    showToast("NUKE!", "#cc44ff");
  }

  if (type === "bigBullet") {
    bigBulletActive = true;
    clearTimeout(bigBulletTimer);
    bigBulletTimer = setTimeout(() => {
      bigBulletActive = false;
    }, 10000);
    showToast("BIG BULLETS", "#44aaff");
  }

  if (type === "tripleShot") {
    tripleShotActive = true;
    clearTimeout(tripleShotTimer);
    tripleShotTimer = setTimeout(() => {
      tripleShotActive = false;
    }, 10000);
    showToast("TRIPLE SHOT", "#2266ff");
  }

  if (type === "slow") {
    slowActive = true;
    clearTimeout(slowTimer);
    slowTimer = setTimeout(() => {
      slowActive = false;
    }, 10000);
    showToast("ENEMIES SLOW", "#aa22ff");
  }
}

function spawnParticles_nuke() {
  for (const enemy of enemies) {
    spawnParticles(enemy.x, enemy.y, enemy.color, enemy.size);
  }

  playRandomSound("boost", 0.7);
}

// Enemies and helpers
function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function spawnParticles(x, y, color, size) {
  const count = 8 + Math.random() * 4;

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;

    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: size * 0.3 * (0.5 + Math.random() * 0.5),
      color,
      life: 1,
    });
  }
}

function spawnEnemy() {
  const W = canvas.width;
  const H = canvas.height;
  const side = (Math.random() * 4) | 0;

  let x;
  let y;

  if (side === 0) {
    x = -SPAWN_MARGIN;
    y = rand(0, H);
  } else if (side === 1) {
    x = W + SPAWN_MARGIN;
    y = rand(0, H);
  } else if (side === 2) {
    x = rand(0, W);
    y = -SPAWN_MARGIN;
  } else {
    x = rand(0, W);
    y = H + SPAWN_MARGIN;
  }

  enemies.push({
    x,
    y,
    size: rand(ENEMY_SIZE_MIN, ENEMY_SIZE_MAX),
    speed: rand(ENEMY_SPEED_MIN, ENEMY_SPEED_MAX),
    color: pick(ENEMY_COLORS),
  });
}

function getSpawnInterval() {
  const elapsed = gameStarted ? (Date.now() - startTime) / 1000 : 0;
  return 2000 - Math.min(elapsed / 90, 1) * 1500;
}

function startSpawnCycle() {
  if (spawnTimeoutId) clearTimeout(spawnTimeoutId);

  function scheduleSpawn() {
    spawnTimeoutId = setTimeout(() => {
      if (!gameOver && gameStarted) spawnEnemy();
      if (!gameOver) scheduleSpawn();
    }, getSpawnInterval());
  }

  scheduleSpawn();
}

function hit(ax, ay, as, bx, by, bs) {
  return Math.abs(ax - bx) * 2 < as + bs && Math.abs(ay - by) * 2 < as + bs;
}

function drawPixelHeart(ctx, x, y, size, color) {
  const p = size / 8;

  const grid = [
    [0, 1, 1, 0, 0, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];

  ctx.fillStyle = color;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col]) {
        ctx.fillRect(x + col * p, y + row * p, p, p);
      }
    }
  }
}

// Drawing
function drawGrid(W, H) {
  ctx.strokeStyle = COLOR_GRID;
  ctx.lineWidth = 1;

  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }

  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function drawTank(cx, cy) {
  ctx.fillStyle = COLOR_TANK;
  ctx.fillRect(cx - TANK_SIZE / 2, cy - TANK_SIZE / 2, TANK_SIZE, TANK_SIZE);

  ctx.strokeStyle = COLOR_BARREL;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + aimX * MUZZLE_LEN, cy + aimY * MUZZLE_LEN);
  ctx.stroke();
}

function drawHUD(W) {
  ctx.fillStyle = COLOR_HUD_BG;
  ctx.fillRect(0, 0, W, 64);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `bold 24px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`SCORE: ${score}`, W / 2, 36);

  if (bestScore > 0) {
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.fillText(`BEST: ${bestScore}`, W / 2, 54);
  }

  const heartSize = 25;
  const totalHearts = 5;
  const startX = W - 20 - totalHearts * (heartSize + 4);

  for (let i = 0; i < totalHearts; i++) {
    drawPixelHeart(
      ctx,
      startX + i * (heartSize + 6),
      22,
      heartSize,
      i < lives ? COLOR_HEART : COLOR_HEART_EMPTY,
    );
  }

  const dotColor = espConnected ? COLOR_CONNECTED : COLOR_WAITING;

  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(22, 36, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dotColor;
  ctx.textAlign = "left";
  ctx.font = `10px ${FONT}`;
  ctx.fillText(espConnected ? "ESP32" : "Waiting...", 36, 42);

  if (activeToast) {
    activeToast.life -= 0.003;

    if (activeToast.life <= 0) {
      activeToast = null;
    } else {
      ctx.globalAlpha = Math.min(activeToast.life * 4, 1);
      ctx.fillStyle = activeToast.color;
      ctx.font = `24px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(activeToast.message, W - 20, 78);
      ctx.globalAlpha = 1;
    }
  }
}

function drawMusicBtn() {
  const { x: bx, y: by, w: bs } = musicBtn;
  const iconX = bx + bs / 2;
  const iconY = by + bs / 2;
  const p = 4;

  ctx.fillStyle = COLOR_MUSIC_ICON;

  const grid = musicPlaying
    ? [
      [1, 0, 1],
      [1, 0, 1],
      [1, 0, 1],
      [1, 0, 1],
      [1, 0, 1],
    ]
    : [
      [1, 0, 0, 0, 0],
      [1, 1, 0, 0, 0],
      [1, 1, 1, 0, 0],
      [1, 1, 1, 1, 0],
      [1, 1, 1, 0, 0],
      [1, 1, 0, 0, 0],
      [1, 0, 0, 0, 0],
    ];

  const offX = iconX - (grid[0].length * p) / 2;
  const offY = iconY - (grid.length * p) / 2;

  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (grid[row][col]) {
        ctx.fillRect(offX + col * p, offY + row * p, p, p);
      }
    }
  }
}

function drawGameOver(W, H) {
  ctx.fillStyle = COLOR_GAMEOVER_BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = `48px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("GAME OVER", W / 2, H / 2);

  ctx.font = `24px ${FONT}`;
  ctx.fillText(`score: ${score}`, W / 2, H / 2 + 48);

  ctx.font = `18px ${FONT}`;

  if (score >= bestScore && score > 0) {
    ctx.fillStyle = COLOR_BEST;
    ctx.fillText("NEW BEST!", W / 2, H / 2 + 76);
  } else {
    ctx.fillStyle = COLOR_TEXT_DIM;
    ctx.fillText(`best: ${bestScore}`, W / 2, H / 2 + 76);
  }

  ctx.fillStyle = COLOR_BARREL;
  ctx.font = `18px ${FONT}`;
  ctx.fillText("Press any ESP32 button to restart", W / 2, H / 2 + 120);
}

// Main loop
function draw() {
  const W = canvas.width;
  const H = canvas.height;

  updateTankFromController();

  ctx.clearRect(0, 0, W, H);
  drawGrid(W, H);

  const cx = W / 2 + tankX * (W / 2 - 40);
  const cy = H / 2 + tankY * (H / 2 - 40);

  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];

    bullet.x += bullet.vx;
    bullet.y += bullet.vy;

    if (
      bullet.x < -80 ||
      bullet.x > W + 80 ||
      bullet.y < -80 ||
      bullet.y > H + 80
    ) {
      bullets.splice(i, 1);
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    const enemy = enemies[i];

    const dx = cx - enemy.x;
    const dy = cy - enemy.y;
    const mag = Math.hypot(dx, dy) || 1;
    const currentSpeed = slowActive ? enemy.speed * 0.3 : enemy.speed;

    enemy.x += (dx / mag) * currentSpeed;
    enemy.y += (dy / mag) * currentSpeed;

    if (hit(enemy.x, enemy.y, enemy.size, cx, cy, TANK_SIZE)) {
      enemies.splice(i, 1);
      lives -= 1;

      playRandomSound("hit", 0.6);

      if (lives <= 0) {
        endGame();
      }
    }
  }

  for (let ei = enemies.length - 1; ei >= 0; ei -= 1) {
    const enemy = enemies[ei];

    for (let bi = bullets.length - 1; bi >= 0; bi -= 1) {
      const bullet = bullets[bi];

      if (hit(enemy.x, enemy.y, enemy.size, bullet.x, bullet.y, bullet.size)) {
        spawnParticles(enemy.x, enemy.y, enemy.color, enemy.size);

        playRandomSound("hit", 0.35);

        enemies.splice(ei, 1);
        bullets.splice(bi, 1);

        score += 1;

        if (score > bestScore) {
          bestScore = score;
          localStorage.setItem("tiltSmashBest", String(bestScore));
        }

        break;
      }
    }
  }

  for (let i = powerups.length - 1; i >= 0; i -= 1) {
    const pu = powerups[i];

    const dx = cx - pu.x;
    const dy = cy - pu.y;
    const mag = Math.hypot(dx, dy) || 1;

    pu.x += (dx / mag) * POWERUP_SPEED;
    pu.y += (dy / mag) * POWERUP_SPEED;

    if (hit(pu.x, pu.y, POWERUP_SIZE, cx, cy, TANK_SIZE)) {
      applyPowerup(pu.type);
      powerups.splice(i, 1);
    }
  }

  ctx.fillStyle = COLOR_BULLET;

  for (const bullet of bullets) {
    ctx.fillRect(
      bullet.x - bullet.size / 2,
      bullet.y - bullet.size / 2,
      bullet.size,
      bullet.size,
    );
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];

    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.03;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  ctx.globalAlpha = 1;

  for (const enemy of enemies) {
    ctx.fillStyle = enemy.color;
    ctx.fillRect(
      enemy.x - enemy.size / 2,
      enemy.y - enemy.size / 2,
      enemy.size,
      enemy.size,
    );
  }

  for (const pu of powerups) {
    ctx.fillStyle = pu.color;
    ctx.fillRect(
      pu.x - POWERUP_SIZE / 2,
      pu.y - POWERUP_SIZE / 2,
      POWERUP_SIZE,
      POWERUP_SIZE,
    );

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(
      pu.x - POWERUP_SIZE / 4,
      pu.y - POWERUP_SIZE / 4,
      POWERUP_SIZE / 2,
      POWERUP_SIZE / 2,
    );
  }

  drawTank(cx, cy);
  drawHUD(W);
  drawMusicBtn();

  if (gameOver) drawGameOver(W, H);

  requestAnimationFrame(draw);
}

draw();