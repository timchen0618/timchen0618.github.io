// Browser port of path.py + led_display.py: same timing rules, same 64x32 layout.
// Data comes from a relay (path_project/web/worker.js on Cloudflare) because the PATH
// feed has no CORS headers. (The free allorigins.win proxy was tried and was unreliable.)

const RELAY_URL = "https://path-sign.timchen0618.workers.dev";
const DEV_RELAY_URL = "http://localhost:8787";

const STATIONS = {
  NWK: "Newark", HAR: "Harrison", JSQ: "Journal Square", GRV: "Grove Street",
  NEW: "Newport", EXP: "Exchange Place", HOB: "Hoboken", WTC: "World Trade Center",
  CHR: "Christopher St", "09S": "9th St", "14S": "14th St", "23S": "23rd St", "33S": "33rd St",
};
const DEFAULT_STATION = "GRV";

const W = 64, H = 32, ROW = 8, MAX_TRAINS = 4;
const POLL_MS = 15000, DUE_MS = 30000, DROP_MS = 30000, STALE_MS = 90000;

const HEADSIGN_RGB = [200, 200, 200];
const MINUTES_RGB = [255, 150, 0];
const STALE_RGB = [255, 0, 0];
const MESSAGE_RGB = [255, 150, 0];

const params = new URLSearchParams(location.search);
const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
const relay = params.get("relay") || (isLocal ? DEV_RELAY_URL : RELAY_URL);  // ?relay= overrides
let station = (params.get("station") || DEFAULT_STATION).toUpperCase();
if (!STATIONS[station]) station = DEFAULT_STATION;

const state = { trains: [], lastOk: null, error: null, clockOffset: 0 };
const serverNow = () => Date.now() + state.clockOffset;

// ---- data -------------------------------------------------------------------

async function fetchJson(url) {
  const r = await fetch(url, { cache: "no-store" });
  let d;
  try { d = await r.json(); } catch { throw new Error(`HTTP ${r.status}`); }
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function poll() {
  if (!relay) {
    state.error = "relay not configured";
    return;
  }
  const t0 = Date.now();
  try {
    const d = await fetchJson(`${relay}/?station=${encodeURIComponent(station)}`);
    // Correct for the visitor's clock using the relay's time (assume symmetric latency).
    state.clockOffset = d.serverTime - (t0 + Date.now()) / 2;
    state.trains = d.trains;
    state.lastOk = serverNow();
    state.error = null;
  } catch (e) {
    state.error = e.message || String(e); // keep showing the last good data
  }
}

function buildView(now) {
  const trains = state.trains
    .filter(t => t.eta >= now - DROP_MS)
    .slice(0, MAX_TRAINS)
    .map(t => {
      const ms = t.eta - now;
      return { ...t, minutes: ms < DUE_MS ? null : Math.max(1, Math.round(ms / 60000)) };
    });
  const age = state.lastOk === null ? null : now - state.lastOk;
  return {
    trains,
    loaded: state.lastOk !== null,
    stale: age !== null && age > STALE_MS,
    age,
  };
}

// ---- frame (mirrors led_display.draw_frame) --------------------------------------

function abbreviate(headsign) {
  const key = headsign.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
  if (key in ABBREVIATIONS) return ABBREVIATIONS[key];
  return key.toUpperCase().replace("STREET", "ST").replace(" VIA ", "/");
}

const glyph = ch => GLYPHS[ch] || GLYPHS["?"];
const textWidth = text => [...text].reduce((w, ch) => w + glyph(ch)[0].length, 0) + Math.max(0, text.length - 1);

function fit(text, maxWidth) {
  while (text && textWidth(text) > maxWidth) text = text.slice(0, -1);
  return text.trimEnd();
}

function parseColors(lineColor) {
  const colors = (lineColor || "").split(",")
    .map(s => s.trim())
    .filter(s => /^[0-9a-f]{6}$/i.test(s))
    .map(s => [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)));
  return colors.length ? colors : [[128, 128, 128]];
}

function drawFrame(view) {
  const px = Array.from({ length: H }, () => new Array(W).fill(null));
  const set = (x, y, rgb) => { if (x >= 0 && x < W && y >= 0 && y < H) px[y][x] = rgb; };
  const rect = (x, y, w, h, rgb) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, rgb);
  };
  const text = (x, y, s, rgb) => {
    for (const ch of s) {
      const g = glyph(ch);
      g.forEach((row, dy) => [...row].forEach((bit, dx) => { if (bit === "#") set(x + dx, y + dy, rgb); }));
      x += g[0].length + 1;
    }
  };

  if (!view.trains.length) {
    const msg = view.loaded ? "NO TRAINS" : state.error ? "NO DATA" : "LOADING";
    text(Math.floor((W - textWidth(msg)) / 2), 8, msg, MESSAGE_RGB);
    text(Math.floor((W - textWidth(station)) / 2), 18, station, HEADSIGN_RGB);
    return px;
  }

  const minutesRgb = view.stale ? STALE_RGB : MINUTES_RGB;
  view.trains.slice(0, H / ROW).forEach((t, i) => {
    const y = i * ROW;
    const colors = parseColors(t.color);
    if (colors.length === 1) {
      rect(0, y, 2, 7, colors[0]);
    } else { // two-line services (e.g. JSQ-33 via HOB): split the bar
      rect(0, y, 2, 4, colors[0]);
      rect(0, y + 4, 2, 3, colors[1]);
    }
    const mins = t.minutes === null ? "DUE" : `${t.minutes}M`;
    const minsX = W - textWidth(mins);
    text(minsX, y, mins, minutesRgb);
    text(3, y, fit(abbreviate(t.headsign), minsX - 3 - 3), HEADSIGN_RGB);
  });
  return px;
}

// ---- painting ---------------------------------------------------------------

const canvas = document.getElementById("sign");
const ctx = canvas.getContext("2d");
let lastFrame = null;

function paint(px) {
  lastFrame = px;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssW / 2 * dpr);
  const pitch = canvas.width / W;
  const r = pitch * 0.4;

  ctx.fillStyle = "#030303";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Unlit LEDs as faint dots, so it reads as a panel.
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#141414";
  ctx.beginPath();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y][x]) continue;
    ctx.moveTo((x + 0.5) * pitch + r, (y + 0.5) * pitch);
    ctx.arc((x + 0.5) * pitch, (y + 0.5) * pitch, r, 0, Math.PI * 2);
  }
  ctx.fill();

  // Lit LEDs, grouped by color, with a soft glow.
  const groups = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = px[y][x];
    if (!c) continue;
    const key = `rgb(${c[0]},${c[1]},${c[2]})`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([x, y]);
  }
  ctx.shadowBlur = pitch * 0.9;
  for (const [color, dots] of groups) {
    ctx.fillStyle = ctx.shadowColor = color;
    ctx.beginPath();
    for (const [x, y] of dots) {
      ctx.moveTo((x + 0.5) * pitch + r, (y + 0.5) * pitch);
      ctx.arc((x + 0.5) * pitch, (y + 0.5) * pitch, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// ---- page -------------------------------------------------------------------

const statusEl = document.getElementById("status");
const clockEl = document.getElementById("clock");

function tick() {
  const now = serverNow();
  const view = buildView(now);
  paint(drawFrame(view));

  let status;
  if (view.loaded) {
    const secs = Math.round(view.age / 1000);
    status = `Updated ${secs}s ago`;
    if (view.stale) status = `<span class="stale">Stale: last update ${secs}s ago</span>`;
  } else {
    status = state.error ? `<span class="stale">No data (${state.error})</span>` : "Loading…";
  }
  if (view.loaded && state.error) status += ` <span class="stale">· ${state.error}</span>`;
  statusEl.innerHTML = status;
  clockEl.textContent = new Date(now).toLocaleTimeString("en-US", { timeZone: "America/New_York" });
}

function setupStationPicker() {
  const select = document.getElementById("station");
  for (const [code, name] of Object.entries(STATIONS)) select.add(new Option(name, code));
  select.value = station;
  document.getElementById("station-name").textContent = STATIONS[station];
  select.addEventListener("change", () => {
    station = select.value;
    const url = new URL(location.href);
    if (station === DEFAULT_STATION) url.searchParams.delete("station");
    else url.searchParams.set("station", station);
    history.replaceState(null, "", url);
    document.getElementById("station-name").textContent = STATIONS[station];
    state.trains = []; state.lastOk = null; state.error = null;
    tick();
    poll().then(tick);
  });
}

setupStationPicker();
tick();
poll().then(tick);
setInterval(() => poll(), POLL_MS);
setInterval(tick, 1000);
window.addEventListener("resize", () => lastFrame && paint(lastFrame));
