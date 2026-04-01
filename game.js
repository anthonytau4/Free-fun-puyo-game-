/**
 * ✨ PUYO PUYO AMAZING EDITION ✨
 * Pure HTML5 Canvas + Web Audio API
 * No dependencies required!
 */

'use strict';

// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const COLS = 6;
const ROWS = 13; // 12 visible + 1 hidden top row
const VISIBLE_ROWS = 12;
const CELL = 36; // Cell size in pixels
const BOARD_W = COLS * CELL;
const BOARD_H = VISIBLE_ROWS * CELL;

const COLORS = {
  RED:    { id: 1, main: '#FF3A3A', dark: '#CC0000', light: '#FF8888', glow: 'rgba(255,58,58,0.7)'  },
  BLUE:   { id: 2, main: '#3A8FFF', dark: '#0044CC', light: '#88BBFF', glow: 'rgba(58,143,255,0.7)' },
  GREEN:  { id: 3, main: '#3ADE3A', dark: '#008800', light: '#88FF88', glow: 'rgba(58,222,58,0.7)'  },
  YELLOW: { id: 4, main: '#FFD700', dark: '#CC8800', light: '#FFEE88', glow: 'rgba(255,215,0,0.7)'  },
  PURPLE: { id: 5, main: '#CC44FF', dark: '#880099', light: '#EE88FF', glow: 'rgba(204,68,255,0.7)' },
};
const COLOR_LIST = Object.values(COLORS);
const GARBAGE = { id: 6, main: '#999999', dark: '#555555', light: '#CCCCCC', glow: 'rgba(153,153,153,0.5)' };

// Scoring constants (classic Puyo Puyo Tsu)
const CHAIN_POWER = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 480, 512];
const COLOR_BONUS = [0, 0, 3, 6, 12, 24];
const GROUP_BONUS = [0, 0, 0, 0, 0, 2, 3, 4, 5, 6, 7, 10];

// Game speed (milliseconds between auto-drops)
const BASE_SPEED = 800;
const MIN_SPEED = 150;
const SPEED_DECREMENT = 25;
const LEVEL_THRESHOLD = 10; // clears per level

// Pop/animation timing
const POP_FLASH_DURATION = 600;
const CASCADE_DELAY = 200;
const GARBAGE_FALL_DELAY = 300;

// ============================================================
// AUDIO ENGINE (Web Audio API — no external files)
// ============================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.bgmNode = null;
    this.bgmGain = null;
    this.enabled = true;
    this.bgmEnabled = true;
    this._init();
  }

  _init() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.6;
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio not available');
    }
  }

  _resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _beep(freq, type, duration, vol = 0.4, time = null) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.01);
  }

  _noise(duration, vol = 0.3, time = null) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = time || this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * duration;
    const buf = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    src.buffer = buf;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.start(t);
    src.stop(t + duration + 0.01);
  }

  playMove() {
    this._beep(440, 'sine', 0.06, 0.15);
  }

  playRotate() {
    this._beep(660, 'square', 0.05, 0.12);
    this._beep(880, 'square', 0.04, 0.08, this.ctx ? this.ctx.currentTime + 0.03 : null);
  }

  playLand() {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    // Thud: falling frequency
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.15);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.start(t);
    osc.stop(t + 0.16);
    this._noise(0.08, 0.2);
  }

  playPop(chainNum = 1) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const basePitch = 300 + chainNum * 80;
    // Pop burst
    for (let i = 0; i < 3; i++) {
      const freq = basePitch + i * 120;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 2, t + i * 0.04);
      osc.frequency.exponentialRampToValueAtTime(freq, t + i * 0.04 + 0.1);
      gain.gain.setValueAtTime(0.3, t + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.2);
      osc.start(t + i * 0.04);
      osc.stop(t + i * 0.04 + 0.22);
    }
  }

  playChain(chainNum) {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const idx = Math.min(chainNum - 1, notes.length - 1);
    // Rising arpeggio
    for (let i = 0; i <= idx; i++) {
      this._beep(notes[i], 'square', 0.1, 0.2, t + i * 0.07);
    }
  }

  playGarbageLand() {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.32);
    this._noise(0.15, 0.35);
  }

  playAllClear() {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const melody = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    melody.forEach((freq, i) => {
      this._beep(freq, 'square', 0.15, 0.25, t + i * 0.12);
    });
    this._beep(2093, 'triangle', 0.4, 0.35, t + melody.length * 0.12);
  }

  playGameOver() {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const notes = [523, 440, 349, 262];
    notes.forEach((freq, i) => {
      this._beep(freq, 'sawtooth', 0.3, 0.3, t + i * 0.28);
    });
  }

  playMenuSelect() {
    this._beep(880, 'square', 0.07, 0.2);
  }

  playVictory() {
    if (!this.ctx || !this.enabled) return;
    this._resume();
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 659, 784, 1047];
    notes.forEach((freq, i) => {
      this._beep(freq, 'square', 0.18, 0.3, t + i * 0.14);
    });
    this._beep(1319, 'triangle', 0.5, 0.4, t + notes.length * 0.14);
  }

  // BGM: cheerful chiptune loop
  startBGM() {
    if (!this.ctx || !this.bgmEnabled) return;
    this._resume();
    this.stopBGM();
    const tempo = 0.18; // seconds per beat
    const pattern = [
      // [freq, type, duration_beats, vol]
      [523, 'square', 0.5, 0.15], [659, 'square', 0.5, 0.15], [784, 'square', 0.5, 0.15],
      [1047, 'square', 0.5, 0.15],[784, 'square', 0.5, 0.15], [659, 'square', 0.5, 0.15],
      [523, 'square', 0.5, 0.15], [523, 'square', 0.5, 0.15],
      [440, 'square', 0.5, 0.15], [523, 'square', 0.5, 0.15], [659, 'square', 0.5, 0.15],
      [784, 'square', 0.5, 0.15], [659, 'square', 0.5, 0.15], [523, 'square', 0.5, 0.15],
      [440, 'square', 1.0, 0.15], [330, 'square', 0.5, 0.15], [392, 'square', 0.5, 0.15],
    ];
    const totalDuration = pattern.reduce((s, n) => s + n[2] * tempo, 0);

    const playLoop = () => {
      if (!this.bgmEnabled) return;
      const t = this.ctx.currentTime;
      let time = t;
      // Bass line
      const bassNotes = [130, 165, 196, 220, 165, 196, 130, 130, 110, 130, 165, 196, 165, 130, 110, 87, 98];
      bassNotes.forEach((freq, i) => {
        const dur = pattern[i % pattern.length][2] * tempo;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        if (this.bgmGain) gain.connect(this.bgmGain);
        else gain.connect(this.masterGain);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.07, time + i * tempo);
        gain.gain.exponentialRampToValueAtTime(0.001, time + i * tempo + dur * 0.8);
        osc.start(time + i * tempo);
        osc.stop(time + i * tempo + dur);
      });
      // Melody
      let melTime = t;
      pattern.forEach(([freq, type, dur, vol]) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        if (this.bgmGain) gain.connect(this.bgmGain);
        else gain.connect(this.masterGain);
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, melTime);
        gain.gain.exponentialRampToValueAtTime(0.001, melTime + dur * tempo * 0.9);
        osc.start(melTime);
        osc.stop(melTime + dur * tempo);
        melTime += dur * tempo;
      });
      this._bgmTimeout = setTimeout(playLoop, totalDuration * 1000);
    };

    // BGM volume control
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.5;
    this.bgmGain.connect(this.masterGain);
    playLoop();
  }

  stopBGM() {
    if (this._bgmTimeout) {
      clearTimeout(this._bgmTimeout);
      this._bgmTimeout = null;
    }
  }
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class Particle {
  constructor(x, y, color, vx, vy, size, life) {
    this.x = x; this.y = y;
    this.color = color;
    this.vx = vx; this.vy = vy;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.3;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 0.3 * dt; // gravity
    this.vx *= 0.98;
    this.life -= dt;
    this.rotation += this.rotSpeed;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    // Star shape
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? this.size : this.size * 0.4;
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 4;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 3;
      const size = 3 + Math.random() * 4;
      const life = 40 + Math.random() * 30;
      this.particles.push(new Particle(x, y, color, vx, vy, size, life));
    }
  }

  update(dt) {
    this.particles = this.particles.filter(p => p.life > 0);
    this.particles.forEach(p => p.update(dt));
  }

  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }

  clear() {
    this.particles = [];
  }
}

// ============================================================
// BOARD (grid logic)
// ============================================================
class Board {
  constructor() {
    // grid[row][col] = color.id or 0 for empty
    this.grid = [];
    this.clear();
    this.particles = new ParticleSystem();
    this.animations = []; // active animation objects
    this.pendingGarbage = 0;
    this.score = 0;
    this.chainCount = 0;
    this.totalClears = 0;
    this.level = 1;
    this.isPopping = false;
    this.gameOver = false;
    this.allClearPending = false;
    this.flashCells = []; // cells flashing before pop
    this.cascadeCells = []; // cells currently falling
  }

  clear() {
    this.grid = [];
    for (let r = 0; r < ROWS; r++) {
      this.grid.push(new Array(COLS).fill(0));
    }
  }

  get(r, c) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return -1;
    return this.grid[r][c];
  }

  set(r, c, val) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    this.grid[r][c] = val;
  }

  isEmpty(r, c) {
    return this.get(r, c) === 0;
  }

  // Check if board has overflowed (top row occupied)
  isOverflow() {
    for (let c = 0; c < COLS; c++) {
      if (this.grid[0][c] !== 0) return true;
    }
    return false;
  }

  // BFS flood fill to find connected groups
  findGroups() {
    const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    const groups = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = this.grid[r][c];
        if (color === 0 || color === GARBAGE.id || visited[r][c]) continue;
        // BFS
        const group = [];
        const queue = [[r, c]];
        visited[r][c] = true;
        while (queue.length > 0) {
          const [cr, cc] = queue.shift();
          group.push([cr, cc]);
          const neighbors = [[cr-1,cc],[cr+1,cc],[cr,cc-1],[cr,cc+1]];
          for (const [nr, nc] of neighbors) {
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS &&
                !visited[nr][nc] && this.grid[nr][nc] === color) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        groups.push({ color, cells: group });
      }
    }
    return groups;
  }

  // Find groups of 4+ ready to pop; also find adjacent garbage
  findPoppable() {
    const groups = this.findGroups();
    const poppable = groups.filter(g => g.cells.length >= 4);
    const garbageToRemove = new Set();
    // Find garbage adjacent to poppable groups
    for (const group of poppable) {
      for (const [r, c] of group.cells) {
        const neighbors = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS &&
              this.grid[nr][nc] === GARBAGE.id) {
            garbageToRemove.add(`${nr},${nc}`);
          }
        }
      }
    }
    return { poppable, garbageToRemove };
  }

  // Apply gravity: cells fall to fill empty spaces
  applyGravity() {
    let moved = false;
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this.grid[r][c] !== 0) {
          if (writeRow !== r) {
            this.grid[writeRow][c] = this.grid[r][c];
            this.grid[r][c] = 0;
            moved = true;
          }
          writeRow--;
        }
      }
    }
    return moved;
  }

  // Drop garbage into board
  dropGarbage(count) {
    if (count <= 0) return;
    // Fill top row with garbage evenly
    const cols = [...Array(COLS).keys()].sort(() => Math.random() - 0.5);
    let placed = 0;
    for (let r = 0; r < ROWS && placed < count; r++) {
      for (const c of cols) {
        if (placed >= count) break;
        if (this.grid[r][c] === 0) {
          this.grid[r][c] = GARBAGE.id;
          placed++;
        }
      }
    }
  }

  // Count unique colors in popped cells
  countColors(poppable) {
    const colorSet = new Set(poppable.map(g => g.color));
    return colorSet.size;
  }

  // Calculate score for a pop step
  calcScore(poppable, chainNum) {
    let totalPuyos = 0;
    poppable.forEach(g => totalPuyos += g.cells.length);
    const chainPower = CHAIN_POWER[Math.min(chainNum, CHAIN_POWER.length - 1)] || (chainNum * 32);
    const colorCount = this.countColors(poppable);
    const colorBonus = COLOR_BONUS[Math.min(colorCount, COLOR_BONUS.length - 1)];
    // Group bonus: sum of group bonuses for each group
    let groupBonus = 0;
    poppable.forEach(g => {
      groupBonus += GROUP_BONUS[Math.min(g.cells.length, GROUP_BONUS.length - 1)];
    });
    const bonus = Math.max(1, chainPower + colorBonus + groupBonus);
    return 10 * totalPuyos * bonus;
  }

  // Compute garbage to send
  calcGarbage(poppable, chainNum) {
    let totalPuyos = 0;
    poppable.forEach(g => totalPuyos += g.cells.length);
    const chainBonus = Math.max(1, Math.floor(chainNum * 1.5));
    return Math.floor(totalPuyos / 4) * chainBonus;
  }
}

// ============================================================
// CURRENT PIECE (falling pair)
// ============================================================
class Piece {
  constructor(color1, color2) {
    this.col = Math.floor(COLS / 2) - 1; // starting column
    this.row = 1; // pivot row (row 1 = first visible row; row 0 = hidden spawn row)
    this.color1 = color1; // pivot color
    this.color2 = color2; // secondary color
    // rotation: 0=up, 1=right, 2=down, 3=left
    // pivot at (row, col), secondary relative to pivot
    this.rotation = 0;
  }

  // Get positions of both puyos [pivot, secondary]
  getPositions() {
    const { row, col, rotation } = this;
    const offsets = [
      [[-1, 0]], // 0: secondary above
      [[0, 1]],  // 1: secondary right
      [[1, 0]],  // 2: secondary below
      [[0, -1]], // 3: secondary left
    ];
    const [dr, dc] = offsets[rotation][0];
    return [
      [row, col],
      [row + dr, col + dc],
    ];
  }

  // Get colors [pivot, secondary]
  getColors() {
    return [this.color1, this.color2];
  }

  rotateCW() {
    this.rotation = (this.rotation + 1) % 4;
  }

  rotateCCW() {
    this.rotation = (this.rotation + 3) % 4;
  }
}

// ============================================================
// RENDERER
// ============================================================
class Renderer {
  constructor(canvas, nextCanvas) {
    this.canvas = canvas;
    this.nextCanvas = nextCanvas;
    this.ctx = canvas.getContext('2d');
    this.nextCtx = nextCanvas ? nextCanvas.getContext('2d') : null;
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    if (nextCanvas) {
      nextCanvas.width = 60;
      nextCanvas.height = 120;
    }
  }

  // Draw a single Puyo cell
  _drawPuyo(ctx, x, y, size, colorObj, connections = {}, alpha = 1, scale = 1, flashAlpha = 0) {
    if (!colorObj) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-size/2, -size/2);

    const r = size * 0.45;
    const px = size / 2;
    const py = size / 2;

    // Shadow
    ctx.shadowBlur = 8;
    ctx.shadowColor = colorObj.dark;

    // Body
    const bodyGrad = ctx.createRadialGradient(px - r*0.25, py - r*0.25, r*0.1, px, py, r);
    bodyGrad.addColorStop(0, colorObj.light);
    bodyGrad.addColorStop(0.5, colorObj.main);
    bodyGrad.addColorStop(1, colorObj.dark);
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // Connection blobs (merge with neighbors)
    const connSize = r * 0.55;
    if (connections.up) {
      ctx.beginPath();
      ctx.ellipse(px, py - r * 0.65, connSize * 0.7, connSize, 0, 0, Math.PI * 2);
      ctx.fillStyle = colorObj.main;
      ctx.fill();
    }
    if (connections.down) {
      ctx.beginPath();
      ctx.ellipse(px, py + r * 0.65, connSize * 0.7, connSize, 0, 0, Math.PI * 2);
      ctx.fillStyle = colorObj.main;
      ctx.fill();
    }
    if (connections.left) {
      ctx.beginPath();
      ctx.ellipse(px - r * 0.65, py, connSize, connSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = colorObj.main;
      ctx.fill();
    }
    if (connections.right) {
      ctx.beginPath();
      ctx.ellipse(px + r * 0.65, py, connSize, connSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fillStyle = colorObj.main;
      ctx.fill();
    }

    // Redraw body on top of connections
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.shadowBlur = 0;
    ctx.fill();

    // Glow outline
    ctx.strokeStyle = colorObj.light;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Shine highlight
    ctx.beginPath();
    ctx.arc(px - r*0.28, py - r*0.28, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.shadowBlur = 0;
    ctx.fill();

    // Eyes (cute!)
    const eyeY = py - r * 0.05;
    const eyeSpacing = r * 0.32;
    const eyeR = r * 0.14;
    ctx.fillStyle = '#1A0A2A';
    ctx.shadowBlur = 0;
    // Left eye
    ctx.beginPath();
    ctx.arc(px - eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // Right eye
    ctx.beginPath();
    ctx.arc(px + eyeSpacing, eyeY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(px - eyeSpacing + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px + eyeSpacing + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fill();

    // Flash overlay
    if (flashAlpha > 0) {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
      ctx.fill();
    }

    ctx.restore();
  }

  _drawGarbage(ctx, x, y, size, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-size/2, -size/2);

    const r = size * 0.42;
    const px = size / 2;
    const py = size / 2;

    ctx.shadowBlur = 6;
    ctx.shadowColor = '#555';

    const grad = ctx.createRadialGradient(px - r*0.2, py - r*0.2, r*0.1, px, py, r);
    grad.addColorStop(0, '#CCCCCC');
    grad.addColorStop(0.6, '#888888');
    grad.addColorStop(1, '#444444');
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#BBBBBB';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // X mark
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(50,50,50,0.5)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const d = r * 0.4;
    ctx.beginPath();
    ctx.moveTo(px - d, py - d);
    ctx.lineTo(px + d, py + d);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + d, py - d);
    ctx.lineTo(px - d, py + d);
    ctx.stroke();

    ctx.restore();
  }

  // Get connection info for a cell
  _getConnections(grid, r, c) {
    const color = grid[r][c];
    if (!color || color === GARBAGE.id) return {};
    return {
      up:    r > 0 && grid[r-1][c] === color,
      down:  r < ROWS-1 && grid[r+1][c] === color,
      left:  c > 0 && grid[r][c-1] === color,
      right: c < COLS-1 && grid[r][c+1] === color,
    };
  }

  getColorObj(colorId) {
    return COLOR_LIST.find(c => c.id === colorId) || null;
  }

  drawBoard(board, currentPiece, nextPiece, nextNextPiece, ghostRow, flashSet, cascadeSet, dropAnimations) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    // Background grid
    for (let r = 0; r < VISIBLE_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
        ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(100, 80, 200, 0.15)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= VISIBLE_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(BOARD_W, r * CELL);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, BOARD_H);
      ctx.stroke();
    }

    // Ghost piece
    if (currentPiece && ghostRow !== null && ghostRow !== undefined) {
      const positions = currentPiece.getPositions();
      const colors = currentPiece.getColors();
      const dr = ghostRow - currentPiece.row;
      positions.forEach(([pr, pc], i) => {
        const gr = pr + dr;
        if (gr >= 0 && gr < ROWS) {
          const displayR = gr - 1; // offset for hidden row
          if (displayR >= 0 && displayR < VISIBLE_ROWS) {
            const colorObj = this.getColorObj(colors[i].id);
            this._drawPuyo(ctx, pc * CELL, displayR * CELL, CELL, colorObj, {}, 0.3);
          }
        }
      });
    }

    // Board cells
    for (let r = 1; r < ROWS; r++) { // skip hidden row 0
      const displayR = r - 1;
      for (let c = 0; c < COLS; c++) {
        const cellId = board.grid[r][c];
        if (cellId === 0) continue;

        // Check for cascade animation
        let yOffset = 0;
        if (cascadeSet) {
          const key = `${r},${c}`;
          if (cascadeSet[key] !== undefined) yOffset = cascadeSet[key];
        }

        const flashKey = `${r},${c}`;
        const flashAlpha = (flashSet && flashSet[flashKey] !== undefined) ? flashSet[flashKey] : 0;

        // Scale for bounce landing
        let scaleY = 1;
        let scaleX = 1;
        if (dropAnimations && dropAnimations[`${r},${c}`]) {
          const anim = dropAnimations[`${r},${c}`];
          const t = anim.t / anim.maxT;
          // Squash and stretch
          if (t < 0.3) {
            scaleY = 0.7 + t / 0.3 * 0.5;
            scaleX = 1 + (1 - scaleY) * 0.5;
          } else if (t < 0.6) {
            scaleY = 1.2 - (t - 0.3) / 0.3 * 0.3;
            scaleX = 1 - (scaleY - 1) * 0.5;
          } else {
            scaleY = 0.9 + (t - 0.6) / 0.4 * 0.1;
            scaleX = 1 - (scaleY - 1) * 0.5;
          }
        }

        const x = c * CELL;
        const y = displayR * CELL + yOffset;

        if (cellId === GARBAGE.id) {
          this._drawGarbage(ctx, x, y, CELL, 1, 1);
        } else {
          const colorObj = this.getColorObj(cellId);
          const conn = this._getConnections(board.grid, r, c);
          // Adjust connections for display row offset
          const displayConn = {
            up: conn.up && r > 1,
            down: conn.down,
            left: conn.left,
            right: conn.right,
          };
          ctx.save();
          ctx.translate(x + CELL/2, y + CELL/2);
          ctx.scale(scaleX, scaleY);
          ctx.translate(-(x + CELL/2), -(y + CELL/2));
          this._drawPuyo(ctx, x, y, CELL, colorObj, displayConn, 1, 1, flashAlpha);
          ctx.restore();
        }
      }
    }

    // Current piece
    if (currentPiece) {
      const positions = currentPiece.getPositions();
      const colors = currentPiece.getColors();
      positions.forEach(([pr, pc], i) => {
        const displayR = pr - 1; // offset for hidden row
        if (displayR >= -1 && displayR < VISIBLE_ROWS && pc >= 0 && pc < COLS) {
          const colorObj = this.getColorObj(colors[i].id);
          if (displayR >= 0) {
            this._drawPuyo(ctx, pc * CELL, displayR * CELL, CELL, colorObj, {}, 1);
          }
        }
      });
    }

    // Particles
    board.particles.draw(ctx);
  }

  drawNextPiece(nextPiece, nextNextPiece, canvas) {
    const ctx = canvas ? canvas.getContext('2d') : this.nextCtx;
    if (!ctx) return;
    const w = canvas ? canvas.width : 60;
    const h = canvas ? canvas.height : 120;
    ctx.clearRect(0, 0, w, h);

    if (!nextPiece) return;

    const size = Math.min(w / 2, h / 4) * 1.6;
    const drawPair = (piece, offsetY) => {
      const colors = piece.getColors();
      // Draw them stacked
      const x = w / 2 - size / 2;
      this._drawPuyo(ctx, x, offsetY, size, this.getColorObj(colors[1].id), {}, 1);
      this._drawPuyo(ctx, x, offsetY + size, size, this.getColorObj(colors[0].id), {}, 1);
    };

    drawPair(nextPiece, 2);
    if (nextNextPiece) {
      ctx.globalAlpha = 0.7;
      const smallSize = size * 0.65;
      const x2 = w / 2 - smallSize / 2;
      this._drawPuyo(ctx, x2, h * 0.55, smallSize, this.getColorObj(nextNextPiece.getColors()[1].id), {}, 0.7);
      this._drawPuyo(ctx, x2, h * 0.55 + smallSize, smallSize, this.getColorObj(nextNextPiece.getColors()[0].id), {}, 0.7);
      ctx.globalAlpha = 1;
    }
  }
}

// ============================================================
// GAME STATE MACHINE
// ============================================================

const GamePhase = {
  DROPPING: 'DROPPING',
  LOCKING:  'LOCKING',
  POPPING:  'POPPING',
  CASCADING:'CASCADING',
  SPAWNING: 'SPAWNING',
  GAME_OVER:'GAME_OVER',
};

class GameInstance {
  constructor(boardEl, nextCanvas, isPlayer = true, difficulty = 'EASY') {
    this.boardEl = boardEl;
    this.nextCanvas = nextCanvas;
    this.isPlayer = isPlayer;
    this.difficulty = difficulty;

    this.board = new Board();
    this.renderer = new Renderer(boardEl, null);
    this.nextRenderer = null; // For next piece display

    this.phase = GamePhase.SPAWNING;
    this.currentPiece = null;
    this.nextPiece = null;
    this.nextNextPiece = null;

    this.dropTimer = 0;
    this.lockTimer = 0;
    this.popTimer = 0;
    this.animTimer = 0;

    this.ghostRow = null;
    this.flashSet = {};
    this.cascadeSet = {};
    this.dropAnimations = {};

    this.lastTime = 0;
    this.paused = false;

    this.chainCount = 0;
    this.pendingGarbage = 0; // garbage queued to send
    this.incomingGarbage = 0; // garbage waiting to drop on board

    this.onSendGarbage = null; // callback: sends garbage to opponent
    this.onChain = null;       // callback: chain event
    this.onGameOver = null;

    // Use 5 colors for Hard CPU opponents; 4 for everything else
    this.numColors = (!isPlayer && difficulty === 'HARD') ? 5 : 4;
    this.activeColors = COLOR_LIST.slice(0, this.numColors);

    this._generateQueue();
    this._spawnPiece();
  }

  _randomColor() {
    return this.activeColors[Math.floor(Math.random() * this.activeColors.length)];
  }

  _generateQueue() {
    this.nextPiece = new Piece(this._randomColor(), this._randomColor());
    this.nextNextPiece = new Piece(this._randomColor(), this._randomColor());
  }

  _spawnPiece() {
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.nextNextPiece;
    this.nextNextPiece = new Piece(this._randomColor(), this._randomColor());
    this.phase = GamePhase.DROPPING;
    this.dropTimer = 0;
    this._updateGhost();
  }

  _collides(piece, dr = 0, dc = 0, testRotation = null) {
    const testPiece = {
      row: piece.row + dr,
      col: piece.col + dc,
      rotation: testRotation !== null ? testRotation : piece.rotation,
      color1: piece.color1,
      color2: piece.color2,
      getPositions: Piece.prototype.getPositions,
      getColors: piece.getColors.bind(piece),
    };
    const positions = testPiece.getPositions();
    for (const [r, c] of positions) {
      if (c < 0 || c >= COLS || r >= ROWS) return true;
      if (r >= 0 && this.board.grid[r][c] !== 0) return true;
    }
    return false;
  }

  _updateGhost() {
    if (!this.currentPiece) { this.ghostRow = null; return; }
    let ghostDr = 0;
    while (!this._collides(this.currentPiece, ghostDr + 1, 0)) ghostDr++;
    this.ghostRow = this.currentPiece.row + ghostDr;
  }

  get dropSpeed() {
    const level = this.board.level;
    return Math.max(MIN_SPEED, BASE_SPEED - (level - 1) * SPEED_DECREMENT);
  }

  // ---- Controls ----
  _moveHorizontal(dc) {
    if (this.phase !== GamePhase.DROPPING) return false;
    if (!this._collides(this.currentPiece, 0, dc)) {
      this.currentPiece.col += dc;
      this._updateGhost();
      return true;
    }
    return false;
  }

  moveLeft()  { return this._moveHorizontal(-1); }
  moveRight() { return this._moveHorizontal(1); }

  softDrop() {
    if (this.phase !== GamePhase.DROPPING) return false;
    this.dropTimer = this.dropSpeed; // trigger immediate drop
    return true;
  }

  hardDrop() {
    if (this.phase !== GamePhase.DROPPING) return false;
    while (!this._collides(this.currentPiece, 1, 0)) {
      this.currentPiece.row++;
    }
    this._lockPiece();
    return true;
  }

  rotateCW() {
    if (this.phase !== GamePhase.DROPPING) return false;
    return this._tryRotate(1);
  }

  rotateCCW() {
    if (this.phase !== GamePhase.DROPPING) return false;
    return this._tryRotate(-1);
  }

  _tryRotate(dir) {
    const newRot = (this.currentPiece.rotation + (dir > 0 ? 1 : 3)) % 4;
    // Try normal rotation
    if (!this._collides(this.currentPiece, 0, 0, newRot)) {
      this.currentPiece.rotation = newRot;
      this._updateGhost();
      return true;
    }
    // Wall kick: try adjusting column
    for (const dc of [-1, 1, -2, 2]) {
      if (!this._collides(this.currentPiece, 0, dc, newRot)) {
        this.currentPiece.col += dc;
        this.currentPiece.rotation = newRot;
        this._updateGhost();
        return true;
      }
    }
    return false;
  }

  _lockPiece() {
    const positions = this.currentPiece.getPositions();
    const colors = this.currentPiece.getColors();
    positions.forEach(([r, c], i) => {
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        this.board.set(r, c, colors[i].id);
      }
    });

    // Add landing animations
    positions.forEach(([r, c]) => {
      if (r >= 1) {
        this.dropAnimations[`${r},${c}`] = { t: 0, maxT: 20 };
      }
    });

    this.currentPiece = null;
    this.chainCount = 0;
    this._popPhaseData = null;

    // Check game over AFTER locking (board is full to hidden row)
    if (this.board.isOverflow()) {
      this.phase = GamePhase.GAME_OVER;
      this.board.gameOver = true;
      if (this.onGameOver) this.onGameOver();
      return;
    }

    this.phase = GamePhase.POPPING;
    this.popTimer = 0;
    this._startPopPhase();
  }

  _startPopPhase() {
    const { poppable, garbageToRemove } = this.board.findPoppable();
    if (poppable.length === 0) {
      // No pops — drop garbage and spawn
      if (this.incomingGarbage > 0) {
        this._dropIncomingGarbage();
      } else {
        // Check all clear
        const isEmpty = this.board.grid.every(row => row.every(c => c === 0));
        if (isEmpty && this.chainCount > 0) {
          this.board.allClearPending = true;
        }
        this._spawnPiece();
      }
      return;
    }

    this.chainCount++;
    if (this.onChain) this.onChain(this.chainCount);

    // Mark cells for flash/pop
    this.flashSet = {};
    poppable.forEach(group => {
      group.cells.forEach(([r, c]) => {
        this.flashSet[`${r},${c}`] = 0;
      });
    });
    garbageToRemove.forEach(key => {
      this.flashSet[key] = 0;
    });

    this.phase = GamePhase.POPPING;
    this.popTimer = 0;
    this._popPhaseData = { poppable, garbageToRemove };
  }

  _executePop() {
    const { poppable, garbageToRemove } = this._popPhaseData;

    // Score
    const points = this.board.calcScore(poppable, this.chainCount);
    this.board.score += points;
    this.board.totalClears += poppable.reduce((s, g) => s + g.cells.length, 0);

    // Level
    const newLevel = Math.floor(this.board.totalClears / LEVEL_THRESHOLD) + 1;
    this.board.level = Math.min(newLevel, 20);

    // Garbage to send
    const garbage = this.board.calcGarbage(poppable, this.chainCount);
    this.pendingGarbage += garbage;

    // Particles
    poppable.forEach(group => {
      group.cells.forEach(([r, c]) => {
        if (r >= 1) {
          const colorObj = this.renderer.getColorObj(group.color);
          const px = c * CELL + CELL / 2;
          const py = (r - 1) * CELL + CELL / 2;
          this.board.particles.burst(px, py, colorObj.main, 10);
        }
      });
    });

    // Remove cells
    poppable.forEach(group => {
      group.cells.forEach(([r, c]) => {
        this.board.set(r, c, 0);
      });
    });
    garbageToRemove.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      this.board.set(r, c, 0);
    });

    this.flashSet = {};

    // Send garbage
    if (this.pendingGarbage > 0 && this.onSendGarbage) {
      const toSend = this.pendingGarbage;
      this.pendingGarbage = 0;
      this.onSendGarbage(toSend);
    }

    // Apply gravity, then check for more pops
    this.board.applyGravity();
    this.phase = GamePhase.CASCADING;
    this.animTimer = 0;
  }

  _dropIncomingGarbage() {
    const amount = this.incomingGarbage;
    this.incomingGarbage = 0;
    this.board.dropGarbage(amount);
    this._spawnPiece();
  }

  receiveGarbage(amount) {
    // Can offset with pending garbage
    if (this.pendingGarbage > 0) {
      const offset = Math.min(this.pendingGarbage, amount);
      this.pendingGarbage -= offset;
      amount -= offset;
    }
    this.incomingGarbage += amount;
  }

  // ---- Update ----
  update(dt) {
    if (this.paused || this.phase === GamePhase.GAME_OVER) return;

    // Update particles
    this.board.particles.update(dt);

    // Update drop animations
    for (const key of Object.keys(this.dropAnimations)) {
      this.dropAnimations[key].t++;
      if (this.dropAnimations[key].t >= this.dropAnimations[key].maxT) {
        delete this.dropAnimations[key];
      }
    }

    switch (this.phase) {
      case GamePhase.DROPPING:
        this.dropTimer += dt * 60; // convert to 60fps units
        if (this.dropTimer >= this.dropSpeed / 16.67) {
          this.dropTimer = 0;
          if (!this._collides(this.currentPiece, 1, 0)) {
            this.currentPiece.row++;
            this._updateGhost();
          } else {
            // Lock
            this._lockPiece();
          }
        }
        break;

      case GamePhase.POPPING:
        this.popTimer += dt * 60;
        if (this._popPhaseData) {
          // Animate flash
          const flashProgress = Math.min(1, this.popTimer / (POP_FLASH_DURATION / 16.67));
          for (const key of Object.keys(this.flashSet)) {
            // Oscillate flash alpha
            this.flashSet[key] = Math.abs(Math.sin(this.popTimer * 0.3)) * 0.8;
          }
          if (this.popTimer >= POP_FLASH_DURATION / 16.67) {
            this._executePop();
          }
        } else {
          // Waiting for first pop check
          this._startPopPhase();
        }
        break;

      case GamePhase.CASCADING:
        this.animTimer += dt * 60;
        if (this.animTimer >= CASCADE_DELAY / 16.67) {
          this.animTimer = 0;
          // Check for more pops
          this._startPopPhase();
        }
        break;

      case GamePhase.SPAWNING:
        this._spawnPiece();
        break;
    }
  }

  render(nextCanvas) {
    this.renderer.drawBoard(
      this.board,
      this.currentPiece,
      this.nextPiece,
      this.nextNextPiece,
      this.ghostRow,
      this.flashSet,
      this.cascadeSet,
      this.dropAnimations
    );

    // Draw next piece
    if (nextCanvas && this.nextPiece) {
      this.renderer.drawNextPiece(this.nextPiece, this.nextNextPiece, nextCanvas);
    }
  }
}

// ============================================================
// CPU AI
// ============================================================
class CpuAI {
  constructor(gameInstance, difficulty = 'EASY') {
    this.game = gameInstance;
    this.difficulty = difficulty;
    this.actionTimer = 0;
    this.thinkTimer = 0;
    this.planned = null;
    this.actionQueue = [];

    // Difficulty config
    const configs = {
      EASY:   { thinkDelay: 800, actionDelay: 180, randomChance: 0.4, lookahead: false },
      MEDIUM: { thinkDelay: 400, actionDelay: 100, randomChance: 0.15, lookahead: false },
      HARD:   { thinkDelay: 150, actionDelay: 50,  randomChance: 0.03, lookahead: true },
    };
    this.config = configs[difficulty] || configs.EASY;
  }

  update(dt) {
    if (this.game.phase !== GamePhase.DROPPING || this.game.board.gameOver) return;

    this.thinkTimer += dt * 60;
    this.actionTimer += dt * 60;

    // Re-plan when spawning or when no plan
    if (!this.planned || this.actionQueue.length === 0) {
      if (this.thinkTimer >= this.config.thinkDelay / 16.67) {
        this.thinkTimer = 0;
        this._plan();
      }
      return;
    }

    // Execute planned actions
    if (this.actionTimer >= this.config.actionDelay / 16.67 && this.actionQueue.length > 0) {
      this.actionTimer = 0;
      const action = this.actionQueue.shift();
      this._executeAction(action);
    }
  }

  _plan() {
    const piece = this.game.currentPiece;
    if (!piece) return;

    // Random play for easier difficulties
    if (Math.random() < this.config.randomChance) {
      this._planRandom();
      return;
    }

    // Evaluate all possible placements
    let bestScore = -Infinity;
    let bestActions = null;

    for (let rotation = 0; rotation < 4; rotation++) {
      for (let targetCol = 0; targetCol < COLS; targetCol++) {
        const actions = this._getActionsForPlacement(piece, targetCol, rotation);
        if (!actions) continue;

        // Simulate placement
        const score = this._evaluatePlacement(piece, targetCol, rotation);
        if (score > bestScore) {
          bestScore = score;
          bestActions = actions;
        }
      }
    }

    if (bestActions) {
      this.planned = true;
      this.actionQueue = [...bestActions, 'drop'];
    } else {
      this._planRandom();
    }
  }

  _planRandom() {
    const actions = [];
    const targetCol = Math.floor(Math.random() * COLS);
    const piece = this.game.currentPiece;
    if (!piece) return;
    const dc = targetCol - piece.col;
    for (let i = 0; i < Math.abs(dc); i++) actions.push(dc > 0 ? 'right' : 'left');
    if (Math.random() < 0.3) actions.push('rotateCW');
    actions.push('drop');
    this.planned = true;
    this.actionQueue = actions;
  }

  _getActionsForPlacement(piece, targetCol, rotation) {
    const actions = [];
    // Rotations
    const curRot = piece.rotation;
    const rotDiff = (rotation - curRot + 4) % 4;
    for (let i = 0; i < (rotDiff <= 2 ? rotDiff : 4 - rotDiff); i++) {
      actions.push(rotDiff <= 2 ? 'rotateCW' : 'rotateCCW');
    }

    // Test if we can place here
    const testPiece = new Piece(piece.color1, piece.color2);
    testPiece.row = piece.row;
    testPiece.col = piece.col;
    testPiece.rotation = rotation;

    // Column movement
    const dc = targetCol - testPiece.col;
    const dir = dc > 0 ? 'right' : 'left';
    for (let i = 0; i < Math.abs(dc); i++) actions.push(dir);

    return actions;
  }

  _evaluatePlacement(piece, targetCol, rotation) {
    // Simulate the board after placement
    const testBoard = this.game.board.grid.map(row => [...row]);
    const testPiece = new Piece(piece.color1, piece.color2);
    testPiece.col = targetCol;
    testPiece.row = piece.row;
    testPiece.rotation = rotation;

    // Drop piece to ground
    while (true) {
      const nextRow = testPiece.row + 1;
      const positions = (() => {
        const tp = { row: nextRow, col: testPiece.col, rotation: testPiece.rotation, getPositions: Piece.prototype.getPositions };
        return tp.getPositions();
      })();
      let blocked = false;
      for (const [r, c] of positions) {
        if (c < 0 || c >= COLS || r >= ROWS || (r >= 0 && testBoard[r][c] !== 0)) {
          blocked = true; break;
        }
      }
      if (blocked) break;
      testPiece.row = nextRow;
    }

    // Place
    const positions = testPiece.getPositions();
    const colors = testPiece.getColors();
    for (let i = 0; i < positions.length; i++) {
      const [r, c] = positions[i];
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) testBoard[r][c] = colors[i].id;
    }

    // Score the board state
    return this._scoreBoard(testBoard);
  }

  _scoreBoard(grid) {
    let score = 0;

    // Reward low height (prefer not stacking high)
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (grid[r][c] !== 0) {
          score -= (ROWS - r) * 2; // penalize height
          break;
        }
      }
    }

    // Reward groups close to 4
    const tempBoard = { grid, findGroups: Board.prototype.findGroups };
    const groups = tempBoard.findGroups();
    for (const group of groups) {
      if (group.cells.length >= 4) score += 100; // immediate pop
      else score += group.cells.length * group.cells.length * 3;
    }

    // Penalize garbage (gray cells) in high positions
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] === GARBAGE.id) score -= (ROWS - r) * 3;
      }
    }

    return score;
  }

  _executeAction(action) {
    switch (action) {
      case 'left': this.game.moveLeft(); break;
      case 'right': this.game.moveRight(); break;
      case 'rotateCW': this.game.rotateCW(); break;
      case 'rotateCCW': this.game.rotateCCW(); break;
      case 'drop': this.game.hardDrop(); break;
    }
  }
}

// ============================================================
// MAIN GAME CONTROLLER
// ============================================================
class PuyoPuyoGame {
  constructor() {
    this.audio = new AudioEngine();
    this.mode = null; // 'endless' or 'vs'
    this.difficulty = 'EASY';
    this.playerGame = null;
    this.enemyGame = null;
    this.cpuAI = null;
    this.animFrame = null;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;

    // DOM elements
    this.screens = {
      title: document.getElementById('titleScreen'),
      howToPlay: document.getElementById('howToPlayScreen'),
      vsSetup: document.getElementById('vsSetupScreen'),
      game: document.getElementById('gameScreen'),
      gameOver: document.getElementById('gameOverScreen'),
    };
    this.pauseOverlay = document.getElementById('pauseOverlay');

    this._bindUI();
    this._updateHighScore();
  }

  _bindUI() {
    // Title buttons
    document.getElementById('btnEndless').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._startGame('endless');
    });
    document.getElementById('btnVsCPU').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._showScreen('vsSetup');
    });
    document.getElementById('btnHowToPlay').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._showScreen('howToPlay');
    });
    document.getElementById('btnBackFromHelp').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._showScreen('title');
    });

    // VS Setup
    const diffBtns = ['diffEasy', 'diffMedium', 'diffHard'];
    diffBtns.forEach(id => {
      document.getElementById(id).addEventListener('click', (e) => {
        this.audio.playMenuSelect();
        diffBtns.forEach(bid => document.getElementById(bid).classList.remove('selected'));
        e.target.classList.add('selected');
        this.difficulty = id === 'diffEasy' ? 'EASY' : id === 'diffMedium' ? 'MEDIUM' : 'HARD';
      });
    });
    document.getElementById('btnStartVS').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._startGame('vs');
    });
    document.getElementById('btnBackFromVS').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._showScreen('title');
    });

    // Pause
    document.getElementById('btnResume').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._unpause();
    });
    document.getElementById('btnQuitToMenu').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._quitToMenu();
    });

    // Game over
    document.getElementById('btnPlayAgain').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._startGame(this.mode);
    });
    document.getElementById('btnMainMenu').addEventListener('click', () => {
      this.audio.playMenuSelect();
      this._quitToMenu();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => this._handleKey(e));
  }

  _handleKey(e) {
    if (this.screens.game.classList.contains('active')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.paused) this._unpause();
        else this._pause();
        return;
      }
      if (this.paused) return;
      if (!this.playerGame || this.playerGame.board.gameOver) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (this.playerGame.moveLeft()) this.audio.playMove();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (this.playerGame.moveRight()) this.audio.playMove();
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.playerGame.softDrop();
          break;
        case 'ArrowUp':
        case ' ':
          e.preventDefault();
          if (this.playerGame.hardDrop()) this.audio.playLand();
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          if (this.playerGame.rotateCCW()) this.audio.playRotate();
          break;
        case 'x':
        case 'X':
          e.preventDefault();
          if (this.playerGame.rotateCW()) this.audio.playRotate();
          break;
      }
    }
  }

  _showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.remove('active'));
    this.screens[name].classList.add('active');
  }

  _updateHighScore() {
    const hs = localStorage.getItem('puyoHighScore') || 0;
    document.getElementById('titleHighScore').textContent = hs;
    document.getElementById('playerBest').textContent = hs;
  }

  _startGame(mode) {
    this.mode = mode;

    // Stop previous game
    if (this.animFrame) cancelAnimationFrame(this.animFrame);

    // Setup canvas sizes
    const isVS = mode === 'vs';
    const playerCanvas = document.getElementById('playerCanvas');
    const enemyCanvas = document.getElementById('enemyCanvas');

    // Show/hide VS elements
    document.getElementById('centerPanel').style.display = isVS ? 'flex' : 'none';
    document.getElementById('enemyBoardPanel').style.display = isVS ? 'flex' : 'none';
    document.getElementById('enemySidePanel').style.display = isVS ? 'flex' : 'none';
    document.getElementById('difficultyDisplay').textContent = this.difficulty;

    // Create player game
    const playerNextCanvas = document.getElementById('playerNextCanvas');
    this.playerGame = new GameInstance(playerCanvas, playerNextCanvas, true, this.difficulty);

    // VS setup
    if (isVS) {
      const enemyNextCanvas = document.getElementById('enemyNextCanvas');
      this.enemyGame = new GameInstance(enemyCanvas, enemyNextCanvas, false, this.difficulty);
      this.cpuAI = new CpuAI(this.enemyGame, this.difficulty);

      // Cross-garbage callbacks
      this.playerGame.onSendGarbage = (amount) => {
        if (this.enemyGame) this.enemyGame.receiveGarbage(amount);
      };
      this.enemyGame.onSendGarbage = (amount) => {
        if (this.playerGame) this.playerGame.receiveGarbage(amount);
      };

      // Chain callbacks
      this.playerGame.onChain = (n) => {
        this.audio.playChain(n);
        this._showChainPopup('player', n);
      };
      this.enemyGame.onChain = (n) => {
        if (n >= 2) this.audio.playPop(n);
        this._showChainPopup('enemy', n);
      };

      // Game over callbacks
      this.playerGame.onGameOver = () => this._handleGameOver('player');
      this.enemyGame.onGameOver = () => this._handleGameOver('enemy');
    } else {
      // Endless
      this.enemyGame = null;
      this.cpuAI = null;
      this.playerGame.onSendGarbage = null;
      this.playerGame.onChain = (n) => {
        this.audio.playChain(n);
        this._showChainPopup('player', n);
      };
      this.playerGame.onGameOver = () => this._handleGameOver('player');
    }

    this._showScreen('game');
    this.paused = false;
    this.pauseOverlay.classList.remove('active');
    this.running = true;
    this.lastTime = performance.now();
    this.audio.startBGM();

    this._gameLoop(this.lastTime);
  }

  _gameLoop(timestamp) {
    if (!this.running) return;
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
    this.lastTime = timestamp;

    if (!this.paused) {
      this.playerGame.update(dt);
      if (this.enemyGame) {
        this.enemyGame.update(dt);
        this.cpuAI.update(dt);
      }

      // Render
      this.playerGame.render(document.getElementById('playerNextCanvas'));
      if (this.enemyGame) {
        this.enemyGame.render(document.getElementById('enemyNextCanvas'));
      }

      // Update HUD
      this._updateHUD();
    }

    this.animFrame = requestAnimationFrame((t) => this._gameLoop(t));
  }

  _updateHUD() {
    const pg = this.playerGame;
    document.getElementById('playerScore').textContent = pg.board.score.toLocaleString();
    document.getElementById('playerLevel').textContent = pg.board.level;

    // Garbage indicators
    this._updateGarbageIndicator('playerGarbageIndicator', 'playerGarbageCount', pg.incomingGarbage);

    // All clear
    if (pg.board.allClearPending) {
      pg.board.allClearPending = false;
      this.audio.playAllClear();
      this._showAllClear('player');
    }

    if (this.enemyGame) {
      const eg = this.enemyGame;
      document.getElementById('enemyScore').textContent = eg.board.score.toLocaleString();
      this._updateGarbageIndicator('enemyGarbageIndicator', 'enemyGarbageCount', eg.incomingGarbage);

      if (eg.board.allClearPending) {
        eg.board.allClearPending = false;
      }
    }
  }

  _updateGarbageIndicator(indicatorId, countId, amount) {
    const indicator = document.getElementById(indicatorId);
    const countEl = document.getElementById(countId);
    if (!indicator) return;

    indicator.innerHTML = '';
    const display = Math.min(amount, 20);
    for (let i = 0; i < display; i++) {
      const icon = document.createElement('div');
      icon.className = 'garbage-icon';
      indicator.appendChild(icon);
    }
    if (countEl) countEl.textContent = amount;
  }

  _showChainPopup(who, chainNum) {
    const frame = who === 'player' ?
      document.getElementById('playerBoardFrame') :
      document.getElementById('enemyBoardFrame');
    if (!frame) return;

    // Remove old popup
    const old = frame.querySelector('.chain-popup');
    if (old) old.remove();

    const popup = document.createElement('div');
    popup.className = 'chain-popup';
    popup.innerHTML = `
      <div class="chain-popup-number">${chainNum}</div>
      <div class="chain-popup-text">CHAIN!</div>
    `;
    frame.appendChild(popup);

    // Screen shake
    if (chainNum >= 2) {
      const shakeClass = chainNum >= 4 ? 'shake-strong' : chainNum >= 3 ? 'shake-medium' : 'shake-weak';
      frame.classList.add(shakeClass);
      setTimeout(() => frame.classList.remove(shakeClass), 500);
    }

    setTimeout(() => {
      if (popup.parentNode) popup.remove();
    }, 1500);
  }

  _showAllClear(who) {
    const frame = who === 'player' ?
      document.getElementById('playerBoardFrame') :
      document.getElementById('enemyBoardFrame');
    if (!frame) return;

    const overlay = document.createElement('div');
    overlay.className = 'all-clear-overlay';
    overlay.innerHTML = '<div class="all-clear-text">✨ ALL CLEAR! ✨</div>';
    frame.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 2000);
  }

  _handleGameOver(who) {
    this.running = false;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.audio.stopBGM();

    const isVS = this.mode === 'vs';
    let playerWon = false;

    if (isVS) {
      playerWon = who === 'enemy'; // enemy topped out = player wins
      if (playerWon) {
        this.audio.playVictory();
      } else {
        this.audio.playGameOver();
      }
    } else {
      this.audio.playGameOver();
    }

    // Check high score
    const score = this.playerGame.board.score;
    const prevHigh = parseInt(localStorage.getItem('puyoHighScore') || '0');
    const isNewHigh = score > prevHigh;
    if (isNewHigh) {
      localStorage.setItem('puyoHighScore', score);
    }

    // Show game over screen
    setTimeout(() => {
      const title = document.getElementById('gameOverTitle');
      if (isVS) {
        title.textContent = playerWon ? '🏆 VICTORY!' : '💀 DEFEAT!';
        title.className = 'game-over-title ' + (playerWon ? 'win' : 'lose');
      } else {
        title.textContent = '💀 GAME OVER';
        title.className = 'game-over-title lose';
      }
      document.getElementById('finalScore').textContent = score.toLocaleString();
      document.getElementById('newHighScoreBadge').style.display = isNewHigh ? 'block' : 'none';
      this._showScreen('gameOver');
      this._updateHighScore();
    }, 800);
  }

  _pause() {
    this.paused = true;
    this.pauseOverlay.classList.add('active');
    this.audio.stopBGM();
  }

  _unpause() {
    this.paused = false;
    this.pauseOverlay.classList.remove('active');
    this.lastTime = performance.now();
    this.audio.startBGM();
  }

  _quitToMenu() {
    this.running = false;
    this.paused = false;
    this.pauseOverlay.classList.remove('active');
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.audio.stopBGM();
    this._showScreen('title');
    this._updateHighScore();
  }
}

// ============================================================
// BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  // Resize canvases based on viewport
  const resizeCanvases = () => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Target: board height = 85% of viewport height
    const targetH = Math.floor(vh * 0.82);
    const targetCellSize = Math.floor(targetH / VISIBLE_ROWS);
    // Clamp cell size
    const cellSize = Math.max(20, Math.min(42, targetCellSize));
    const boardW = COLS * cellSize;
    const boardH = VISIBLE_ROWS * cellSize;

    // Update CSS variable for other uses
    document.documentElement.style.setProperty('--cell-size', cellSize + 'px');
    document.documentElement.style.setProperty('--board-w', boardW + 'px');
    document.documentElement.style.setProperty('--board-h', boardH + 'px');
  };

  window.addEventListener('resize', resizeCanvases);
  resizeCanvases();

  const game = new PuyoPuyoGame();
  window.puyoGame = game; // for debugging
});
