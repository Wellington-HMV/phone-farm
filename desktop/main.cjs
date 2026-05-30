// Electron main: trial gate → sobe o backend (front+API+WS) e abre a janela nele.

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const http = require("node:http");
const trial = require("./trial.cjs");

const PORT = process.env.PF_PORT || 4317;
let serverProc = null;
let win = null;

const dataDir = () => app.getPath("userData");
function root() {
  return app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
}

function startServer() {
  if (serverProc) return;
  const entry = path.join(root(), "server", "src", "index.js");
  serverProc = spawn(process.execPath, [entry], {
    cwd: root(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PORT: String(PORT) },
    stdio: "inherit",
  });
  serverProc.on("exit", (code) => { serverProc = null; console.log("[server] saiu:", code); });
}
function stopServer() { try { serverProc?.kill(); } catch {} serverProc = null; }

function waitHealth(cb, tries = 0) {
  const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => { res.resume(); cb(true); });
  req.on("error", () => (tries >= 80 ? cb(false) : setTimeout(() => waitHealth(cb, tries + 1), 500)));
}

function loadApp() {
  const st = trial.status(dataDir());
  startServer();
  win.setTitle(st.state === "trial" ? `Phone Farm — avaliação: ${st.daysLeft} dia(s)` : "Phone Farm");
  win.loadURL(`data:text/html,<body style="background:%23020617;color:%2364748b;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">🌾 iniciando Phone Farm…</body>`);
  waitHealth((ok) => {
    if (ok) win.loadURL(`http://127.0.0.1:${PORT}/`);
    else win.loadURL(`data:text/html,<body style="background:%23020617;color:%23f87171;font-family:sans-serif;padding:40px">Falha ao iniciar o backend. Verifique o Android SDK / Node.</body>`);
  });
}

function route() {
  const st = trial.status(dataDir());
  if (st.state === "expired") win.loadFile(path.join(__dirname, "gate.html"));
  else loadApp();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    backgroundColor: "#020617",
    title: "Phone Farm",
    icon: path.join(__dirname, "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  route();
}

// IPC do trial
ipcMain.handle("trial:status", () => trial.status(dataDir()));
ipcMain.handle("trial:activate", (_e, key) => {
  const r = trial.activate(dataDir(), key);
  if (r.ok) loadApp(); // ativou → entra no app
  return r;
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { stopServer(); app.quit(); });
app.on("before-quit", stopServer);
