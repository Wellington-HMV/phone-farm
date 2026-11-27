// Ferramenta "ver a tela" do agente (porte de scripts/android/screen.py do
// mobile-agent-testers, MIT).
// Uso: node tools/screen.mjs <NN>
// Salva shots/<NN>.png em METADE do tamanho (mais barato de ler) e imprime cada
// elemento com o centro em pixels REAIS da tela, prontos p/ `act tap X Y`.
// Também imprime crashes do logcat desde a chamada anterior e a checagem de
// acessibilidade quando a tela falha nela.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { adb } from "../adb.js";
import { parseUiXml, visibleElements } from "../uixml.js";
import { checkAndroid } from "../a11y.js";

const nn = String(process.argv[2] || "").replace(/[^\w-]/g, "");
if (!nn) {
  console.log("uso: node tools/screen.mjs <NN>   (ex.: 01, 02…)");
  process.exit(1);
}

const outDir = path.resolve("shots");
fs.mkdirSync(outDir, { recursive: true });

let png = await adb(["exec-out", "screencap", "-p"], { raw: true });
const sig = png.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // foldables imprimem aviso antes
if (sig > 0) png = png.subarray(sig);
if (!png.length) {
  console.log("ERRO: screenshot vazio — device offline?");
  process.exit(1);
}
const meta = await sharp(png).metadata();
const w = meta.width;
const h = meta.height;
await sharp(png).resize(Math.round(w / 2), Math.round(h / 2)).png().toFile(path.join(outDir, `${nn}.png`));
console.log(`screenshot: shots/${nn}.png (tela ${w}x${h}; imagem em metade do tamanho: multiplique posições lidas nela por 2)`);

const dumpPath = "/sdcard/pf_ui.xml";
await adb(["shell", "uiautomator", "dump", dumpPath]);
const xml = await adb(["exec-out", "cat", dumpPath]);
const root = parseUiXml(xml);
for (const el of visibleElements(root)) {
  console.log(`- ${el.kind} "${el.label}" centro=(${el.x},${el.y})`);
}

try {
  const memo = path.resolve(".density");
  if (!fs.existsSync(memo)) {
    const dpi = (await adb(["shell", "wm", "density"])).match(/\d+/g);
    fs.writeFileSync(memo, dpi ? dpi[dpi.length - 1] : "160"); // último = override, se houver
  }
  const check = checkAndroid(root, Number(fs.readFileSync(memo, "utf8")) || 160, w, h);
  if (check) console.log(check);
} catch {
  /* a checagem nunca pode impedir de ver a tela */
}

const crash =
  (await adb(["logcat", "-d", "-b", "crash"])) +
  (await adb(["logcat", "-d", "AndroidRuntime:E", "ReactNativeJS:E", "flutter:E", "Capacitor/Console:E", "*:S"]));
await adb(["logcat", "-c"]);
const lines = crash.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("-----"));
if (lines.length) console.log("ERROS DESDE O ÚLTIMO SCREENSHOT:\n" + lines.slice(-15).join("\n"));
