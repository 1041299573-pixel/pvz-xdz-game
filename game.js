const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const moneyEl = $('#currency');
const waveText = $('#waveText');
const waveBar = $('#waveBar');

const LEVELS = [
  { name: '草坪初袭', waves: 3, baseCount: 5, step: 1, spawnGap: 2300, health: 1, speed: 1, damage: 1, coneEvery: 4, bucketEvery: 5, sockEvery: 0 },
  { name: '路障来袭', waves: 3, baseCount: 6, step: 1, spawnGap: 2050, health: 1.12, speed: 1.04, damage: 1.06, coneEvery: 3, bucketEvery: 5, sockEvery: 0 },
  { name: '铁桶防线', waves: 4, baseCount: 6, step: 1, spawnGap: 1800, health: 1.25, speed: 1.08, damage: 1.12, coneEvery: 3, bucketEvery: 4, sockEvery: 7 },
  { name: '袜子危机', waves: 4, baseCount: 7, step: 1, spawnGap: 1550, health: 1.42, speed: 1.13, damage: 1.2, coneEvery: 2, bucketEvery: 4, sockEvery: 6 },
  { name: '终极草坪', waves: 5, baseCount: 7, step: 2, spawnGap: 1350, health: 1.62, speed: 1.18, damage: 1.28, coneEvery: 2, bucketEvery: 3, sockEvery: 5 }
];

const S = {
  money: 12,
  selected: null,
  plants: [],
  enemies: [],
  shots: [],
  picks: [],
  cooldowns: {},
  running: false,
  paused: false,
  level: 0,
  lastWin: false,
  time: 0,
  wave: 1,
  spawnedInWave: 0,
  killed: 0,
  total: 18,
  lastSpawn: 0,
  lastPick: 0,
  prepareUntil: 0,
  prepared: false
};

const currentLevel = () => LEVELS[S.level];
const waveEnemyCount = (wave = S.wave) => currentLevel().baseCount + (wave - 1) * currentLevel().step;
const levelEnemyTotal = () => Array.from({ length: currentLevel().waves }, (_, index) => waveEnemyCount(index + 1)).reduce((sum, count) => sum + count, 0);

function updateWaveText() {
  waveText.textContent = `第 ${S.level + 1} 关 · 第 ${S.wave} / ${currentLevel().waves} 波`;
}

const UNIT = {
  single: { name: '哼哼俊', cost: 4, cooldown: 4000, rate: 1250, damage: 22, hp: 140, img: 'assets/henghengjun.webp' },
  double: { name: '离轴盐', cost: 8, cooldown: 7000, rate: 1450, damage: 18, hp: 125, img: 'assets/lizhousalt.webp' },
  wall: { name: '建国', cost: 2, cooldown: 9000, rate: Infinity, damage: 0, hp: 650, img: 'assets/jianguo.webp' },
  squash: { name: '鸡蛋壳', cost: 2, cooldown: 10000, rate: Infinity, damage: 0, hp: 180, img: 'assets/eggshell.webp' },
  dancer: { name: '扩音器', cost: 0, cooldown: 10000, rate: Infinity, damage: 0, hp: 140, img: 'assets/speaker.webp' },
  scare: { name: '周面', cost: 2, cooldown: 9000, rate: Infinity, damage: 0, hp: 170, img: 'assets/zhoumian.webp' }
};

for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 9; c++) {
    const cell = document.createElement('button');
    cell.className = 'cell';
    cell.ariaLabel = `第${r + 1}行第${c + 1}列`;
    cell.onclick = () => place(r, c);
    cell.onmouseenter = () => preview(cell, r, c);
    cell.onmouseleave = () => cell.classList.remove('preview', 'remove-preview');
    board.append(cell);
  }
}

function clearSelection() {
  S.selected = null;
  board.dataset.mode = 'none';
  document.querySelectorAll('.card,.shovel').forEach((item) => {
    item.classList.remove('selected');
    item.setAttribute('aria-pressed', 'false');
  });
  const box = $('#selectionStatus');
  box.className = 'selection-status idle';
  box.innerHTML = '<span>当前选择</span><strong>暂无</strong><small>请先点击左侧植物卡片</small>';
}

function select(type, button) {
  if (type !== 'shovel') {
    const unit = UNIT[type];
    const remaining = S.cooldowns[type] || 0;
    if (remaining > 0) {
      pop(`${unit.name}休眠中 ${Math.ceil(remaining / 1000)}秒`, 8, 10);
      return;
    }
    if (S.money < unit.cost) {
      pop('拨片不够', 8, 10);
      return;
    }
  }

  S.selected = type;
  board.dataset.mode = type;
  document.querySelectorAll('.card,.shovel').forEach((item) => {
    item.classList.remove('selected');
    item.setAttribute('aria-pressed', 'false');
  });
  button.classList.add('selected');
  button.setAttribute('aria-pressed', 'true');

  const box = $('#selectionStatus');
  if (type === 'shovel') {
    box.className = 'selection-status remove-mode';
    box.innerHTML = '<span>当前选择</span><strong>移除工具</strong><small>点击一个已有角色的格子</small>';
  } else {
    const unit = UNIT[type];
    box.className = 'selection-status';
    box.innerHTML = `<span>手里拿着</span><img src="${unit.img}" alt=""><strong>${unit.name}</strong><small>本次只能放置 1 个 · 请选择格子</small>`;
  }
}

document.querySelectorAll('.card').forEach((card) => {
  card.onclick = () => select(card.dataset.unit, card);
});
$('#shovel').onclick = (event) => select('shovel', event.currentTarget);

function preview(cell, r, c) {
  if (!S.selected) return;
  const occupied = S.plants.some((plant) => plant.r === r && plant.c === c);
  if (S.selected === 'shovel') {
    if (occupied) cell.classList.add('remove-preview');
    return;
  }
  if (!occupied) {
    cell.classList.add('preview');
    cell.style.setProperty('--preview', `url(${UNIT[S.selected].img})`);
  }
}

const pos = (r, c) => ({ x: (c + 0.08) / 9 * 100, y: (r + 0.03) / 5 * 100 });

function place(r, c) {
  if (!S.running || S.paused) return;
  if (!S.selected) {
    pop('请先选择植物', c / 9 * 100, r / 5 * 100);
    return;
  }

  const old = S.plants.find((plant) => plant.r === r && plant.c === c);
  if (S.selected === 'shovel') {
    if (old) {
      remove(S.plants, old);
      pop('已移除', c / 9 * 100, r / 5 * 100);
      clearSelection();
    }
    return;
  }
  if (old) {
    pop('这里已经有人了', c / 9 * 100, r / 5 * 100);
    return;
  }

  const type = S.selected;
  const unit = UNIT[type];
  if ((S.cooldowns[type] || 0) > 0) {
    pop(`${unit.name}还在休眠`, c / 9 * 100, r / 5 * 100);
    clearSelection();
    return;
  }
  if (S.money < unit.cost) {
    pop('拨片不够', c / 9 * 100, r / 5 * 100);
    clearSelection();
    return;
  }

  S.money -= unit.cost;
  S.cooldowns[type] = unit.cooldown;
  updateMoney();
  const plant = {
    r,
    c,
    type,
    hp: unit.hp,
    maxHp: unit.hp,
    lastShot: 0,
    triggered: false,
    el: document.createElement('div')
  };
  plant.el.className = `entity plant ${type}`;
  plant.el.innerHTML = `<img src="${unit.img}" alt="${unit.name}">`;
  const point = pos(r, c);
  plant.el.style.left = `${point.x}%`;
  plant.el.style.top = `${point.y}%`;
  board.append(plant.el);
  S.plants.push(plant);
  pop(type === 'dancer' ? '开始跳舞！' : '放置成功', c / 9 * 100, r / 5 * 100);
  clearSelection();
}

function spawn() {
  const config = currentLevel();
  const sequence = (S.wave - 1) * 12 + S.spawnedInWave;
  const socked = config.sockEvery > 0 && S.wave >= 2 && sequence % config.sockEvery === config.sockEvery - 1;
  const bucketed = !socked && S.wave >= 2 && sequence % config.bucketEvery === config.bucketEvery - 1;
  const coned = !socked && !bucketed && sequence % config.coneEvery === config.coneEvery - 1;
  const r = Math.floor(Math.random() * 5);
  const hp = Math.round((socked ? 720 : bucketed ? 420 : coned ? 200 : 100) * config.health);
  const enemy = {
    r,
    x: 94,
    hp,
    maxHp: hp,
    speed: (socked ? 0.0035 : bucketed ? 0.0039 : coned ? 0.0045 : 0.0058) * config.speed,
    damage: Math.round((socked ? 30 : bucketed ? 24 : coned ? 20 : 13) * config.damage),
    lastBite: 0,
    stunnedUntil: 0,
    scaredBy: new Set(),
    el: document.createElement('div')
  };
  enemy.el.className = `entity enemy${coned ? ' coned' : ''}${bucketed ? ' bucketed' : ''}${socked ? ' socked' : ''}`;
  enemy.el.innerHTML = `<img class="body" src="assets/zombie-body.webp" alt=""><img class="jyp-head" src="assets/jyp.webp" alt="JYP">${coned ? '<img class="cone" src="assets/traffic-cone.webp" alt="路障">' : ''}${bucketed ? '<img class="bucket" src="assets/bucket.webp" alt="铁桶">' : ''}${socked ? '<img class="sock" src="assets/sock.webp" alt="袜子">' : ''}`;
  enemy.el.setAttribute('aria-label', socked ? '袜子僵尸' : bucketed ? '铁桶僵尸' : coned ? '路障僵尸' : '普通僵尸');
  enemy.el.style.top = `${r * 20 + 1}%`;
  enemy.el.style.left = `${enemy.x}%`;
  board.append(enemy.el);
  S.enemies.push(enemy);
  S.spawnedInWave++;
}

function shoot(plant, now) {
  if (plant.type !== 'single' && plant.type !== 'double') return;
  const unit = UNIT[plant.type];
  const hasTarget = S.enemies.some((enemy) => enemy.r === plant.r && enemy.x > (plant.c + 0.5) / 9 * 100);
  if (!hasTarget || now - plant.lastShot < unit.rate) return;
  plant.lastShot = now;
  makeShot(plant, unit.damage);
  if (plant.type === 'double') {
    setTimeout(() => S.running && !S.paused && makeShot(plant, unit.damage), 190);
  }
}

function makeShot(plant, damage) {
  const point = pos(plant.r, plant.c);
  const shot = {
    r: plant.r,
    x: point.x + (plant.type === 'single' ? 9.5 : 9.1),
    y: point.y + (plant.type === 'single' ? 7.5 : 7.2),
    damage,
    el: document.createElement('div')
  };
  shot.el.className = `projectile pea${plant.type === 'double' ? ' pink' : ''}`;
  shot.el.setAttribute('aria-label', plant.type === 'double' ? '粉色豌豆' : '豌豆');
  board.append(shot.el);
  S.shots.push(shot);
}

function triggerSquashes() {
  S.plants.filter((plant) => plant.type === 'squash' && !plant.triggered).forEach((plant) => {
    const plantX = (plant.c + 0.5) / 9 * 100;
    const target = S.enemies
      .filter((enemy) => enemy.r === plant.r && enemy.x - plantX >= -3 && enemy.x - plantX <= 16)
      .sort((a, b) => a.x - b.x)[0];
    if (!target) return;
    plant.triggered = true;
    plant.el.classList.add('squashing');
    target.hp = 0;
    pop('压扁！', target.x, target.r * 20 + 4);
    setTimeout(() => remove(S.plants, plant), 520);
  });
}

function triggerScares(now) {
  S.plants.filter((plant) => plant.type === 'scare').forEach((plant) => {
    const plantX = (plant.c + 0.5) / 9 * 100;
    const target = S.enemies
      .filter((enemy) => enemy.r === plant.r && enemy.x > plantX && enemy.x - plantX <= 24 && !enemy.scaredBy.has(plant))
      .sort((a, b) => a.x - b.x)[0];
    if (!target) return;

    target.scaredBy.add(plant);
    target.stunnedUntil = now + 680;
    target.el.classList.add('shocked');
    const mark = document.createElement('span');
    mark.className = 'exclamation';
    mark.textContent = '!';
    target.el.append(mark);
    pop('吓一跳！', target.x, target.r * 20 + 1);

    setTimeout(() => {
      if (!target.el.isConnected) return;
      const oldRow = target.r;
      target.r = oldRow === 0 ? 1 : oldRow === 4 ? 3 : oldRow + (Math.random() < .5 ? -1 : 1);
      target.el.style.top = `${target.r * 20 + 1}%`;
    }, 260);
    setTimeout(() => {
      target.el?.classList.remove('shocked');
      mark.remove();
    }, 680);
  });
}

function dropPick() {
  const pick = {
    x: 10 + Math.random() * 78,
    y: -4,
    target: 12 + Math.random() * 68,
    el: document.createElement('button')
  };
  pick.el.className = 'falling-pick';
  pick.el.innerHTML = '<img src="assets/pick.webp" alt="收集拨片">';
  pick.el.style.left = `${pick.x}%`;
  pick.el.onclick = () => {
    S.money += 2;
    updateMoney();
    remove(S.picks, pick);
    pop('+2 ◆', pick.x, pick.y);
  };
  board.append(pick.el);
  S.picks.push(pick);
  setTimeout(() => {
    if (pick.el.isConnected) remove(S.picks, pick);
  }, 7000);
}

function pop(text, x, y) {
  const element = document.createElement('span');
  element.className = 'pop';
  element.textContent = text;
  element.style.left = `${x}%`;
  element.style.top = `${y}%`;
  $('#floatLayer').append(element);
  setTimeout(() => element.remove(), 900);
}

function updateCards() {
  document.querySelectorAll('.card').forEach((card) => {
    const type = card.dataset.unit;
    const unit = UNIT[type];
    const remaining = Math.max(0, S.cooldowns[type] || 0);
    const cooling = remaining > 0;
    const unavailable = S.money < unit.cost;
    card.classList.toggle('cooling', cooling);
    card.classList.toggle('disabled', cooling || unavailable);
    card.setAttribute('aria-disabled', String(cooling || unavailable));
    card.style.setProperty('--cooldown', `${cooling ? remaining / unit.cooldown * 100 : 0}%`);
    const label = card.querySelector('.cooldown-label');
    if (label) label.textContent = cooling ? `${Math.ceil(remaining / 1000)}秒` : '';
  });
}

function updateMoney() {
  moneyEl.textContent = S.money;
  updateCards();
}

function tick(now) {
  if (!S.running) return;
  if (S.paused) {
    requestAnimationFrame(tick);
    return;
  }

  const dt = Math.min(now - S.time || 16, 40);
  S.time = now;
  const config = currentLevel();
  Object.keys(UNIT).forEach((type) => {
    S.cooldowns[type] = Math.max(0, (S.cooldowns[type] || 0) - dt);
  });
  updateCards();

  if (now - S.lastPick > (S.prepared ? 4000 : 2800)) {
    dropPick();
    S.lastPick = now;
  }
  if (!S.prepared) {
    waveText.textContent = `第 ${S.level + 1} 关 · 准备 ${Math.max(0, Math.ceil((S.prepareUntil - now) / 1000))} 秒`;
    if (now >= S.prepareUntil) {
      S.prepared = true;
      updateWaveText();
      pop('开始进攻！', 42, 40);
    }
  }

  const gap = Math.max(900, config.spawnGap - (S.wave - 1) * 100);
  if (S.prepared && S.spawnedInWave < waveEnemyCount() && now - S.lastSpawn > gap) {
    spawn();
    S.lastSpawn = now;
  }

  S.plants.forEach((plant) => shoot(plant, now));
  triggerSquashes();
  triggerScares(now);
  S.picks.forEach((pick) => {
    pick.y = Math.min(pick.target, pick.y + dt * 0.012);
    pick.el.style.top = `${pick.y}%`;
  });
  S.shots.slice().forEach((shot) => {
    shot.x += dt * 0.025;
    shot.el.style.left = `${shot.x}%`;
    shot.el.style.top = `${shot.y}%`;
    const hit = S.enemies.find((enemy) => enemy.r === shot.r && Math.abs(enemy.x - shot.x) < 3);
    if (hit) {
      hit.hp -= shot.damage;
      hit.el.classList.add('hit');
      setTimeout(() => hit.el?.classList.remove('hit'), 90);
      remove(S.shots, shot);
    } else if (shot.x > 100) {
      remove(S.shots, shot);
    }
  });

  S.enemies.slice().forEach((enemy) => {
    if (now >= enemy.stunnedUntil) {
      const blocker = S.plants.find((plant) => plant.type !== 'dancer' && plant.r === enemy.r && Math.abs((plant.c + 0.5) / 9 * 100 - enemy.x) < 5);
      if (blocker) {
        if (now - enemy.lastBite > 850) {
          blocker.hp -= enemy.damage;
          enemy.lastBite = now;
          blocker.el.classList.add('hurt');
          setTimeout(() => blocker.el?.classList.remove('hurt'), 120);
          if (blocker.hp <= 0) remove(S.plants, blocker);
        }
      } else {
        enemy.x -= dt * enemy.speed;
      }
    }
    enemy.el.style.left = `${enemy.x}%`;
    if (enemy.hp <= 0) {
      remove(S.enemies, enemy);
      S.killed++;
      S.money++;
      updateMoney();
      pop('+1 ◆', enemy.x, enemy.r * 20 + 4);
    } else if (enemy.x < 3) {
      finish(false);
    }
  });

  waveBar.style.width = `${Math.min(100, S.killed / S.total * 100)}%`;
  if (S.prepared && S.spawnedInWave >= waveEnemyCount() && !S.enemies.length && S.wave < config.waves) {
    S.wave++;
    S.spawnedInWave = 0;
    S.prepared = false;
    S.prepareUntil = now + 5000;
    S.lastSpawn = now;
    pop(`第 ${S.wave} 波 · 5秒后进攻`, 35, 40);
  }
  if (S.prepared && S.wave === config.waves && S.spawnedInWave >= waveEnemyCount() && !S.enemies.length) return finish(true);
  requestAnimationFrame(tick);
}

function remove(array, item) {
  item.el.remove();
  const index = array.indexOf(item);
  if (index > -1) array.splice(index, 1);
}

function clearAll() {
  [...S.plants, ...S.enemies, ...S.shots, ...S.picks].forEach((item) => item.el.remove());
  Object.assign(S, {
    money: 12,
    selected: null,
    plants: [],
    enemies: [],
    shots: [],
    picks: [],
    cooldowns: {},
    time: 0,
    wave: 1,
    spawnedInWave: 0,
    killed: 0,
    total: levelEnemyTotal(),
    lastSpawn: 0,
    lastPick: 0,
    paused: false,
    prepareUntil: 0,
    prepared: false
  });
  board.dataset.level = String(S.level + 1);
  clearSelection();
  updateMoney();
  waveText.textContent = `第 ${S.level + 1} 关 · 准备 10 秒`;
  waveBar.style.width = '0';
}

function start() {
  clearAll();
  S.running = true;
  S.prepareUntil = performance.now() + 10000;
  $('.overlay.show')?.classList.remove('show');
  requestAnimationFrame(tick);
}

function finish(win) {
  if (!S.running) return;
  S.running = false;
  S.lastWin = win;
  const finalLevel = S.level === LEVELS.length - 1;
  $('#resultKicker').textContent = win ? 'ENCORE!' : 'SHOW OVER';
  $('#resultTitle').textContent = win ? finalLevel ? '全部通关！' : `第 ${S.level + 1} 关通过` : '防线失守';
  $('#resultText').textContent = win ? finalLevel ? '五个关卡全部完成。' : `下一关：${LEVELS[S.level + 1].name}` : `第 ${S.level + 1} 关还可以再试一次。`;
  $('#restartBtn').textContent = win ? finalLevel ? '重新挑战' : '下一关' : '重试本关';
  $('#endScreen').classList.add('show');
}

function continueGame() {
  if (S.lastWin) S.level = S.level < LEVELS.length - 1 ? S.level + 1 : 0;
  start();
}

board.dataset.mode = 'none';
$('#startBtn').onclick = () => {
  S.level = 0;
  start();
};
$('#restartBtn').onclick = continueGame;
$('#pauseBtn').onclick = () => {
  if (!S.running) return;
  S.paused = true;
  $('#pauseScreen').classList.add('show');
};
$('#resumeBtn').onclick = () => {
  S.paused = false;
  S.time = performance.now();
  $('#pauseScreen').classList.remove('show');
};
updateMoney();
