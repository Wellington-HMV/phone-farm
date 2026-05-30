// Device source real — fala com devices Android via `adb`.
// Funciona p/ celulares físicos (USB/WiFi) e containers redroid (adb connect ip:port).

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const ADB = process.env.ADB_PATH || "adb";

// Mapa de ação -> keyevent adb
const KEYEVENT = { back: 4, home: 3, recents: 187, power: 26, volup: 24, voldown: 25 };

async function sh(args, opts = {}) {
  return exec(ADB, args, { timeout: 8000, maxBuffer: 16 * 1024 * 1024, ...opts });
}

async function getprop(serial, prop) {
  try {
    const { stdout } = await sh(["-s", serial, "shell", "getprop", prop]);
    return stdout.trim();
  } catch {
    return "";
  }
}

const sizeCache = new Map(); // serial -> {w,h} (resolução real do device)

async function deviceSize(serial) {
  if (sizeCache.has(serial)) return sizeCache.get(serial);
  try {
    const { stdout } = await sh(["-s", serial, "shell", "wm", "size"]);
    const over = stdout.match(/Override size:\s*(\d+)x(\d+)/);
    const phys = stdout.match(/Physical size:\s*(\d+)x(\d+)/);
    const m = over || phys;
    const size = m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1080, h: 1920 };
    sizeCache.set(serial, size);
    return size;
  } catch {
    return { w: 1080, h: 1920 };
  }
}

// coords normalizadas (0..1) -> pixels reais do device
async function toPx(serial, nx, ny) {
  const s = await deviceSize(serial);
  return { x: Math.round(Math.max(0, Math.min(1, nx)) * s.w), y: Math.round(Math.max(0, Math.min(1, ny)) * s.h) };
}

async function battery(serial) {
  try {
    const { stdout } = await sh(["-s", serial, "shell", "dumpsys", "battery"]);
    const m = stdout.match(/level:\s*(\d+)/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** `adb devices -l` -> [{serial, state}] */
async function listSerials() {
  const { stdout } = await sh(["devices", "-l"]);
  return stdout
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    })
    .filter((d) => d.serial);
}

function shape(serial, state, model, release, batt) {
  const isNet = serial.includes(":") || serial.startsWith("emulator");
  const [ip, port] = serial.includes(":") ? serial.split(":") : [null, null];
  const statusMap = { device: "online", offline: "offline", unauthorized: "booting", bootloader: "booting" };
  return {
    id: serial,
    name: serial,
    model: model || serial,
    os: release ? `Android ${release}` : "Android ?",
    kind: isNet ? "virtual" : "real", // heurística: ip:port/emulator => virtual (redroid)
    status: statusMap[state] || "offline",
    battery: batt ?? 100,
    ip: ip || serial,
    port: port ? Number(port) : 5555,
    app: "—",
    fps: 0,
  };
}

export function createAdbSource() {
  return {
    kind: "adb",

    async list() {
      const serials = await listSerials();
      return Promise.all(
        serials.map(async ({ serial, state }) => {
          if (state !== "device") return shape(serial, state);
          const [model, release, batt] = await Promise.all([
            getprop(serial, "ro.product.model"),
            getprop(serial, "ro.build.version.release"),
            battery(serial),
          ]);
          return shape(serial, state, model, release, batt);
        })
      );
    },

    async screenshot(serial) {
      try {
        const { stdout } = await sh(["-s", serial, "exec-out", "screencap", "-p"], {
          encoding: "buffer",
        });
        return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout, "binary");
      } catch {
        return null;
      }
    },

    // helper: nunca lança — falha de adb vira { ok:false } (não derruba o backend)
    async _run(args, extra = {}) {
      try {
        await sh(args, extra);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e.message || "falha adb").split("\n")[0] };
      }
    },

    async input(serial, action) {
      const key = KEYEVENT[action];
      if (!key) return { ok: false, error: `ação desconhecida: ${action}` };
      return this._run(["-s", serial, "shell", "input", "keyevent", String(key)]);
    },

    // recebe coords NORMALIZADAS (0..1); converte p/ pixels reais via wm size
    async tap(serial, nx, ny) {
      const p = await toPx(serial, nx, ny);
      return this._run(["-s", serial, "shell", "input", "tap", String(p.x), String(p.y)]);
    },

    async swipe(serial, nx1, ny1, nx2, ny2, ms = 200) {
      const a = await toPx(serial, nx1, ny1);
      const b = await toPx(serial, nx2, ny2);
      return this._run([
        "-s", serial, "shell", "input", "swipe",
        String(a.x), String(a.y), String(b.x), String(b.y), String(ms),
      ]);
    },

    async text(serial, str) {
      // escapa p/ o shell do device: espaços viram %s; caracteres especiais protegidos
      const safe = String(str).replace(/(["\\$`'&|;<>()])/g, "\\$1").replace(/ /g, "%s");
      return this._run(["-s", serial, "shell", "input", "text", safe]);
    },

    async openUrl(serial, url) {
      return this._run(["-s", serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url]);
    },

    async rotate(serial, deg = 90) {
      // 0/90/180/270 -> user_rotation 0/1/2/3 (desliga auto-rotate antes)
      const r = (Math.round(deg / 90) % 4 + 4) % 4;
      await this._run(["-s", serial, "shell", "settings", "put", "system", "accelerometer_rotation", "0"]);
      const res = await this._run(["-s", serial, "shell", "settings", "put", "system", "user_rotation", String(r)]);
      sizeCache.delete(serial); // w/h podem trocar
      return { ...res, rotation: r };
    },

    async install(serial, apkPath) {
      try {
        const { stdout, stderr } = await sh(["-s", serial, "install", "-r", "-g", apkPath], { timeout: 120000 });
        const out = (stdout + stderr).trim();
        if (/Success/i.test(out)) return { ok: true };
        return { ok: false, error: out.split("\n").pop() || "falha no install" };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    async record(serial, seconds, outPath) {
      const secs = Math.min(180, Math.max(1, seconds || 10));
      const remote = "/sdcard/phonefarm_rec.mp4";
      try {
        // screenrecord bloqueia ~secs; timeout precisa folgar
        await sh(["-s", serial, "shell", "screenrecord", "--time-limit", String(secs), remote], {
          timeout: secs * 1000 + 20000,
        });
        await sh(["-s", serial, "pull", remote, outPath], { timeout: 30000 });
        try { await sh(["-s", serial, "shell", "rm", remote]); } catch {}
        return { ok: true, path: outPath, seconds: secs };
      } catch (e) {
        return { ok: false, error: (e.message || "falha no screenrecord").split("\n")[0] };
      }
    },

    async provision() {
      // Provisionar device real = subir container redroid (Fase 2). Por ora, no-op.
      return { ok: false, error: "provision real entra na Fase 2 (redroid/Docker)" };
    },
  };
}

/** adb está instalado e responde? */
export async function adbAvailable() {
  try {
    await sh(["version"], { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}
