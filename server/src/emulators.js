// Emulator Manager — sobe/derruba emuladores Android (AVD) locais como processos.
// Cada AVD vira uma instância na porta 555X e aparece no `adb devices` como emulator-555X.

import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const execP = promisify(execFile);

const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
const isWin = process.platform === "win32";
const EMULATOR = SDK ? join(SDK, "emulator", isWin ? "emulator.exe" : "emulator") : "emulator";
const ADB = SDK ? join(SDK, "platform-tools", isWin ? "adb.exe" : "adb") : "adb";
const AVDMANAGER = SDK
  ? join(SDK, "cmdline-tools", "latest", "bin", isWin ? "avdmanager.bat" : "avdmanager")
  : "avdmanager";

// Pacote de system-image usado p/ criar AVDs novos (detectado em sdkAvailable()).
let DEFAULT_PKG = "system-images;android-35;google_apis_playstore;x86_64";
let DEFAULT_DEVICE = "pixel_7";

// Perfis de device oferecidos no provisionamento (ids do avdmanager).
export const DEVICE_PROFILES = [
  { id: "pixel_7", label: "Pixel 7" },
  { id: "pixel_6", label: "Pixel 6" },
  { id: "pixel_5", label: "Pixel 5" },
  { id: "pixel_4", label: "Pixel 4" },
  { id: "pixel_tablet", label: "Pixel Tablet" },
  { id: "Nexus 5", label: "Nexus 5" },
];

const API_TO_VER = { 36: "16", 35: "15", 34: "14", 33: "13", 32: "12L", 31: "12", 30: "11", 29: "10" };

export function sdkAvailable() {
  return Boolean(SDK) && existsSync(EMULATOR);
}

/** system-images instaladas no SDK → opções p/ criar AVD. */
export function listImages() {
  const root = SDK ? join(SDK, "system-images") : "";
  if (!root || !existsSync(root)) return [];
  const out = [];
  for (const plat of safeDirs(root)) {
    const api = Number((plat.match(/android-(\d+)/) || [])[1]) || 0;
    for (const tag of safeDirs(join(root, plat))) {
      for (const abi of safeDirs(join(root, plat, tag))) {
        out.push({
          pkg: `system-images;${plat};${tag};${abi}`,
          api,
          tag,
          abi,
          label: `Android ${API_TO_VER[api] || "?"} · ${tag} · ${abi}`,
        });
      }
    }
  }
  return out.sort((a, b) => b.api - a.api);
}

function safeDirs(p) {
  try {
    return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

/** Porta par livre p/ novo emulador (5554..5682), evitando as já em uso. */
function freePort(usedSet) {
  for (let p = 5554; p <= 5682; p += 2) if (!usedSet.has(p)) return p;
  throw new Error("sem portas de emulador livres");
}

/** Portas de emuladores já presentes no adb (emulator-NNNN), inclui os externos. */
async function busyAdbPorts() {
  try {
    const { stdout } = await execP(ADB, ["devices"], { timeout: 5000 });
    const ports = new Set();
    for (const line of stdout.split("\n")) {
      const m = line.match(/^emulator-(\d+)\b/);
      if (m) ports.add(Number(m[1]));
    }
    return ports;
  } catch {
    return new Set();
  }
}

export function createEmulatorManager() {
  const running = new Map(); // avdName -> { proc, port, serial, startedAt }
  const nameCache = new Map(); // serial -> nome do AVD (não muda; cacheado)

  async function listAvds() {
    try {
      const { stdout } = await execP(EMULATOR, ["-list-avds"], { timeout: 8000 });
      return stdout.split("\n").map((s) => s.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async function start(name) {
    if (running.has(name)) return running.get(name);
    const used = new Set([...running.values()].map((r) => r.port));
    for (const p of await busyAdbPorts()) used.add(p);
    const port = freePort(used);
    const serial = `emulator-${port}`;
    const args = [
      "-avd", name,
      "-port", String(port),
      "-no-window",
      "-no-boot-anim",
      "-no-snapshot",
      "-no-audio",
      "-gpu", "swiftshader_indirect",
    ];
    const proc = spawn(EMULATOR, args, { detached: false, stdio: "ignore", windowsHide: true });
    const entry = { proc, port, serial, startedAt: Date.now(), name };
    running.set(name, entry);
    proc.on("exit", () => running.delete(name));
    return { name, port, serial };
  }

  async function stop(name) {
    const e = running.get(name);
    // resolve serial: rastreado por nós, ou externo (via adb emu avd name)
    const serial = e?.serial || (await avdSerials())[name];
    if (!serial) return { ok: false, error: "não está rodando" };
    try {
      await execP(ADB, ["-s", serial, "emu", "kill"], { timeout: 5000 }); // desligamento limpo
    } catch {
      try { e?.proc?.kill(); } catch {}
    }
    running.delete(name);
    return { ok: true };
  }

  function create(rawName, { pkg, device } = {}) {
    // sanitiza nome (sem injeção no shell)
    const name = String(rawName).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
    if (!name) return Promise.reject(new Error("nome inválido"));
    const k = pkg || DEFAULT_PKG;
    const d = device || DEFAULT_DEVICE;

    // avdmanager.bat no Windows precisa de shell; comando em string com pacote entre
    // aspas (os ';' do pacote são separadores no cmd se não escapados). Responde "no"
    // ao prompt "custom hardware profile?" via stdin.
    return new Promise((resolve, reject) => {
      const cmd = `"${AVDMANAGER}" create avd -n "${name}" -k "${k}" -d "${d}" --force`;
      const p = spawn(cmd, { shell: true, windowsHide: true });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.stdin.write("no\n");
      p.stdin.end();
      const to = setTimeout(() => { try { p.kill(); } catch {} reject(new Error("timeout criando AVD")); }, 60000);
      p.on("error", (e) => { clearTimeout(to); reject(e); });
      p.on("exit", (code) => {
        clearTimeout(to);
        if (code === 0) resolve({ ok: true, name });
        else reject(new Error(err.trim().split("\n").pop() || `avdmanager saiu com código ${code}`));
      });
    });
  }

  function runningList() {
    return [...running.values()].map(({ name, port, serial, startedAt }) => ({
      name, port, serial, startedAt,
    }));
  }

  /** Mapa nome-do-AVD -> serial p/ TODOS emuladores no adb (inclui externos). */
  async function avdSerials() {
    const map = {};
    let serials = [];
    try {
      const { stdout } = await execP(ADB, ["devices"], { timeout: 5000 });
      serials = stdout.split("\n").map((l) => l.match(/^(emulator-\d+)\b/)?.[1]).filter(Boolean);
    } catch {
      return map;
    }
    await Promise.all(
      serials.map(async (serial) => {
        const name = await nameOfSerial(serial);
        if (name) map[name] = serial;
      })
    );
    return map;
  }

  /** Nome do AVD p/ um serial (cacheado — não muda em runtime). */
  async function nameOfSerial(serial) {
    if (nameCache.has(serial)) return nameCache.get(serial);
    try {
      const { stdout } = await execP(ADB, ["-s", serial, "emu", "avd", "name"], { timeout: 4000 });
      const name = stdout.split("\n").map((s) => s.trim()).filter((s) => s && s !== "OK")[0];
      if (name) nameCache.set(serial, name);
      return name || null;
    } catch {
      return null;
    }
  }

  /** Garante nomes cacheados p/ os serials dados (só consulta os faltantes). */
  async function ensureNames(serials) {
    await Promise.all(serials.filter((s) => !nameCache.has(s)).map((s) => nameOfSerial(s)));
  }

  function nameOf(serial) {
    return nameCache.get(serial) || null;
  }

  /** Lista de AVDs com running/serial reconciliados (rastreados + externos). */
  async function statusList() {
    const [avds, map] = await Promise.all([listAvds(), avdSerials()]);
    return avds.map((name) => {
      const serial = map[name] || running.get(name)?.serial || null;
      return { name, running: Boolean(serial), serial };
    });
  }

  function isRunning(serial) {
    return [...running.values()].some((r) => r.serial === serial);
  }

  function nameForSerial(serial) {
    for (const r of running.values()) if (r.serial === serial) return r.name;
    return null;
  }

  function stopAll() {
    for (const e of running.values()) { try { e.proc.kill(); } catch {} }
    running.clear();
  }

  return { listAvds, start, stop, create, runningList, statusList, ensureNames, nameOf, isRunning, nameForSerial, stopAll };
}
