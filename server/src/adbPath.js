// Caminho do adb: ADB_PATH > SDK (ANDROID_HOME/ANDROID_SDK_ROOT/padrão do SO) > PATH.
// Sem isso, uma máquina com SDK instalado mas fora do PATH caía em modo mock.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isWin = process.platform === "win32";

export function sdkRoot() {
  const env = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (env) return env;
  const guess = isWin
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Android", "Sdk")
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Android", "sdk")
      : path.join(os.homedir(), "Android", "Sdk");
  return fs.existsSync(guess) ? guess : "";
}

export function adbPath() {
  if (process.env.ADB_PATH) return process.env.ADB_PATH;
  const sdk = sdkRoot();
  const p = sdk ? path.join(sdk, "platform-tools", isWin ? "adb.exe" : "adb") : "";
  return p && fs.existsSync(p) ? p : "adb";
}
