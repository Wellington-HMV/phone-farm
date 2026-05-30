// Device source falso — usado quando não há adb / nenhum device plugado.
// Mantém estado interno e muta de leve a cada poll p/ exercitar o WS ao vivo.

const APPS = ["Home", "Chat", "Browser", "Maps", "Player", "Settings"];
const MODELS = ["Pixel 8", "Galaxy S23", "redroid:13", "OnePlus 11", "Xiaomi 13", "redroid:12"];
const OSES = ["Android 14", "Android 13", "Android 12"];
const STATUS = ["online", "online", "online", "booting", "offline"];

function seed(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `dev-${String(i + 1).padStart(2, "0")}`,
    name: `phone-${String(i + 1).padStart(2, "0")}`,
    model: MODELS[i % MODELS.length],
    os: OSES[i % OSES.length],
    kind: i % 2 === 0 ? "virtual" : "real",
    status: STATUS[i % STATUS.length],
    battery: 35 + ((i * 13) % 64),
    ip: `10.0.0.${20 + i}`,
    port: 5555 + i,
    app: APPS[i % APPS.length],
    fps: 30 + ((i * 7) % 30),
  }));
}

export function createMockSource(n = 12) {
  const devices = seed(n);
  let tick = 0;

  return {
    kind: "mock",

    async list() {
      tick++;
      // batería desce devagar; um booting vira online após alguns ticks
      for (const d of devices) {
        if (d.status === "online" && tick % 3 === 0) d.battery = Math.max(2, d.battery - 1);
        if (d.status === "booting" && tick % 4 === 0) d.status = "online";
      }
      return devices.map((d) => ({ ...d }));
    },

    async screenshot() {
      return null; // mock não tem frame real
    },

    async input() {
      return { ok: true, mock: true };
    },

    async tap() {
      return { ok: true, mock: true };
    },

    async swipe() {
      return { ok: true, mock: true };
    },

    async text() {
      return { ok: true, mock: true };
    },

    async openUrl() {
      return { ok: true, mock: true };
    },

    async rotate() {
      return { ok: true, mock: true };
    },

    async install() {
      return { ok: false, error: "install indisponível no mock" };
    },

    async record() {
      return { ok: false, error: "record indisponível no mock" };
    },

    async provision() {
      const i = devices.length;
      const d = {
        id: `dev-${String(i + 1).padStart(2, "0")}`,
        name: `phone-${String(i + 1).padStart(2, "0")}`,
        model: "redroid:13",
        os: "Android 14",
        kind: "virtual",
        status: "booting",
        battery: 100,
        ip: `10.0.0.${20 + i}`,
        port: 5555 + i,
        app: "Home",
        fps: 60,
      };
      devices.push(d);
      return { ...d };
    },
  };
}
