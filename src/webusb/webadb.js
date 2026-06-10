// WebUSB ADB — controla um device Android físico 100% no navegador, SEM instalar
// nada (nem adb, nem agente). Usa @yume-chan/adb (Tango) sobre a WebUSB API.
//
// Só Chromium (Chrome/Edge): WebUSB não existe em Firefox/Safari. Emulador (AVD)
// NÃO entra aqui — é binário local; isto é só device físico via cabo USB.
//
// Os pacotes são pesados e só servem cá → import dinâmico (code-split): o bundle
// principal não paga por eles, e quem nunca clica em "conectar USB" nem baixa.

/** WebUSB disponível neste navegador? */
export function webusbSupported() {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

// keycodes Android usados pelos botões do espelho
export const KEY = { home: 3, back: 4, recents: 187, power: 26, volup: 24, voldown: 25 };

/**
 * Pede ao usuário p/ escolher um device USB e abre a sessão ADB.
 * Dispara o prompt nativo do browser (cessão de uso explícita) e, no device,
 * o diálogo "Permitir depuração USB?" na 1ª vez.
 * @returns {Promise<UsbAdb>}
 */
export async function connectUsbDevice() {
  const [webusb, core, cred] = await Promise.all([
    import("@yume-chan/adb-daemon-webusb"),
    import("@yume-chan/adb"),
    import("@yume-chan/adb-credential-web"),
  ]);

  const manager = webusb.AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) throw new Error("WebUSB não suportado — use Chrome ou Edge no desktop.");

  const device = await manager.requestDevice();
  if (!device) throw new Error("Nenhum device selecionado.");

  const connection = await device.connect();
  const CredentialStore = cred.default; // export default AdbWebCredentialStore
  const transport = await core.AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore: new CredentialStore("PhoneFarm"),
  });

  return new UsbAdb(new core.Adb(transport), device);
}

const r = (n) => Math.round(n);

/** Fina camada sobre o Adb do Tango: espelho (screencap) + input. */
export class UsbAdb {
  constructor(adb, device) {
    this.adb = adb;
    this.device = device;
  }

  get serial() {
    return this.adb.serial;
  }

  /** Nome amigável do device (modelo), com fallback. */
  async model() {
    try {
      return (await this.adb.getProp("ro.product.model")) || this.device.name;
    } catch {
      return this.device.name;
    }
  }

  /** Captura a tela como PNG (bytes → Blob). As dimensões do PNG = resolução real. */
  async screencap() {
    const bytes = await this.adb.subprocess.noneProtocol.spawnWait("screencap -p");
    return new Blob([bytes], { type: "image/png" });
  }

  // input real via adb (coords em pixels do device)
  tap(x, y) {
    return this.adb.subprocess.noneProtocol.spawnWait(`input tap ${r(x)} ${r(y)}`);
  }
  swipe(x1, y1, x2, y2, ms = 200) {
    return this.adb.subprocess.noneProtocol.spawnWait(
      `input swipe ${r(x1)} ${r(y1)} ${r(x2)} ${r(y2)} ${r(ms)}`
    );
  }
  key(code) {
    return this.adb.subprocess.noneProtocol.spawnWait(`input keyevent ${code}`);
  }
  text(s) {
    // `input text` usa %s p/ espaço
    return this.adb.subprocess.noneProtocol.spawnWait(`input text ${String(s).replace(/ /g, "%s")}`);
  }

  close() {
    return this.adb.close();
  }
}
