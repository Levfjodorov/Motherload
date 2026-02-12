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
  { from: 6, chance: 0.1, id: 'coal', color: '#3b3b3b', value: 20, hardness: 1 },
  { from: 12, chance: 0.08, id: 'copper', color: '#cd7f32', value: 35, hardness: 1 },
  { from: 20, chance: 0.07, id: 'silver', color: '#cfd8dc', value: 55, hardness: 2 },
  { from: 35, chance: 0.06, id: 'gold', color: '#ffd54f', value: 90, hardness: 2 },
  { from: 50, chance: 0.05, id: 'ruby', color: '#ef476f', value: 150, hardness: 3 },
  { from: 70, chance: 0.045, id: 'emerald', color: '#06d6a0', value: 230, hardness: 4 },
  { from: 90, chance: 0.035, id: 'diamond', color: '#8ecae6', value: 380, hardness: 5 },
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

let cameraY = 0;
let gameOver = false;
let messageTimer = 0;

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
          row.push({ type: 'rock', color: `hsl(34 18% ${25 - Math.min(14, Math.floor(y / 8))}%)`, hardness, value: 0 });
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
    if (depth >= ore.from && Math.random() < ore.chance) {
      selected = ore;
    }
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
    if (!isAtSurface()) {
      consumeFuel(0.14 * dt * 60);
    }
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

  if (newProgress >= needed) {
    if (tile.type === 'ore') {
      player.cargo.push({ id: tile.id, value: tile.value });
      showMessage(`Добыча: ${tile.id} (+$${tile.value})`, 1.4);
    }
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
  if (!gameOver) {
    let dx = 0;
    let dy = 0;
    if (controls.left) dx -= 1;
    if (controls.right) dx += 1;
    if (controls.up) dy -= 1;
    if (controls.down) dy += 1;

    if (dx || dy) {
      attemptMove(dx, dy, dt);
    }

    refillAtSurface();
  }

  cameraY = Math.max(0, player.y - CAMERA_PADDING);
  cameraY = Math.min(cameraY, WORLD_ROWS * TILE - canvas.height);

  if (messageTimer > 0 && messageTimer < 900) {
    messageTimer -= dt;
    if (messageTimer <= 0) {
      ui.message.textContent = '';
    }
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
  drawMiner();
  drawOverlays();
}

function drawSkyAndLayers() {
  const skyHeight = SURFACE_ROW * TILE - cameraY;
  ctx.fillStyle = '#6ab9ff';
  ctx.fillRect(0, 0, canvas.width, Math.max(0, skyHeight));

  ctx.fillStyle = '#635244';
  ctx.fillRect(0, Math.max(0, skyHeight), canvas.width, canvas.height);

  ctx.fillStyle = '#3f3229';
  ctx.fillRect(0, Math.max(0, skyHeight + TILE), canvas.width, canvas.height);

  const surfaceY = SURFACE_ROW * TILE - cameraY;
  ctx.fillStyle = '#76c94f';
  ctx.fillRect(0, surfaceY - 6, canvas.width, 12);
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

      ctx.fillStyle = tile.color || '#5b4638';
      ctx.fillRect(px, py, TILE, TILE);

      if (tile.type === 'ore') {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.arc(px + TILE * 0.35, py + TILE * 0.35, 4, 0, Math.PI * 2);
        ctx.arc(px + TILE * 0.66, py + TILE * 0.6, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      const key = tileKey(x, y);
      if (miningProgress.has(key)) {
        const p = Math.min(1, miningProgress.get(key) / (tile.hardness * 50));
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(px, py + TILE - 5, TILE, 5);
        ctx.fillStyle = '#80ff9a';
        ctx.fillRect(px, py + TILE - 5, TILE * p, 5);
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }
}

function drawMiner() {
  const px = player.x;
  const py = player.y - cameraY;

  ctx.fillStyle = '#f4b860';
  ctx.fillRect(px - player.w / 2, py - player.h / 2, player.w, player.h);

  ctx.fillStyle = '#2b2f3d';
  ctx.fillRect(px - player.w / 2 - 7, py - 4, 8, 8);

  ctx.fillStyle = '#ffd166';
  ctx.beginPath();
  ctx.arc(px + player.w / 2 + 3, py, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawOverlays() {
  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffbbbb';
    ctx.font = 'bold 34px Inter, sans-serif';
    ctx.fillText('Топливо закончилось', canvas.width / 2 - 170, canvas.height / 2 - 12);
    ctx.font = '20px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Нажмите R для нового заезда', canvas.width / 2 - 145, canvas.height / 2 + 24);
  }
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
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') controls.left = true;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') controls.right = true;
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') controls.up = true;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') controls.down = true;

  if (e.key === '1') tryUpgrade('fuel');
  if (e.key === '2') tryUpgrade('cargo');
  if (e.key === '3') tryUpgrade('drill');
  if (e.key.toLowerCase() === 'r') restartGame();
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') controls.left = false;
  if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') controls.right = false;
  if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') controls.up = false;
  if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') controls.down = false;
});

syncUi();
requestAnimationFrame(frame);
