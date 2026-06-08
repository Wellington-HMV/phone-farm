// Client da API do backend (REST + WebSocket).
//
// Em build local/desktop, `apiBase()` é vazio → URLs relativas (mesma-origem,
// proxy do Vite em dev). Em build hospedado, aponta p/ o agente local pareado
// e anexa o token (header X-PF-Token nos fetch; ?token= em <img>/download/ws).

import { apiBase, apiToken } from "./config.js";

function apiUrl(path) {
  return apiBase() + path;
}

/** Anexa ?token= numa URL (p/ <img>/download/ws que não mandam header). */
function withToken(u) {
  const t = apiToken();
  if (!t) return u;
  return u + (u.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(t);
}

function authHeaders(extra = {}) {
  const t = apiToken();
  return t ? { ...extra, "X-PF-Token": t } : extra;
}

/** fetch GET → json */
async function getJson(path) {
  const r = await fetch(apiUrl(path), { headers: authHeaders() });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
  return r.json();
}

/** fetch com corpo json (POST/DELETE) → json */
async function sendJson(path, body, method = "POST") {
  const r = await fetch(apiUrl(path), {
    method,
    headers: authHeaders(body !== undefined ? { "Content-Type": "application/json" } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

/** Testa a conexão com o agente (usado no pareamento). */
export async function health() {
  return getJson("/api/health"); // { ok, source, devices }
}

export async function fetchDevices() {
  return getJson("/api/devices"); // { source, devices }
}

export async function runSuite(ids) {
  return sendJson("/api/suite", { ids });
}

export async function deviceAction(id, action) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/action`, { action });
}

export async function provision() {
  return sendJson("/api/provision", undefined);
}

// ---- emuladores (AVD) locais ----
export async function listEmulators() {
  return getJson("/api/emulators"); // { sdk, avds: [{name, running, serial}] }
}

export async function listImages() {
  return getJson("/api/images"); // { sdk, images, devices }
}

export async function startEmulator(name) {
  return sendJson(`/api/emulators/${encodeURIComponent(name)}/start`, undefined);
}

export async function stopEmulator(name) {
  return sendJson(`/api/emulators/${encodeURIComponent(name)}/stop`, undefined);
}

export async function createEmulator(name, opts = {}) {
  return sendJson("/api/emulators", { name, ...opts }); // opts: { pkg, device }
}

/** URL do screenshot (204 quando não há frame real, ex.: mock). */
export function screenshotUrl(id) {
  return withToken(apiUrl(`/api/devices/${encodeURIComponent(id)}/screenshot?t=${Date.now()}`));
}

/** URL do stream MJPEG ao vivo. w = largura alvo (downscale), q = qualidade JPEG. */
export function streamUrl(id, { fps = 3, w = 0, q = 60 } = {}) {
  const p = new URLSearchParams({ fps, q });
  if (w) p.set("w", w);
  return withToken(apiUrl(`/api/devices/${encodeURIComponent(id)}/stream?${p}`));
}

export function tap(id, x, y) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/tap`, { x, y });
}

export function swipe(id, x1, y1, x2, y2, ms = 200) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/swipe`, { x1, y1, x2, y2, ms });
}

export function typeText(id, text) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/text`, { text });
}

export function openUrl(id, url) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/openurl`, { url });
}

export async function scriptHelp() {
  return getJson("/api/script/help"); // { actions, example }
}

export async function runScript(id, script) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/script`, { script });
}

// ---- roteiros salvos (fluxos gravados) ----
export async function listSavedScripts() {
  return getJson("/api/scripts"); // { scripts: [...] }
}

export async function saveScript({ name, text, device } = {}) {
  return sendJson("/api/scripts", { name, text, device });
}

export async function deleteScript(id) {
  return sendJson(`/api/scripts/${encodeURIComponent(id)}`, undefined, "DELETE");
}

export function rotate(id, deg = 90) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/rotate`, { deg });
}

/** Sobe um APK 1x → retorna {token, name}. Reutilize o token p/ instalar em N devices. */
export async function uploadApk(file) {
  const fd = new FormData();
  fd.append("apk", file);
  const r = await fetch(apiUrl("/api/uploads"), { method: "POST", headers: authHeaders(), body: fd });
  return r.json();
}

export async function installApk(id, token) {
  return sendJson(`/api/devices/${encodeURIComponent(id)}/install`, { token });
}

/** URL p/ baixar a gravação (dispara screenrecord por `seconds`). */
export function recordUrl(id, seconds = 10) {
  return withToken(apiUrl(`/api/devices/${encodeURIComponent(id)}/record?seconds=${seconds}`));
}

/** Abre o WebSocket de estado. onDevices(devices, source) a cada update. */
export function connectWS(onDevices) {
  const base = apiBase();
  let wsUrl;
  if (base) {
    wsUrl = base.replace(/^http/, "ws") + "/ws"; // http→ws, https→wss
  } else {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    wsUrl = `${proto}://${location.host}/ws`;
  }
  const ws = new WebSocket(withToken(wsUrl));
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
