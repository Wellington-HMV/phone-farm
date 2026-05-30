// Dados mockados. Trocar por dados reais do backend (Device Manager / adb) na Fase 3.

export const APPS = ["Home", "Chat", "Browser", "Maps", "Player", "Settings"];
export const MODELS = ["Pixel 8", "Galaxy S23", "redroid:13", "OnePlus 11", "Xiaomi 13", "redroid:12"];
export const OSES = ["Android 14", "Android 13", "Android 12"];

const STATUS = ["online", "online", "online", "booting", "offline"];
const TEST = ["idle", "pass", "idle", "fail", "idle"];

/** Gera N devices fake determinísticos. */
export function makeDevices(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `dev-${String(i + 1).padStart(2, "0")}`,
    name: `phone-${String(i + 1).padStart(2, "0")}`,
    model: MODELS[i % MODELS.length],
    os: OSES[i % OSES.length],
    kind: i % 2 === 0 ? "virtual" : "real",
    status: STATUS[i % STATUS.length],
    test: TEST[i % TEST.length],
    apk: `app v2.${(i % 4) + 1}.0`,
    battery: 35 + ((i * 13) % 64),
    ip: `10.0.0.${20 + i}`,
    port: 5555 + i,
    app: APPS[i % APPS.length],
    fps: 30 + ((i * 7) % 30),
  }));
}

// Maps de apresentação (status do device e status de teste).
export const STATUS_DOT = {
  online: "bg-emerald-400",
  booting: "bg-amber-400",
  offline: "bg-slate-600",
};

export const TEST_BADGE = {
  idle: { t: "—", c: "text-slate-500 bg-slate-800" },
  running: { t: "● run", c: "text-sky-300 bg-sky-500/20" },
  pass: { t: "✓ pass", c: "text-emerald-300 bg-emerald-500/20" },
  fail: { t: "✕ fail", c: "text-rose-300 bg-rose-500/20" },
};
