const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const ui = {
  money: document.getElementById('money'),
  fuel: document.getElementById('fuel'),
  cargo: document.getElementById('cargo'),
  cargoCapacity: document.getElementById('cargoCapacity'),
  depth: document.getElementById('depth'),
  drill: document.getElementById('drill'),
  fuelUpgradeCost: document.getElementById('fuelUpgradeCost'),
  cargoUpgradeCost: document.getElementById('cargoUpgradeCost'),
  drillUpgradeCost: document.getElementById('drillUpgradeCost'),
  message: document.getElementById('message'),
};

const TILE = 30;
const WORLD_COLS = 140;
const WORLD_ROWS = 120;
const SURFACE_ROW = 4;
const CAMERA_PADDING = 200;

const ORE_TABLE = [
  { from: 6, chance: 0.1, id: 'coal', color: '#4e4e4e', value: 20, hardness: 1 },
  { from: 12, chance: 0.08, id: 'copper', color: '#c78043', value: 35, hardness: 1 },
  { from: 20, chance: 0.07, id: 'silver', color: '#dce3ea', value: 55, hardness: 2 },
  { from: 35, chance: 0.06, id: 'gold', color: '#ffd75b', value: 90, hardness: 2 },
  { from: 50, chance: 0.05, id: 'ruby', color: '#f54f78', value: 150, hardness: 3 },
  { from: 70, chance: 0.045, id: 'emerald', color: '#15d8ab', value: 230, hardness: 4 },
  { from: 90, chance: 0.035, id: 'diamond', color: '#9fd9ff', value: 380, hardness: 5 },
];

const player = {
  x: Math.floor(WORLD_COLS / 2) * TILE + TILE / 2,
  y: (SURFACE_ROW - 1) * TILE + TILE / 2,
  w: 24,
  h: 18,
  maxFuel: 220,
  fuel: 220,
  money: 0,
  cargo: [],
  cargoCapacity: 10,
  drillPower: 1,
  speed: 180,
};

const upgradeCosts = {
  fuel: 120,
  cargo: 150,
  drill: 220,
};

const controls = { left: false, right: false, up: false, down: false };
const miningProgress = new Map();
const particles = [];

let cameraY = 0;
let gameOver = false;
let messageTimer = 0;
let frameCounter = 0;

const world = generateWorld();

function generateWorld() {
  const map = [];
  for (let y = 0; y < WORLD_ROWS; y++) {
    const row = [];
    for (let x = 0; x < WORLD_COLS; x++) {
      if (y < SURFACE_ROW) {
        row.push({ type: 'air' });
      } else {
        const ore = pickOre(y);
        if (ore) {
          row.push({ type: 'ore', ...ore });
        } else {
          const hardness = y > 90 ? 4 : y > 60 ? 3 : y > 30 ? 2 : 1;
          row.push({ type: 'rock', color: `hsl(30 22% ${24 - Math.min(13, Math.floor(y / 8))}%)`, hardness, value: 0 });
        }
      }
    }
    map.push(row);
  }
  for (let x = 0; x < WORLD_COLS; x++) {
    map[SURFACE_ROW][x] = { type: 'air' };
  }
  return map;
}

function pickOre(depth) {
  let selected = null;
  for (const ore of ORE_TABLE) {
    if (depth >= ore.from && Math.random() < ore.chance) selected = ore;
  }
  return selected ? { ...selected } : null;
}

function getTile(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) return null;
  return world[y][x];
}

function setTile(x, y, value) {
  if (x < 0 || y < 0 || x >= WORLD_COLS || y >= WORLD_ROWS) return;
  world[y][x] = value;
}

function tileKey(x, y) {
  return `${x}:${y}`;
}

function isAtSurface() {
  return player.y <= (SURFACE_ROW - 0.5) * TILE;
}

function showMessage(text, seconds = 2.2) {
  ui.message.textContent = text;
  messageTimer = seconds;
}

function spawnDebris(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 140,
      vy: -Math.random() * 90,
      life: 0.35 + Math.random() * 0.45,
      age: 0,
      size: 2 + Math.random() * 3,
      color,
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt;
    if (p.age >= p.life) particles.splice(i, 1);
  }
}

function attemptMove(dx, dy, dt) {
  if (gameOver) return;

  const distance = player.speed * dt;
  if (dx !== 0 && dy !== 0) {
    dx *= 0.7071;
    dy *= 0.7071;
  }

  const nextX = player.x + dx * distance;
  const nextY = player.y + dy * distance;

  const tx = Math.floor(nextX / TILE);
  const ty = Math.floor(nextY / TILE);
  const tile = getTile(tx, ty);
  if (!tile) return;

  if (tile.type === 'air') {
    player.x = nextX;
    player.y = nextY;
    if (!isAtSurface()) consumeFuel(0.14 * dt * 60);
    return;
  }

  if (player.cargo.length >= player.cargoCapacity) {
    showMessage('Грузовой отсек полный! Вернитесь на поверхность.');
    return;
  }

  const progressKey = tileKey(tx, ty);
  const currentProgress = miningProgress.get(progressKey) || 0;
  const needed = tile.hardness * 50;
  const added = player.drillPower * dt * 60;
  const newProgress = currentProgress + added;
  miningProgress.set(progressKey, newProgress);
  consumeFuel(0.35 * dt * 60);

  if (frameCounter % 3 === 0) {
    spawnDebris(tx * TILE + TILE / 2, ty * TILE + TILE / 2, tile.color || '#7e6a5c', 2);
  }

  if (newProgress >= needed) {
    if (tile.type === 'ore') {
      player.cargo.push({ id: tile.id, value: tile.value });
      showMessage(`Добыча: ${tile.id} (+$${tile.value})`, 1.4);
    }
    spawnDebris(tx * TILE + TILE / 2, ty * TILE + TILE / 2, tile.color || '#7e6a5c', 12);
    setTile(tx, ty, { type: 'air' });
    miningProgress.delete(progressKey);
    player.x = nextX;
    player.y = nextY;
  }
}

function consumeFuel(amount) {
  player.fuel = Math.max(0, player.fuel - amount);
  if (player.fuel === 0) {
    gameOver = true;
    showMessage('Топливо закончилось! Нажмите R для рестарта.', 999);
  }
}

function sellCargo() {
  if (!player.cargo.length) return;
  const income = player.cargo.reduce((sum, item) => sum + item.value, 0);
  player.money += income;
  player.cargo = [];
  showMessage(`Продано руды на $${income}`);
}

function refillAtSurface() {
  if (!isAtSurface()) return;
  player.fuel = player.maxFuel;
  sellCargo();
}

function tryUpgrade(type) {
  if (!isAtSurface()) {
    showMessage('Покупки доступны только на базе (на поверхности).');
    return;
  }

  const cost = upgradeCosts[type];
  if (player.money < cost) {
    showMessage(`Недостаточно денег: нужно $${cost}`);
    return;
  }

  player.money -= cost;
  if (type === 'fuel') {
    player.maxFuel += 40;
    upgradeCosts.fuel = Math.floor(upgradeCosts.fuel * 1.55);
    showMessage('Улучшение бака успешно!');
  } else if (type === 'cargo') {
    player.cargoCapacity += 3;
    upgradeCosts.cargo = Math.floor(upgradeCosts.cargo * 1.6);
    showMessage('Грузовой отсек расширен!');
  } else if (type === 'drill') {
    player.drillPower += 1;
    upgradeCosts.drill = Math.floor(upgradeCosts.drill * 1.7);
    showMessage('Бур усилен!');
  }
}

function restartGame() {
  window.location.reload();
}

function update(dt) {
  frameCounter += 1;

  if (!gameOver) {
    let dx = 0;
    let dy = 0;
    if (controls.left) dx -= 1;
    if (controls.right) dx += 1;
    if (controls.up) dy -= 1;
    if (controls.down) dy += 1;

    if (dx || dy) attemptMove(dx, dy, dt);
    refillAtSurface();
  }

  updateParticles(dt);

  cameraY = Math.max(0, player.y - CAMERA_PADDING);
  cameraY = Math.min(cameraY, WORLD_ROWS * TILE - canvas.height);

  if (messageTimer > 0 && messageTimer < 900) {
    messageTimer -= dt;
    if (messageTimer <= 0) ui.message.textContent = '';
  }

  syncUi();
}

function syncUi() {
  ui.money.textContent = Math.floor(player.money);
  ui.fuel.textContent = `${Math.ceil(player.fuel)} / ${player.maxFuel}`;
  ui.cargo.textContent = player.cargo.length;
  ui.cargoCapacity.textContent = player.cargoCapacity;
  ui.depth.textContent = Math.max(0, Math.floor(player.y / TILE - SURFACE_ROW) * 10);
  ui.drill.textContent = player.drillPower;
  ui.fuelUpgradeCost.textContent = upgradeCosts.fuel;
  ui.cargoUpgradeCost.textContent = upgradeCosts.cargo;
  ui.drillUpgradeCost.textContent = upgradeCosts.drill;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSkyAndLayers();
  drawTiles();
  drawParticles();
  drawMiner();
  drawLightAndFog();
  drawOverlays();
}

function drawSkyAndLayers() {
  const skyHeight = SURFACE_ROW * TILE - cameraY;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(1, skyHeight));
  skyGrad.addColorStop(0, '#84d4ff');
  skyGrad.addColorStop(1, '#3f8fcf');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, Math.max(0, skyHeight));

  ctx.fillStyle = '#5d4e43';
  ctx.fillRect(0, Math.max(0, skyHeight), canvas.width, canvas.height);

  ctx.fillStyle = '#3f332b';
  ctx.fillRect(0, Math.max(0, skyHeight + TILE), canvas.width, canvas.height);

  const surfaceY = SURFACE_ROW * TILE - cameraY;
  const grassGrad = ctx.createLinearGradient(0, surfaceY - 7, 0, surfaceY + 7);
  grassGrad.addColorStop(0, '#91df62');
  grassGrad.addColorStop(1, '#4f9f2f');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, surfaceY - 7, canvas.width, 14);

  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(0, surfaceY - 9, canvas.width, 2);
}

function shadeColor(color, amount) {
  const c = color.replace('#', '');
  const num = Number.parseInt(c, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00ff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000ff) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawVoxelTile(px, py, baseColor, isOre) {
  const topInset = 3;
  const sideInset = 4;

  // top face
  ctx.fillStyle = shadeColor(baseColor, 22);
  ctx.beginPath();
  ctx.moveTo(px + topInset, py + topInset);
  ctx.lineTo(px + TILE - topInset, py + topInset);
  ctx.lineTo(px + TILE - sideInset, py + sideInset);
  ctx.lineTo(px + sideInset, py + sideInset);
  ctx.closePath();
  ctx.fill();

  // front face
  const faceGrad = ctx.createLinearGradient(px, py + sideInset, px, py + TILE);
  faceGrad.addColorStop(0, shadeColor(baseColor, 4));
  faceGrad.addColorStop(1, shadeColor(baseColor, -28));
  ctx.fillStyle = faceGrad;
  ctx.fillRect(px + sideInset, py + sideInset, TILE - sideInset * 2, TILE - sideInset - 2);

  // right face
  ctx.fillStyle = shadeColor(baseColor, -36);
  ctx.beginPath();
  ctx.moveTo(px + TILE - sideInset, py + sideInset);
  ctx.lineTo(px + TILE - 1, py + topInset);
  ctx.lineTo(px + TILE - 1, py + TILE - 2);
  ctx.lineTo(px + TILE - sideInset, py + TILE - 4);
  ctx.closePath();
  ctx.fill();

  if (isOre) {
    const glow = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE / 2);
    glow.addColorStop(0, 'rgba(255,255,255,0.5)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
  }
}

function drawTiles() {
  const startRow = Math.max(0, Math.floor(cameraY / TILE));
  const endRow = Math.min(WORLD_ROWS - 1, Math.ceil((cameraY + canvas.height) / TILE));

  for (let y = startRow; y <= endRow; y++) {
    for (let x = 0; x < WORLD_COLS; x++) {
      const tile = world[y][x];
      if (tile.type === 'air') continue;

      const px = x * TILE;
      const py = y * TILE - cameraY;
      drawVoxelTile(px, py, tile.color || '#5b4638', tile.type === 'ore');

      const key = tileKey(x, y);
      if (miningProgress.has(key)) {
        const p = Math.min(1, miningProgress.get(key) / (tile.hardness * 50));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(px + 3, py + TILE - 6, TILE - 6, 4);
        ctx.fillStyle = '#87ff8f';
        ctx.fillRect(px + 3, py + TILE - 6, (TILE - 6) * p, 4);
      }
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = 1 - p.age / p.life;
    ctx.fillStyle = p.color.startsWith('#')
      ? `${shadeColor(p.color, 0).replace('rgb', 'rgba').replace(')', `,${alpha})`)}`
      : `rgba(210,190,160,${alpha})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y - cameraY, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiner() {
  const px = player.x;
  const py = player.y - cameraY;

  const halfW = player.w / 2;

  // main brass body
  const bodyGrad = ctx.createLinearGradient(px - halfW - 2, py, px + halfW + 2, py);
  bodyGrad.addColorStop(0, '#8f5a20');
  bodyGrad.addColorStop(0.5, '#d29a49');
  bodyGrad.addColorStop(1, '#6d4318');
  ctx.fillStyle = bodyGrad;
  ctx.fillRect(px - halfW - 1, py - player.h / 2 - 1, player.w + 2, player.h + 2);

  // top copper boiler
  const boilerGrad = ctx.createLinearGradient(px, py - 16, px, py - 6);
  boilerGrad.addColorStop(0, '#d3844c');
  boilerGrad.addColorStop(1, '#864722');
  ctx.fillStyle = boilerGrad;
  ctx.fillRect(px - halfW / 1.7, py - player.h / 2 - 7, halfW * 1.2, 8);

  // boiler cap
  ctx.fillStyle = '#4b2f18';
  ctx.fillRect(px - 2, py - 20, 4, 4);

  // exhaust pipe + steam
  ctx.fillStyle = '#6f7986';
  ctx.fillRect(px - 16, py - 18, 5, 11);
  const steam = 0.4 + Math.sin(frameCounter * 0.12) * 0.18;
  ctx.fillStyle = `rgba(220,230,235,${steam})`;
  ctx.beginPath();
  ctx.arc(px - 13.5, py - 22, 3.5, 0, Math.PI * 2);
  ctx.arc(px - 10.5, py - 25, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // side pipe and rivets
  ctx.fillStyle = '#4a2e18';
  ctx.fillRect(px - 10, py - 2, 20, 4);
  ctx.fillStyle = '#d9be7a';
  for (let i = -8; i <= 8; i += 4) {
    ctx.beginPath();
    ctx.arc(px + i, py + 7, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // treads / wheel base
  const baseGrad = ctx.createLinearGradient(px - 14, py + 8, px + 14, py + 8);
  baseGrad.addColorStop(0, '#242a32');
  baseGrad.addColorStop(0.5, '#3d4754');
  baseGrad.addColorStop(1, '#1c2128');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(px - 15, py + 8, 30, 7);

  // front drill mount
  ctx.fillStyle = '#2f3440';
  ctx.fillRect(px + 11, py - 4, 6, 8);

  // steampunk drill bit (cone + spiral ribs)
  const drillGrad = ctx.createLinearGradient(px + 16, py, px + 30, py);
  drillGrad.addColorStop(0, '#9ca6b2');
  drillGrad.addColorStop(1, '#5e6773');
  ctx.fillStyle = drillGrad;
  ctx.beginPath();
  ctx.moveTo(px + 16, py - 5);
  ctx.lineTo(px + 30, py);
  ctx.lineTo(px + 16, py + 5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d6dde6';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const sx = px + 17 + t * 11;
    ctx.beginPath();
    ctx.moveTo(sx, py - 4 + i * 0.6);
    ctx.lineTo(sx - 2.8, py + 3.8 - i * 0.35);
    ctx.stroke();
  }

  // lamp
  const lamp = ctx.createRadialGradient(px + 13, py - 8, 1, px + 13, py - 8, 6);
  lamp.addColorStop(0, '#fffce0');
  lamp.addColorStop(1, '#ffbf3f');
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(px + halfW + 1, py - 8, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(px + 1, py + 16, 19, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawLightAndFog() {
  if (isAtSurface()) return;

  const px = player.x;
  const py = player.y - cameraY;

  const vignette = ctx.createRadialGradient(px, py, 30, px, py, 280);
  vignette.addColorStop(0, 'rgba(255,245,210,0)');
  vignette.addColorStop(0.4, 'rgba(20,24,33,0.15)');
  vignette.addColorStop(1, 'rgba(12,14,20,0.65)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const depthFactor = Math.min(0.45, Math.max(0, (player.y / TILE - SURFACE_ROW) * 0.005));
  ctx.fillStyle = `rgba(8,10,18,${depthFactor})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawOverlays() {
  if (!gameOver) return;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffbbbb';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.fillText('Топливо закончилось', canvas.width / 2 - 170, canvas.height / 2 - 12);
  ctx.font = '20px Inter, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Нажмите R для нового заезда', canvas.width / 2 - 145, canvas.height / 2 + 24);
}

let prev = performance.now();
function frame(now) {
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (e.key === 'ArrowLeft' || key === 'a') controls.left = true;
  if (e.key === 'ArrowRight' || key === 'd') controls.right = true;
  if (e.key === 'ArrowUp' || key === 'w') controls.up = true;
  if (e.key === 'ArrowDown' || key === 's') controls.down = true;

  if (e.key === '1') tryUpgrade('fuel');
  if (e.key === '2') tryUpgrade('cargo');
  if (e.key === '3') tryUpgrade('drill');
  if (key === 'r') restartGame();
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if (e.key === 'ArrowLeft' || key === 'a') controls.left = false;
  if (e.key === 'ArrowRight' || key === 'd') controls.right = false;
  if (e.key === 'ArrowUp' || key === 'w') controls.up = false;
  if (e.key === 'ArrowDown' || key === 's') controls.down = false;
});

syncUi();
requestAnimationFrame(frame);
