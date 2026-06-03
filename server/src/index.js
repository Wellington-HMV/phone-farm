// Bootstrap do backend: Express (REST) + ws (WebSocket de estado ao vivo).

import express from "express";
import cors from "cors";
import multer from "multer";
import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chooseSource } from "./devices/index.js";
import { DeviceManager } from "./manager.js";
import { createEmulatorManager, sdkAvailable, listImages, DEVICE_PROFILES } from "./emulators.js";
import { startMjpeg } from "./stream.js";
import { shrink } from "./frame.js";
import { SCRIPT_ACTIONS, SCRIPT_EXAMPLE } from "./script.js";
import { listScripts, saveScript, deleteScript } from "./scriptsStore.js";

const PORT = process.env.PORT || 4000;

// Robustez: um comando adb que falha NÃO pode derrubar o backend.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.message || e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e?.message || e));

const source = await chooseSource();
const emulators = sdkAvailable() ? createEmulatorManager() : null;
console.log(`[emulators] SDK ${emulators ? "ok — emuladores locais habilitados" : "ausente — só devices via adb/mock"}`);

const manager = new DeviceManager(source, { pollMs: 2000, emulators });
manager.start();

// derruba emuladores que subimos ao encerrar o backend
function shutdown() {
  emulators?.stopAll();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const app = express();
app.use(cors());
app.use(express.json());

// upload de APK (staging): sobe 1x, instala em N devices
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 600 * 1024 * 1024 } });
const uploads = new Map(); // token -> { path, name, t }
setInterval(() => {
  const now = Date.now();
  for (const [tok, u] of uploads) {
    if (now - u.t > 30 * 60 * 1000) { try { fs.unlinkSync(u.path); } catch {} uploads.delete(tok); }
  }
}, 10 * 60 * 1000).unref();

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, source: source.kind, devices: manager.list().length })
);

app.get("/api/devices", (_req, res) => res.json({ source: source.kind, devices: manager.list() }));

app.post("/api/suite", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : manager.list().map((d) => d.id);
  res.json(manager.runSuite(ids));
});

app.post("/api/devices/:id/action", async (req, res) => {
  const r = await manager.action(req.params.id, req.body?.action);
  res.status(r.ok ? 200 : 400).json(r);
});

app.get("/api/devices/:id/screenshot", async (req, res) => {
  const png = await manager.screenshot(req.params.id);
  if (!png) return res.status(204).end();
  const w = Math.max(0, Number(req.query.w) || 0);
  const q = Math.min(100, Math.max(1, Number(req.query.q) || 70));
  const out = await shrink(png, { w, q });
  res.type(out.type).send(out.buf);
});

// stream MJPEG ao vivo (frames screencap em loop, com downscale opcional via w/q)
app.get("/api/devices/:id/stream", (req, res) => {
  const id = req.params.id;
  const fps = Math.min(10, Math.max(1, Number(req.query.fps) || 3));
  const w = Math.max(0, Number(req.query.w) || 0);
  const q = Math.min(100, Math.max(1, Number(req.query.q) || 60));
  startMjpeg(res, () => manager.screenshot(id), {
    fps,
    transform: (png) => shrink(png, { w, q }),
  });
});

// toque/arraste/texto (controle real via adb input)
app.post("/api/devices/:id/tap", async (req, res) => {
  const { x, y } = req.body || {};
  res.json(await manager.tap(req.params.id, x, y));
});

app.post("/api/devices/:id/swipe", async (req, res) => {
  const { x1, y1, x2, y2, ms } = req.body || {};
  res.json(await manager.swipe(req.params.id, x1, y1, x2, y2, ms));
});

app.post("/api/devices/:id/text", async (req, res) => {
  res.json(await manager.text(req.params.id, req.body?.text || ""));
});

app.post("/api/devices/:id/openurl", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  if (!url) return res.status(400).json({ ok: false, error: "url obrigatória" });
  res.json(await manager.openUrl(req.params.id, url));
});

app.post("/api/devices/:id/rotate", async (req, res) => {
  res.json(await manager.rotate(req.params.id, Number(req.body?.deg) || 90));
});

// roteiro de automação (mini-DSL): executa os passos no device
app.get("/api/script/help", (_req, res) => res.json({ actions: SCRIPT_ACTIONS, example: SCRIPT_EXAMPLE }));
app.post("/api/devices/:id/script", async (req, res) => {
  res.json(await manager.runScript(req.params.id, req.body?.script || ""));
});

// roteiros salvos (fluxos gravados no modal do emulador) — CRUD leve
app.get("/api/scripts", (_req, res) => res.json({ scripts: listScripts() }));
app.post("/api/scripts", (req, res) => {
  const r = saveScript(req.body || {});
  res.status(r.ok ? 200 : 400).json(r);
});
app.delete("/api/scripts/:id", (req, res) => {
  const r = deleteScript(req.params.id);
  res.status(r.ok ? 200 : 404).json(r);
});

// sobe APK 1x -> token; depois instala por token em quantos devices quiser
app.post("/api/uploads", upload.single("apk"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, error: "sem arquivo (campo 'apk')" });
  // adb install exige extensão .apk — multer salva sem extensão; renomeia.
  const apkPath = req.file.path + ".apk";
  try { fs.renameSync(req.file.path, apkPath); } catch { /* mantém original */ }
  const token = crypto.randomUUID();
  uploads.set(token, { path: fs.existsSync(apkPath) ? apkPath : req.file.path, name: req.file.originalname, t: Date.now() });
  res.json({ ok: true, token, name: req.file.originalname });
});

app.post("/api/devices/:id/install", async (req, res) => {
  const u = uploads.get(req.body?.token);
  if (!u) return res.status(400).json({ ok: false, error: "upload não encontrado (faça /api/uploads)" });
  res.json(await manager.install(req.params.id, u.path));
});

// grava a tela por N seg e devolve o mp4 p/ download
app.get("/api/devices/:id/record", async (req, res) => {
  const secs = Number(req.query.seconds) || 10;
  const out = path.join(os.tmpdir(), `pf_${crypto.randomUUID()}.mp4`);
  const r = await manager.record(req.params.id, secs, out);
  if (!r.ok) return res.status(400).json(r);
  res.download(out, `${req.params.id}.mp4`, () => { try { fs.unlinkSync(out); } catch {} });
});

app.post("/api/provision", async (_req, res) => res.json(await manager.provision()));

// ---- emuladores (AVD) locais ----
app.get("/api/emulators", async (_req, res) => {
  if (!emulators) return res.json({ sdk: false, avds: [] });
  res.json({ sdk: true, avds: await emulators.statusList() });
});

// opções p/ provisionar: system-images instaladas + perfis de device
app.get("/api/images", (_req, res) => {
  res.json({ sdk: sdkAvailable(), images: listImages(), devices: DEVICE_PROFILES });
});

app.post("/api/emulators/:name/start", async (req, res) => {
  if (!emulators) return res.status(400).json({ ok: false, error: "SDK ausente" });
  try {
    const r = await emulators.start(req.params.name);
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.post("/api/emulators/:name/stop", async (req, res) => {
  if (!emulators) return res.status(400).json({ ok: false, error: "SDK ausente" });
  res.json(await emulators.stop(req.params.name));
});

app.post("/api/emulators", async (req, res) => {
  if (!emulators) return res.status(400).json({ ok: false, error: "SDK ausente" });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "name obrigatório" });
  try {
    const c = await emulators.create(name, { pkg: req.body?.pkg, device: req.body?.device });
    const r = await emulators.start(c.name); // cria e já sobe
    res.json({ ok: true, ...r });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// --- serve o frontend buildado (dist/) no mesmo processo, se existir ---
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../../dist"); // server/src -> raiz/dist
if (fs.existsSync(path.join(distDir, "index.html"))) {
  app.use(express.static(distDir));
  // fallback SPA: tudo que não for /api volta o index.html
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, "index.html")));
  console.log(`[static] servindo frontend de ${distDir}`);
} else {
  console.log("[static] dist/ não encontrado — rode 'npm run build' (em dev use o vite :5173)");
}

// --- HTTP + WS no mesmo servidor ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

function send(ws, devices) {
  if (ws.readyState === ws.OPEN)
    ws.send(JSON.stringify({ type: "devices", source: source.kind, devices }));
}

wss.on("connection", (ws) => {
  send(ws, manager.list()); // snapshot inicial
});

manager.on("change", (devices) => {
  for (const ws of wss.clients) send(ws, devices);
});

server.listen(PORT, () => {
  console.log(`[phone-farm] backend em http://localhost:${PORT}  (source: ${source.kind})`);
});
