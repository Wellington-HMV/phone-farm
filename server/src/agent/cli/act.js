// Ferramenta "agir" do agente: só gestos no device do agente (ANDROID_SERIAL).
// Substitui o `adb` livre do mobile-agent-testers — o agente não consegue
// desinstalar, limpar dados nem mexer em outro device.
//
// Uso: node tools/act.mjs <ação> [args]
//   tap X Y | longpress X Y | swipe X1 Y1 X2 Y2 [ms] | scroll up|down
//   back | home | enter | type "texto" | relaunch | wait <ms>
// Coordenadas em pixels REAIS (as que screen.mjs imprime).

import { adb, escapeInputText } from "../adb.js";

const [action, ...args] = process.argv.slice(2);
const n = (i) => {
  const v = Number(args[i]);
  if (!Number.isFinite(v)) throw new Error(`argumento ${i + 1} inválido: ${args[i]}`);
  return String(Math.round(v));
};
const input = (...a) => adb(["shell", "input", ...a]);

async function screenSize() {
  const all = [...(await adb(["shell", "wm", "size"])).matchAll(/(\d+)x(\d+)/g)];
  const m = all[all.length - 1]; // "Override size" vem depois de "Physical size"
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1080, h: 2400 };
}

const ACTIONS = {
  async tap() { await input("tap", n(0), n(1)); },
  async longpress() { await input("swipe", n(0), n(1), n(0), n(1), "900"); },
  async swipe() { await input("swipe", n(0), n(1), n(2), n(3), args[4] ? n(4) : "400"); },
  async scroll() {
    const { w, h } = await screenSize();
    const x = String(Math.round(w / 2));
    const [a, b] = args[0] === "up" ? [0.3, 0.75] : [0.75, 0.3];
    await input("swipe", x, String(Math.round(h * a)), x, String(Math.round(h * b)), "400");
  },
  async back() { await input("keyevent", "KEYCODE_BACK"); },
  async home() { await input("keyevent", "KEYCODE_HOME"); },
  async enter() { await input("keyevent", "KEYCODE_ENTER"); },
  async type() {
    const text = args.join(" ");
    await input("keyevent", "KEYCODE_MOVE_END");
    await input("keyevent", ...Array(40).fill("67")); // limpa o campo (40 backspaces)
    await input("text", escapeInputText(text));
    if (/[^\x20-\x7e]/.test(text)) console.log("aviso: acentos removidos (adb não digita acentos)");
  },
  async relaunch() {
    const app = process.env.APP_ID;
    if (!app) throw new Error("APP_ID não definido");
    await adb(["shell", "am", "force-stop", app]);
    await adb(["shell", "monkey", "-p", app, "-c", "android.intent.category.LAUNCHER", "1"]);
  },
  async wait() { await new Promise((r) => setTimeout(r, Math.min(15000, Number(args[0]) || 1000))); },
};

const fn = ACTIONS[action];
if (!fn) {
  console.log(`ação desconhecida: ${action || "(vazia)"}. Use: ${Object.keys(ACTIONS).join(", ")}`);
  process.exit(1);
}
try {
  await fn();
  console.log(`ok: ${action} — confira no próximo screenshot`);
} catch (e) {
  console.log(`ERRO: ${e.message}`);
  process.exit(1);
}
