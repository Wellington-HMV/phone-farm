// Client da API do backend (REST + WebSocket). Tudo passa pelo proxy do Vite.

export async function fetchDevices() {
  const r = await fetch("/api/devices");
  if (!r.ok) throw new Error(`GET /api/devices ${r.status}`);
  return r.json(); // { source, devices }
}

export async function runSuite(ids) {
  const r = await fetch("/api/suite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  return r.json();
}

export async function deviceAction(id, action) {
  const r = await fetch(`/api/devices/${encodeURIComponent(id)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  return r.json();
}

export async function provision() {
  const r = await fetch("/api/provision", { method: "POST" });
  return r.json();
}

// ---- emuladores (AVD) locais ----
export async function listEmulators() {
  const r = await fetch("/api/emulators");
  return r.json(); // { sdk, avds: [{name, running, serial}] }
}

export async function listImages() {
  const r = await fetch("/api/images");
  return r.json(); // { sdk, images: [{pkg,api,tag,abi,label}], devices: [{id,label}] }
}

export async function startEmulator(name) {
  const r = await fetch(`/api/emulators/${encodeURIComponent(name)}/start`, { method: "POST" });
  return r.json();
}

export async function stopEmulator(name) {
  const r = await fetch(`/api/emulators/${encodeURIComponent(name)}/stop`, { method: "POST" });
  return r.json();
}

export async function createEmulator(name, opts = {}) {
  const r = await fetch("/api/emulators", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, ...opts }), // opts: { pkg, device }
  });
  return r.json();
}

/** URL do screenshot (204 quando não há frame real, ex.: mock). */
export function screenshotUrl(id) {
  return `/api/devices/${encodeURIComponent(id)}/screenshot?t=${Date.now()}`;
}

/** URL do stream MJPEG ao vivo. w = largura alvo (downscale), q = qualidade JPEG. */
export function streamUrl(id, { fps = 3, w = 0, q = 60 } = {}) {
  const p = new URLSearchParams({ fps, q });
  if (w) p.set("w", w);
  return `/api/devices/${encodeURIComponent(id)}/stream?${p}`;
}

export function tap(id, x, y) {
  return fetch(`/api/devices/${encodeURIComponent(id)}/tap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x, y }),
  });
}

export function swipe(id, x1, y1, x2, y2, ms = 200) {
  return fetch(`/api/devices/${encodeURIComponent(id)}/swipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x1, y1, x2, y2, ms }),
  });
}

export function typeText(id, text) {
  return fetch(`/api/devices/${encodeURIComponent(id)}/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export function openUrl(id, url) {
  return fetch(`/api/devices/${encodeURIComponent(id)}/openurl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

export async function scriptHelp() {
  const r = await fetch("/api/script/help");
  return r.json(); // { actions, example }
}

export async function runScript(id, script) {
  const r = await fetch(`/api/devices/${encodeURIComponent(id)}/script`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script }),
  });
  return r.json(); // { ok, total, steps:[{n,raw,ok,error}] }
}

export function rotate(id, deg = 90) {
  return fetch(`/api/devices/${encodeURIComponent(id)}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deg }),
  });
}

/** Sobe um APK 1x → retorna {token, name}. Reutilize o token p/ instalar em N devices. */
export async function uploadApk(file) {
  const fd = new FormData();
  fd.append("apk", file);
  const r = await fetch("/api/uploads", { method: "POST", body: fd });
  return r.json();
}

export async function installApk(id, token) {
  const r = await fetch(`/api/devices/${encodeURIComponent(id)}/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return r.json();
}

/** URL p/ baixar a gravação (dispara screenrecord por `seconds`). */
export function recordUrl(id, seconds = 10) {
  return `/api/devices/${encodeURIComponent(id)}/record?seconds=${seconds}`;
}

/** Abre o WebSocket de estado. onDevices(devices, source) a cada update. */
export function connectWS(onDevices) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "devices") onDevices(msg.devices, msg.source);
    } catch {
      /* ignora frame inválido */
    }
  };
  return ws;
}
