// Cross the Road: a road-crossing game played with one hand. Swipe your hand (up, down, left, right) to aim the arrow;
// pinch (thumb to index finger) to hop that way. Dodge cars, ride logs across rivers, go around trees. Without the
// camera: drag to aim and click to hop, or arrow keys and Space. Rules and look are in ./settings.js. This file is the
// machinery: swipe and pinch detection, the world (rows of grass, road, and river), the chicken, collisions, drawing.

import * as S from "./settings.js";
import { startHands, toStage } from "../shared/hands.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const STEP = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };
const ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };
const WRIST = 0, THUMB_TIP = 4, INDEX_KNUCKLE = 5, INDEX_TIP = 8;

const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const video = document.getElementById("video");
const statusLine = document.getElementById("status");
const cameraButton = document.getElementById("camera");
const ctx = canvas.getContext("2d");

function remember(key, value) { try { localStorage.setItem(key, value); } catch {} }
function recall(key) { try { return localStorage.getItem(key); } catch { return null; } }

// One row of the world. Grass has trees; roads have cars; rivers have logs. Cars and logs slide along at `speed`
// (cells per second, + = right), wrapping around past the edges.
function makeRow(r, cols) {
  if (r < 4) return { type: "grass", trees: new Set() };
  const faster = 1 + Math.floor(r / S.speedUp.every) * S.speedUp.by;
  const roll = Math.random();
  const span = cols + 6;
  if (roll < S.chances.road) {
    const speed = rand(S.traffic.slowest, S.traffic.fastest) * faster * (Math.random() < 0.5 ? -1 : 1);
    const count = 2 + Math.floor(Math.random() * 2);
    const things = Array.from({ length: count }, (_, i) => ({ x: (i / count) * span - 3 + rand(0, 1.5), len: Math.random() < 0.25 ? 2.2 : 1.3, color: pick(S.colors.cars) }));
    return { type: "road", speed, things };
  }
  if (roll < S.chances.road + S.chances.river) {
    const speed = rand(S.traffic.logsSlowest, S.traffic.logsFastest) * faster * (Math.random() < 0.5 ? -1 : 1);
    const count = Math.ceil(span / 5);
    const things = Array.from({ length: count }, (_, i) => ({ x: (i / count) * span - 3, len: Math.round(rand(2, 3.6)) }));
    return { type: "river", speed, things };
  }
  const trees = new Set();
  for (let c = 0; c < cols; c++) if (Math.random() < S.trees) trees.add(c);
  return { type: "grass", trees };
}

let game = null;
let fingers = {}; // id → { x, y, history: [{x, y, t}] (the knuckle), lastSwipe, pinched } in stage fractions
let pointer = null;
let swipeShow = null; // the last swipe, drawn as a fading line
let hopFlash = 0;
let stopCamera = null;

// A fresh game: the chicken in the middle of the bottom row, facing up.
function reset(cols) {
  game = {
    status: "ready", cols, rows: [], aim: "up", score: 0, best: Number(recall("cross-the-road-best") || 0),
    chicken: { x: Math.floor(cols / 2), row: 0, facing: "up", hop: null }, maxRow: 0, cam: -2.5, died: 0, how: "",
  };
}
function rowAt(r) {
  if (r < 0) return { type: "grass", trees: new Set() };
  while (game.rows.length <= r) game.rows.push(makeRow(game.rows.length, game.cols));
  return game.rows[r];
}

// Hop one cell toward `dir` (if a tree or the edge isn't in the way).
function hop(dir) {
  const g = game;
  if (!g) return;
  const now = performance.now() / 1000;
  hopFlash = now;
  if (g.status === "dead") { if (now - g.died > 0.8) reset(g.cols); return; }
  if (g.status === "ready") g.status = "playing";
  const ch = g.chicken;
  if (ch.hop) return;
  ch.facing = dir;
  const [dc, dr] = STEP[dir];
  const toRow = ch.row + dr;
  const toX = rowAt(toRow).type === "river" ? ch.x + dc : Math.round(ch.x + dc);
  if (toX < -0.4 || toX > g.cols - 0.6 || toRow < Math.max(0, g.maxRow - 4)) return;
  const land = rowAt(toRow);
  if (land.type === "grass" && land.trees.has(Math.round(toX))) return;
  ch.hop = { fromX: ch.x, fromRow: ch.row, toX, toRow, t: 0, start: now };
}
const hopAimed = () => hop(game?.aim ?? "up");

// A swipe from (x0, y0) to (x1, y1) in stage fractions: aim that way (and hop, if settings say so).
function swiped(x0, y0, x1, y1, aspect) {
  const dx = (x1 - x0) * aspect, dy = y1 - y0;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  if (game) game.aim = dir;
  swipeShow = { x0, y0, x1, y1, t: performance.now() / 1000 };
  if (S.swipeHops) hop(dir);
}

// Hands from the camera: the knuckle moving quickly is a swipe; a pinch hops.
function onHands(result) {
  const r = stage.getBoundingClientRect();
  const aspect = r.width / r.height;
  const now = performance.now() / 1000;
  const seen = {};
  (result.landmarks || []).forEach((p, id) => {
    const palm = Math.max(Math.hypot(p[WRIST].x - p[INDEX_KNUCKLE].x, p[WRIST].y - p[INDEX_KNUCKLE].y), 1e-6);
    const gap = Math.hypot(p[INDEX_TIP].x - p[THUMB_TIP].x, p[INDEX_TIP].y - p[THUMB_TIP].y) / palm;
    const tp = toStage(p[INDEX_TIP].x, p[INDEX_TIP].y, video, r.width, r.height);
    const kp = toStage(p[INDEX_KNUCKLE].x, p[INDEX_KNUCKLE].y, video, r.width, r.height);
    const k = { x: kp.x / r.width, y: kp.y / r.height };
    const before = fingers[id] ?? { history: [], lastSwipe: 0, pinched: false };
    const f = { x: tp.x / r.width, y: tp.y / r.height, history: [...before.history.filter((h) => now - h.t <= S.swipe.time), { ...k, t: now }], lastSwipe: before.lastSwipe, pinched: before.pinched };
    // A pinch: hop the moment thumb and finger touch; let go before the next one.
    if (!f.pinched && gap < S.pinch.on) { f.pinched = true; hopAimed(); }
    else if (f.pinched && gap > S.pinch.off) f.pinched = false;
    // A swipe: the knuckle moving far enough, fast enough, and not too soon after the last swipe.
    const first = f.history[0];
    if (Math.hypot((k.x - first.x) * aspect, k.y - first.y) >= S.swipe.distance && now - f.lastSwipe >= S.swipe.cooldown) {
      swiped(first.x, first.y, k.x, k.y, aspect);
      f.lastSwipe = now;
      f.history = [];
    }
    seen[id] = f;
  });
  fingers = seen;
}

function fit() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
new ResizeObserver(fit).observe(canvas);
fit();

// The world, the chicken, and the drawing.
let last = performance.now() / 1000;
function draw() {
  const now = performance.now() / 1000;
  const dt = Math.min(0.05, now - last);
  last = now;
  const W = canvas.width, H = canvas.height;
  const cell = H / S.rowsVisible;
  if (!game) reset(Math.max(9, Math.floor(W / cell)));
  const g = game, ch = g.chicken;
  const ox = (W - g.cols * cell) / 2;
  const font = (size, weight = 800) => `${weight} ${Math.round(H * size)}px Inter, system-ui, sans-serif`;

  // Move cars and logs on the rows near the screen.
  const low = Math.floor(g.cam) - 1, high = Math.ceil(g.cam) + S.rowsVisible + 2;
  const span = g.cols + 6;
  for (let r = Math.max(0, low); r <= high; r++) {
    const row = rowAt(r);
    if (!row.things || g.status === "ready") continue;
    for (const t of row.things) {
      t.x += row.speed * dt;
      if (row.speed > 0 && t.x > g.cols + 3) t.x -= span;
      if (row.speed < 0 && t.x + t.len < -3) t.x += span;
    }
  }

  // The chicken: finish a hop, ride a log, or get hit.
  if (g.status === "playing") {
    if (ch.hop) {
      ch.hop.t = (now - ch.hop.start) / S.hopSeconds; // by the clock, so a hop takes the same time on any computer
      if (ch.hop.t >= 1) {
        ch.x = ch.hop.toX;
        ch.row = ch.hop.toRow;
        ch.hop = null;
        if (ch.row > g.maxRow) { g.maxRow = ch.row; g.score = ch.row; }
      }
    }
    const row = rowAt(ch.row);
    const cx = ch.x + 0.5;
    const die = (how) => { g.status = "dead"; g.how = how; g.died = now; if (g.score > g.best) remember("cross-the-road-best", String(g.score)); };
    if (!ch.hop && row.type === "river") {
      const log = row.things.find((t) => cx > t.x + 0.1 && cx < t.x + t.len - 0.1);
      if (log) ch.x += row.speed * dt;
      else die("Splash!");
      if (ch.x < -0.6 || ch.x > g.cols - 0.4) die("Swept away!");
    }
    const hereRow = ch.hop && ch.hop.t > 0.5 ? rowAt(ch.hop.toRow) : row;
    const hereX = (ch.hop ? mix(ch.hop.fromX, ch.hop.toX, ch.hop.t) : ch.x) + 0.5;
    if (g.status === "playing" && hereRow.type === "road" && hereRow.things.some((t) => hereX + 0.3 > t.x && hereX - 0.3 < t.x + t.len)) die("Splat!");
  }

  // The view follows the chicken forward.
  g.cam = mix(g.cam, Math.max(ch.row, g.maxRow - 2) - 2.5, 0.08);
  const rowY = (r) => H - (r - g.cam + 1) * cell; // the top edge of row r on screen

  // The rows.
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  for (let r = low; r <= high; r++) {
    const row = rowAt(r), y = rowY(r);
    if (row.type === "grass") {
      ctx.fillStyle = S.colors.grass[Math.abs(r) % 2];
      ctx.fillRect(0, y, W, cell + 1);
      for (const c of row.trees) {
        const tx = ox + (c + 0.5) * cell, ty = y + cell / 2;
        ctx.fillStyle = S.colors.trunk;
        ctx.fillRect(tx - cell * 0.08, ty, cell * 0.16, cell * 0.3);
        ctx.fillStyle = S.colors.tree;
        ctx.beginPath();
        ctx.arc(tx, ty - cell * 0.05, cell * 0.36, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (row.type === "road") {
      ctx.fillStyle = S.colors.road;
      ctx.fillRect(0, y, W, cell + 1);
      ctx.fillStyle = S.colors.stripe;
      for (let x = 0; x < W; x += cell) ctx.fillRect(x, y + cell - 2, cell * 0.5, 2);
      for (const t of row.things) {
        const x0 = ox + t.x * cell, w = t.len * cell;
        ctx.fillStyle = t.color;
        ctx.beginPath();
        ctx.roundRect(x0, y + cell * 0.15, w, cell * 0.7, cell * 0.15);
        ctx.fill();
        ctx.fillStyle = "rgba(200, 235, 255, 0.85)"; // windshield, at the front
        const front = row.speed > 0 ? x0 + w - cell * 0.38 : x0 + cell * 0.12;
        ctx.fillRect(front, y + cell * 0.25, cell * 0.26, cell * 0.5);
      }
    } else {
      ctx.fillStyle = S.colors.water;
      ctx.fillRect(0, y, W, cell + 1);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      for (let x = (now * 30 * Math.sign(row.speed)) % cell - cell; x < W; x += cell) {
        ctx.beginPath();
        ctx.moveTo(x, y + cell * 0.5);
        ctx.quadraticCurveTo(x + cell * 0.25, y + cell * 0.4, x + cell * 0.5, y + cell * 0.5);
        ctx.stroke();
      }
      for (const t of row.things) {
        ctx.fillStyle = S.colors.log;
        ctx.beginPath();
        ctx.roundRect(ox + t.x * cell, y + cell * 0.18, t.len * cell, cell * 0.64, cell * 0.3);
        ctx.fill();
      }
    }
  }
  // Darken outside the playing field.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, ox, H);
  ctx.fillRect(ox + g.cols * cell, 0, ox, H);

  // Where the next hop would land.
  if (g.status !== "dead" && !ch.hop) {
    const [dc, dr] = STEP[g.aim];
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(ox + (Math.round(ch.x) + dc) * cell + 4, rowY(ch.row + dr) + 4, cell - 8, cell - 8);
    ctx.setLineDash([]);
  }

  // The chicken: round and white, red comb, orange beak, facing where it's going.
  const hx = ch.hop ? mix(ch.hop.fromX, ch.hop.toX, ch.hop.t) : ch.x;
  const hr = ch.hop ? mix(ch.hop.fromRow, ch.hop.toRow, ch.hop.t) : ch.row;
  const px = ox + (hx + 0.5) * cell, py = rowY(hr) + cell / 2;
  const jump = ch.hop ? Math.sin(Math.PI * ch.hop.t) : 0;
  const splash = g.status === "dead" && g.how !== "Splat!";
  if (!splash) {
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.ellipse(px, py + cell * 0.12, cell * 0.3, cell * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(px, py - jump * cell * 0.2);
    ctx.rotate(ANGLE[ch.facing]);
    const flat = g.status === "dead" ? [1.4, 0.35] : [1 + jump * 0.15, 1 + jump * 0.15];
    ctx.scale(flat[0], flat[1]);
    const k = cell * 0.32;
    ctx.fillStyle = "#d9d9d9"; // wings
    ctx.beginPath(); ctx.ellipse(-k * 0.85, k * 0.15, k * 0.3, k * 0.55, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(k * 0.85, k * 0.15, k * 0.3, k * 0.55, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.colors.chicken; // body
    ctx.beginPath(); ctx.ellipse(0, k * 0.2, k * 0.8, k * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = S.colors.beak; // beak, pointing forward
    ctx.beginPath(); ctx.moveTo(-k * 0.22, -k * 0.62); ctx.lineTo(k * 0.22, -k * 0.62); ctx.lineTo(0, -k * 1.05); ctx.closePath(); ctx.fill();
    ctx.fillStyle = S.colors.comb; // comb, on top
    ctx.beginPath(); ctx.ellipse(0, -k * 0.2, k * 0.16, k * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#222"; // eyes
    ctx.beginPath(); ctx.arc(-k * 0.35, -k * 0.45, k * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(k * 0.35, -k * 0.45, k * 0.09, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    const age = now - g.died;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = clamp(1 - age + i * 0.2);
      ctx.beginPath();
      ctx.arc(px, py, cell * (0.15 + age * 0.5 + i * 0.12), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // The last swipe, as a fading line where your hand moved.
  if (swipeShow && now - swipeShow.t < 0.5) {
    ctx.globalAlpha = 1 - (now - swipeShow.t) / 0.5;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = Math.max(4, H / 120);
    ctx.beginPath();
    ctx.moveTo(swipeShow.x0 * W, swipeShow.y0 * H);
    ctx.lineTo(swipeShow.x1 * W, swipeShow.y1 * H);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // The aim arrow (bottom left).
  const ax = W * 0.11, ay = H * 0.76, ar = H * 0.1;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ANGLE[g.aim]);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(0, -ar * 0.7); ctx.lineTo(ar * 0.45, -ar * 0.1); ctx.lineTo(ar * 0.17, -ar * 0.1); ctx.lineTo(ar * 0.17, ar * 0.6);
  ctx.lineTo(-ar * 0.17, ar * 0.6); ctx.lineTo(-ar * 0.17, -ar * 0.1); ctx.lineTo(-ar * 0.45, -ar * 0.1); ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = font(0.025, 700);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("swipe to aim", ax, ay + ar + H * 0.035);

  // The pinch light (bottom right): two dots that close together while you pinch; it flashes when you hop.
  const bx = W * 0.89, by = H * 0.76, br = H * 0.1;
  const hopped = clamp(1 - (now - hopFlash) / 0.25);
  const pinching = Object.values(fingers).some((f) => f.pinched);
  ctx.fillStyle = `rgba(${Math.round(mix(0, 255, hopped))}, ${Math.round(mix(0, 200, hopped))}, ${Math.round(mix(0, 60, hopped))}, ${mix(0.45, 0.9, hopped)})`;
  ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = pinching ? "#ffd23f" : "rgba(255,255,255,0.4)";
    ctx.beginPath(); ctx.arc(bx + side * br * (pinching ? 0.12 : 0.38), by, br * 0.2, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = font(0.025, 700);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("pinch to hop", bx, by + br + H * 0.035);

  // Your fingertips: green normally, yellow while pinching.
  for (const f of Object.values(fingers)) {
    ctx.fillStyle = f.pinched ? "rgba(255, 210, 63, 0.95)" : "rgba(61, 220, 132, 0.95)";
    ctx.beginPath(); ctx.arc(f.x * W, f.y * H, H * 0.015, 0, Math.PI * 2); ctx.fill();
  }

  // Score, and the start and game-over screens.
  ctx.textAlign = "left";
  ctx.fillStyle = "#fff";
  ctx.font = font(0.07, 900);
  ctx.fillText(String(g.score), ox + H * 0.03, H * 0.1);
  ctx.font = font(0.028, 700);
  ctx.fillText(`best ${Math.max(g.best, g.score)}`, ox + H * 0.03, H * 0.15);
  if (g.status !== "playing") {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(W * 0.25, H * 0.2, W * 0.5, H * 0.3);
    ctx.fillStyle = "#fff";
    ctx.font = font(0.08, 900);
    ctx.fillText(g.status === "dead" ? g.how : "Cross the Road", W / 2, H * 0.31);
    ctx.font = font(0.03, 600);
    ctx.fillText(g.status === "dead" ? `${g.score} rows${g.score > g.best ? " · new best!" : ""}` : "Swipe your hand to aim · pinch to hop", W / 2, H * 0.39);
    ctx.fillText(g.status === "dead" ? "Pinch to play again" : "Pinch to start", W / 2, H * 0.45);
  }

  requestAnimationFrame(draw);
}
draw();

// Controls.
cameraButton.addEventListener("click", () => {
  if (stopCamera) {
    stopCamera();
    stopCamera = null;
    fingers = {};
    video.hidden = true;
    statusLine.textContent = "";
    cameraButton.setAttribute("aria-pressed", "false");
    cameraButton.textContent = "Turn on camera";
    return;
  }
  video.hidden = !S.showCamera;
  cameraButton.setAttribute("aria-pressed", "true");
  cameraButton.textContent = "Turn off camera";
  stopCamera = startHands(video, onHands, (message, isError) => {
    statusLine.textContent = message;
    statusLine.classList.toggle("error", !!isError);
  });
});
document.getElementById("fullscreen").addEventListener("click", toggleFullscreen);

// Keyboard: arrows (or WASD) aim, Space or Enter hops. F = full screen.
const keys = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea, button")) return;
  if (keys[e.key]) { e.preventDefault(); if (game) game.aim = keys[e.key]; if (S.swipeHops) hop(keys[e.key]); }
  if (e.key === " " || e.key === "Enter") { e.preventDefault(); hopAimed(); }
  if (e.key === "f" || e.key === "F") toggleFullscreen();
});

// Mouse or touch: a drag aims, a click hops.
const relative = (e) => {
  const r = stage.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, aspect: r.width / r.height };
};
stage.addEventListener("pointerdown", (e) => { pointer = relative(e); });
stage.addEventListener("pointerup", (e) => {
  const p0 = pointer;
  pointer = null;
  if (!p0) return;
  const p = relative(e);
  if (Math.hypot((p.x - p0.x) * p.aspect, p.y - p0.y) > 0.05) swiped(p0.x, p0.y, p.x, p.y, p.aspect);
  else hopAimed();
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.().catch(() => {});
}
