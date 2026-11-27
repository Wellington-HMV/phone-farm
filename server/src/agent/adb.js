// adb preso a UM device (ANDROID_SERIAL) — usado pelas ferramentas do agente.
// O binário vem de PF_ADB (caminho absoluto passado pelo runner) ou do PATH.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function adbBin() {
  return process.env.PF_ADB || "adb";
}

export function serial() {
  const s = process.env.ANDROID_SERIAL;
  if (!s) throw new Error("ANDROID_SERIAL não definido");
  return s;
}

/** Roda `adb -s <serial> ...args`. raw=true devolve Buffer. Nunca lança. */
export async function adb(args, { raw = false, timeout = 60000 } = {}) {
  try {
    const { stdout } = await exec(adbBin(), ["-s", serial(), ...args], {
      encoding: raw ? "buffer" : "utf8",
      timeout,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch (e) {
    if (raw) return Buffer.alloc(0);
    return String(e.stdout || "");
  }
}

/** Remove acentos e escapa p/ `adb shell input text` (adb não digita acentos). */
export function escapeInputText(s) {
  const ascii = String(s).normalize("NFKD").replace(/[^\x20-\x7e]/g, "");
  return ascii.replace(/([\\'"`$&|;<>()*~#])/g, "\\$1").replace(/ /g, "%s");
}
