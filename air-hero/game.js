// Air Hero: a Guitar Hero–style game played with your fingertips. Notes fall down a highway of lanes over your camera
// picture; have a fingertip over a circle when its note lands and you hit it, playing that note of the melody. The
// keyboard (A S D F G) and clicks work too. Songs are in ./songs.js; rules and look in ./settings.js. This file is the
// machinery: tap detection, the game clock and scoring, the sound (Tone.js, loaded by index.html), and drawing.

import * as S from "./settings.js";
import { songs } from "./songs.js";
import { startHands, toStage } from "../shared/hands.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const mix = (a, b, t) => a + (b - a) * t;
const SEMITONE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const TOP = 0.06; // where the far end of the highway sits

const stage = document.getElementById("stage");
const canvas = document.getElementById("canvas");
const video = document.getElementById("video");
const statusLine = document.getElementById("status");
const songSelect = document.getElementById("song");
const startButton = document.getElementById("start");
const cameraButton = document.getElementById("camera");
const ctx = canvas.getContext("2d");

function remember(key, value) { try { localStorage.setItem(key, value); } catch {} }
function recall(key) { try { return localStorage.getItem(key); } catch { return null; } }

// The target circle of `lane` (of n) on the hit line, in pixels of a W × H stage. Drawing and tapping both use this.
function target(lane, n, W, H) {
  const width = (S.lanes.right - S.lanes.left) * W;
  return { x: W / 2 + (lane - (n - 1) / 2) * (width / n), y: S.hitLine * H, r: (width / n) * 0.34 };
}

// Turn a song from songs.js into timed notes, one lane per distinct pitch (low to high, left to right).
function parseSong(song) {
  const words = song.chart.split(/\s+/).filter((w) => w && w !== "|");
  const beat = 60 / song.bpm;
  const pitches = [];
  const raw = words.map((w, i) => {
    if (w === ".") return null;
    const m = w.match(/^([A-G]#?)(\d)?$/);
    if (!m) return null;
    const pitch = `${m[1]}${m[2] ?? song.octave}`;
    const midi = 12 * (Number(m[2] ?? song.octave) + 1) + SEMITONE[m[1]];
    if (!pitches.some((p) => p.pitch === pitch)) pitches.push({ pitch, midi });
    return { time: i * song.step * beat, pitch };
  }).filter(Boolean);
  pitches.sort((a, b) => a.midi - b.midi);
  const lanes = pitches.map((p) => p.pitch);
  return { name: song.name, beat, lanes, notes: raw.map((n) => ({ ...n, lane: lanes.indexOf(n.pitch) })), end: words.length * song.step * beat };
}

let song = parseSong(songs[0]);
let game = { status: "idle" };
let audio = null; // Tone.js instruments, made on the first click (browsers need one before sound)
let fingers = {}; // id → { x, y, zone } in stage fractions; zone = the lane whose circle it's inside, or null
let flashes = []; // lane → time it was last tapped
let pops = []; // floating "Perfect!" words
let stopCamera = null;

songs.forEach((s, i) => songSelect.add(new Option(s.name, String(i))));
songSelect.addEventListener("change", () => { song = parseSong(songs[Number(songSelect.value)]); setStatus("idle"); });

function setStatus(status) {
  if (status === "idle") game = { status: "idle" };
  startButton.textContent = status === "playing" ? "Stop (Esc)" : "Start (Enter)";
}

async function ensureAudio() {
  if (audio) return audio;
  const Tone = window.Tone;
  await Tone.start();
  const synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.25, sustain: 0.25, release: 0.5 } }).toDestination();
  synth.volume.value = S.volume.notes;
  const kick = new Tone.MembraneSynth().toDestination();
  const snare = new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.12, sustain: 0 } }).toDestination();
  const click = new Tone.Synth({ oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.05 } }).toDestination();
  for (const d of [kick, snare, click]) d.volume.value = S.volume.drums;
  audio = { Tone, synth, kick, snare, click };
  return audio;
}

const pop = (text, lane, color) => pops.push({ text, lane, color, born: performance.now() / 1000 });

// Score a note that was hit `off` seconds away from its beat, and play it.
function judge(note, off) {
  const perfect = off <= S.windows.perfect;
  note.judged = perfect ? "perfect" : "good";
  game.counts[note.judged] += 1;
  game.combo += 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  const mult = Math.min(4, 1 + Math.floor(game.combo / S.comboStep));
  game.score += (perfect ? S.points.perfect : S.points.good) * mult;
  flashes[note.lane] = performance.now() / 1000;
  pop(perfect ? "Perfect!" : "Good", note.lane, perfect ? "#fff6a8" : "#cfe8ff");
  try { audio?.synth.triggerAttackRelease(note.pitch, "8n"); } catch {}
}

// A key press or click in a lane: hit the nearest note there if it's close enough to the beat; otherwise a quiet note.
// (Fingertips work differently: see the clock in the drawing loop.)
function hitLane(lane) {
  const now = performance.now() / 1000;
  if (lane < 0 || lane >= song.lanes.length) return;
  flashes[lane] = now;
  if (game.status === "playing") {
    const songTime = now - game.startAt;
    let best = null;
    for (const n of game.notes) {
      if (n.judged || n.lane !== lane) continue;
      const off = Math.abs(n.time - songTime);
      if (off <= S.windows.good && (!best || off < Math.abs(best.time - songTime))) best = n;
    }
    if (best) { judge(best, Math.abs(best.time - songTime)); return; }
  }
  try { audio?.synth.triggerAttackRelease(song.lanes[lane], "16n", undefined, 10 ** ((S.volume.stray - S.volume.notes) / 20)); } catch {}
}

// Which lane a stage x (0–1) is in, at the hit line.
const laneAt = (x) => Math.floor(((x - S.lanes.left) / (S.lanes.right - S.lanes.left)) * song.lanes.length);

// Fingertips from the camera: each one is either over a circle (its zone) or not. Any note that reaches a circle with
// a fingertip over it is hit (see the clock in the drawing loop). Moving into a circle with no note coming plays its
// note quietly, so you can hear where you are.
function onHands(result) {
  const r = stage.getBoundingClientRect();
  const n = song.lanes.length;
  const seen = {};
  (result.landmarks || []).forEach((p, hand) => {
    for (const f of S.fingers) {
      const id = `${hand}-${f}`;
      const { x: px, y: py } = toStage(p[f].x, p[f].y, video, r.width, r.height);
      let zone = fingers[id]?.zone ?? null;
      if (zone !== null) {
        const c = target(zone, n, r.width, r.height);
        if (Math.hypot(px - c.x, py - c.y) > c.r * S.tap.size * 1.15) zone = null; // left the circle
      }
      if (zone === null) {
        for (let lane = 0; lane < n; lane++) {
          const c = target(lane, n, r.width, r.height);
          if (Math.hypot(px - c.x, py - c.y) < c.r * S.tap.size) {
            zone = lane;
            const t = performance.now() / 1000 - S.tap.latency - (game.startAt ?? 0);
            const coming = game.status === "playing" && game.notes.some((note) => !note.judged && note.lane === lane && Math.abs(note.time - t) <= S.windows.good);
            if (!coming) hitLane(lane);
            break;
          }
        }
      }
      seen[id] = { x: px / r.width, y: py / r.height, zone };
    }
  });
  fingers = seen;
}

async function start() {
  await ensureAudio();
  game = {
    status: "playing", startAt: performance.now() / 1000 + S.countIn * song.beat, nextBeat: -S.countIn,
    notes: song.notes.map((n) => ({ ...n, judged: null })), score: 0, combo: 0, maxCombo: 0, counts: { perfect: 0, good: 0, miss: 0 },
    best: Number(recall(`air-hero-best:${song.name}`) || 0),
  };
  pops = [];
  setStatus("playing");
}
const stop = () => setStatus("idle");

function fit() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
new ResizeObserver(fit).observe(canvas);
fit();

// The game clock and the drawing.
function draw() {
  const now = performance.now() / 1000;
  const W = canvas.width, H = canvas.height, s = song, g = game, n = s.lanes.length;
  const font = (size, weight = 700) => `${weight} ${Math.round(H * size)}px Inter, system-ui, sans-serif`;
  const songTime = g.status === "playing" ? now - g.startAt : 0;

  // The clock: drums on the beat (clicks during the count-in), hits for held fingers, misses, the end of the song.
  if (g.status === "playing") {
    const a = audio;
    while (g.nextBeat * s.beat <= songTime && g.nextBeat * s.beat <= s.end) {
      const k = g.nextBeat;
      g.nextBeat += 1;
      if (!a || songTime - k * s.beat > 0.1) continue; // a late beat (the tab was hidden, say) is skipped, not played
      // Each drum needs a start time later than its last one, and a sound problem must never stop the game.
      const drum = k < 0 ? a.click : k % 2 === 0 ? a.kick : a.snare;
      const at = Math.max(a.Tone.now(), (drum.lastAt ?? 0) + 0.01);
      drum.lastAt = at;
      try {
        if (k < 0) drum.triggerAttackRelease(k === -S.countIn ? "C6" : "G5", "32n", at);
        else if (drum === a.kick) drum.triggerAttackRelease("C1", "8n", at);
        else drum.triggerAttackRelease("16n", at);
      } catch {}
    }
    // Fingertips: a note reaching a circle with a fingertip over it is hit. The camera runs a little behind, so
    // where the finger is now is where it was S.tap.latency ago.
    const held = new Set(Object.values(fingers).map((f) => f.zone));
    const heldTime = songTime - S.tap.latency;
    for (const note of g.notes) {
      if (!note.judged && held.has(note.lane) && heldTime >= note.time - S.windows.perfect / 2 && heldTime - note.time <= S.windows.good) {
        judge(note, Math.abs(heldTime - note.time));
      }
    }
    for (const note of g.notes) {
      if (!note.judged && songTime - note.time > S.windows.good) {
        note.judged = "miss";
        g.counts.miss += 1;
        g.combo = 0;
        pop("Miss", note.lane, "#ff8a8a");
      }
    }
    if (songTime > s.end + 1.2) {
      g.status = "done";
      if (g.score > g.best) remember(`air-hero-best:${s.name}`, String(g.score));
      startButton.textContent = "Start (Enter)";
    }
  }

  // Background: the camera (dimmed) shows through; without it, a dark stage.
  ctx.clearRect(0, 0, W, H);
  if (stopCamera) {
    ctx.fillStyle = `rgba(0,0,0,${S.dimCamera})`;
    ctx.fillRect(0, 0, W, H);
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0c0a1a");
    bg.addColorStop(1, "#1d1433");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // The highway, in perspective: narrow far away (top), full width at the hit line.
  const widthAt = (p) => (S.lanes.right - S.lanes.left) * mix(S.lanes.topWidth, 1, p) * W;
  const yAt = (p) => mix(TOP, S.hitLine, p) * H;
  const laneX = (lane, p) => W / 2 + (lane - (n - 1) / 2) * (widthAt(p) / n);
  const pBottom = (1 - TOP) / (S.hitLine - TOP);
  ctx.fillStyle = "rgba(10, 8, 20, 0.55)";
  ctx.beginPath();
  ctx.moveTo(W / 2 - widthAt(0) / 2, yAt(0));
  ctx.lineTo(W / 2 + widthAt(0) / 2, yAt(0));
  ctx.lineTo(W / 2 + widthAt(pBottom) / 2, H);
  ctx.lineTo(W / 2 - widthAt(pBottom) / 2, H);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= n; i++) {
    const edge = (p) => W / 2 + (i / n - 0.5) * widthAt(p);
    ctx.beginPath();
    ctx.moveTo(edge(0), yAt(0));
    ctx.lineTo(edge(pBottom), H);
    ctx.stroke();
  }

  // The targets on the hit line. Lit up when hit, ringed in white while a fingertip is over one.
  const inside = new Set(Object.values(fingers).map((f) => f.zone));
  for (let lane = 0; lane < n; lane++) {
    const color = S.laneColors[lane % S.laneColors.length];
    const { x, y, r } = target(lane, n, W, H);
    const lit = clamp(1 - (now - (flashes[lane] ?? -9)) / 0.25);
    if (inside.has(lane)) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(2, H / 250);
      ctx.beginPath();
      ctx.arc(x, y, r * S.tap.size, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(3, H / 160);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25 + 0.75 * lit;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + 0.15 * lit), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = font(0.028);
    ctx.textAlign = "center";
    ctx.fillText(`${s.lanes[lane].replace(/\d/, "")}  ${S.keys[lane]?.toUpperCase() ?? ""}`, x, y + r + H * 0.045);
  }

  // The notes, falling.
  if (g.status === "playing") {
    for (const note of g.notes) {
      if (note.judged === "perfect" || note.judged === "good") continue;
      const p = 1 - (note.time - songTime) / S.fallSeconds;
      if (p < 0 || p > pBottom) continue;
      const color = S.laneColors[note.lane % S.laneColors.length];
      const x = laneX(note.lane, p), y = yAt(p), r = (widthAt(p) / n) * 0.3;
      ctx.globalAlpha = note.judged === "miss" ? 0.3 : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.15, r * 0.45, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // "Perfect!" / "Good" / "Miss", floating up from the hit line.
  pops = pops.filter((p) => now - p.born < 0.8);
  for (const p of pops) {
    const age = now - p.born;
    ctx.globalAlpha = 1 - age / 0.8;
    ctx.fillStyle = p.color;
    ctx.font = font(0.04, 800);
    ctx.textAlign = "center";
    ctx.fillText(p.text, laneX(p.lane, 1), yAt(1) - H * (0.08 + 0.12 * age));
  }
  ctx.globalAlpha = 1;

  // Your fingertips: white while over a circle, green otherwise.
  for (const f of Object.values(fingers)) {
    ctx.fillStyle = f.zone === null ? "rgba(61, 220, 132, 0.95)" : "rgba(255, 255, 255, 0.95)";
    ctx.beginPath();
    ctx.arc(f.x * W, f.y * H, H * 0.016, 0, Math.PI * 2);
    ctx.fill();
  }

  // The score, combo, and progress while playing; the title before; the results after.
  ctx.textAlign = "left";
  if (g.status === "playing") {
    const mult = Math.min(4, 1 + Math.floor(g.combo / S.comboStep));
    ctx.fillStyle = "#fff";
    ctx.font = font(0.05, 800);
    ctx.fillText(String(g.score), W * 0.03, H * 0.1);
    ctx.font = font(0.03);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(`combo ${g.combo}${mult > 1 ? ` · ${mult}×` : ""}`, W * 0.03, H * 0.15);
    ctx.fillText(`best ${g.best}`, W * 0.03, H * 0.2);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(W * 0.03, H * 0.23, W * 0.15, H * 0.008);
    ctx.fillStyle = "#fff";
    ctx.fillRect(W * 0.03, H * 0.23, W * 0.15 * clamp(songTime / s.end), H * 0.008);
    if (songTime < 0) {
      ctx.textAlign = "center";
      ctx.font = font(0.16, 900);
      ctx.fillText(String(Math.ceil(-songTime / s.beat)), W / 2, H * 0.45);
    }
  } else {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(W * 0.2, H * 0.12, W * 0.6, H * 0.46);
    ctx.fillStyle = "#fff";
    if (g.status === "done") {
      const total = g.counts.perfect + g.counts.good + g.counts.miss || 1;
      const accuracy = Math.round(((g.counts.perfect + g.counts.good * 0.5) / total) * 100);
      const stars = accuracy >= 95 ? 5 : accuracy >= 85 ? 4 : accuracy >= 70 ? 3 : accuracy >= 50 ? 2 : 1;
      ctx.font = font(0.06, 900);
      ctx.fillText(`${"★".repeat(stars)}${"☆".repeat(5 - stars)}`, W / 2, H * 0.23);
      ctx.font = font(0.075, 900);
      ctx.fillText(String(g.score), W / 2, H * 0.33);
      ctx.font = font(0.03, 600);
      ctx.fillText(`${accuracy}% · ${g.counts.perfect} perfect · ${g.counts.good} good · ${g.counts.miss} missed · best combo ${g.maxCombo}`, W / 2, H * 0.41);
      ctx.fillText(g.score > g.best ? "New best!" : `Best: ${Math.max(g.best, g.score)}`, W / 2, H * 0.47);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("Press Start (Enter) to play again", W / 2, H * 0.53);
    } else {
      ctx.font = font(0.09, 900);
      ctx.fillText("Air Hero", W / 2, H * 0.27);
      ctx.font = font(0.032, 600);
      ctx.fillText(s.name, W / 2, H * 0.35);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText("Have a fingertip over each circle as its note lands", W / 2, H * 0.43);
      ctx.fillText("Press Start (Enter) · tap the lanes to warm up", W / 2, H * 0.5);
    }
  }

  requestAnimationFrame(draw);
}
draw();

// Controls.
startButton.addEventListener("click", () => (game.status === "playing" ? stop() : start()));
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
  video.hidden = false;
  cameraButton.setAttribute("aria-pressed", "true");
  cameraButton.textContent = "Turn off camera";
  stopCamera = startHands(video, onHands, (message, isError) => {
    statusLine.textContent = message;
    statusLine.classList.toggle("error", !!isError);
  });
});
document.getElementById("fullscreen").addEventListener("click", toggleFullscreen);
stage.addEventListener("pointerdown", (e) => {
  const r = stage.getBoundingClientRect();
  const lane = laneAt((e.clientX - r.left) / r.width);
  ensureAudio().then(() => hitLane(lane));
});
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, select, textarea") || e.repeat) return;
  const lane = S.keys.indexOf(e.key.toLowerCase());
  if (lane >= 0) { ensureAudio().then(() => hitLane(lane)); return; }
  if (e.key === "Enter") { e.preventDefault(); start(); }
  if (e.key === "Escape") stop();
  if (e.key === "f" || e.key === "F") toggleFullscreen();
});
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.().catch(() => {});
}
