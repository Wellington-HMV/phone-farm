// DeviceManager — estado central dos devices.
// Faz poll da fonte, mescla status de teste (mantido aqui), e emite "change".

import { EventEmitter } from "node:events";
import { parseScript } from "./script.js";

const delay = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(60000, ms || 0))));

export class DeviceManager extends EventEmitter {
  constructor(source, { pollMs = 2000, emulators = null } = {}) {
    super();
    this.source = source;
    this.emulators = emulators; // EmulatorManager opcional
    this.pollMs = pollMs;
    this.devices = new Map(); // id -> device (com .test)
    this.tests = new Map(); // id -> "idle"|"running"|"pass"|"fail"
    this.timers = [];
  }

  start() {
    this.poll();
    this._iv = setInterval(() => this.poll(), this.pollMs);
  }

  stop() {
    clearInterval(this._iv);
    this.timers.forEach(clearTimeout);
  }

  list() {
    return [...this.devices.values()];
  }

  async poll() {
    try {
      const fresh = await this.source.list();
      const byId = new Map(fresh.map((d) => [d.id, d]));

      // Nome amigável p/ qualquer emulador (inclui os iniciados fora da UI):
      // emulator-5554 -> "Pixel_7". Só consulta serials ainda não cacheados.
      if (this.emulators) {
        const serials = fresh.filter((d) => d.id.startsWith("emulator-")).map((d) => d.id);
        try {
          await this.emulators.ensureNames(serials);
        } catch {
          /* ignora */
        }
        for (const d of fresh) {
          if (d.id.startsWith("emulator-")) {
            const n = this.emulators.nameOf(d.id);
            if (n) d.name = n;
            d.kind = "virtual";
          }
        }
      }

      // Reconcilia emuladores rastreados: enquanto não estão "online", mostra "booting"
      // com o nome do AVD; e injeta placeholder p/ emulador que ainda nem apareceu.
      if (this.emulators) {
        for (const r of this.emulators.runningList()) {
          const existing = byId.get(r.serial);
          if (existing) {
            if (existing.status !== "online") existing.status = "booting";
            existing.name = r.name;
            existing.kind = "virtual";
          } else {
            byId.set(r.serial, {
              id: r.serial, name: r.name, model: "AVD", os: "Android",
              kind: "virtual", status: "booting", battery: 100,
              ip: "127.0.0.1", port: r.port, app: "—", fps: 0,
            });
          }
        }
      }

      let changed = byId.size !== this.devices.size;
      const next = new Map();
      for (const [id, d] of byId) {
        const merged = { ...d, test: this.tests.get(id) || "idle" };
        const prev = this.devices.get(id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(merged)) changed = true;
        next.set(id, merged);
      }
      this.devices = next;
      if (changed) this.emit("change", this.list());
    } catch (e) {
      console.error("[manager] poll falhou:", e.message);
    }
  }

  /** Simula rodar suite de teste nos ids (running -> pass|fail). */
  runSuite(ids) {
    const targets = ids.filter((id) => this.devices.get(id)?.status === "online");
    targets.forEach((id) => this.tests.set(id, "running"));
    this._apply();
    targets.forEach((id, i) => {
      const t = setTimeout(() => {
        // resultado pseudo-aleatório estável por id
        const fail = (id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) + i) % 4 === 0;
        this.tests.set(id, fail ? "fail" : "pass");
        this._apply();
      }, 900 + (i % 6) * 450);
      this.timers.push(t);
    });
    return { running: targets.length };
  }

  async action(id, kind) {
    return this.source.input(id, kind);
  }

  async tap(id, x, y) {
    return this.source.tap ? this.source.tap(id, x, y) : { ok: false };
  }

  async swipe(id, x1, y1, x2, y2, ms) {
    return this.source.swipe ? this.source.swipe(id, x1, y1, x2, y2, ms) : { ok: false };
  }

  async text(id, str) {
    return this.source.text ? this.source.text(id, str) : { ok: false };
  }

  async openUrl(id, url) {
    return this.source.openUrl ? this.source.openUrl(id, url) : { ok: false };
  }

  async rotate(id, deg) {
    return this.source.rotate ? this.source.rotate(id, deg) : { ok: false };
  }

  async install(id, apkPath) {
    return this.source.install ? this.source.install(id, apkPath) : { ok: false };
  }

  async record(id, seconds, outPath) {
    return this.source.record ? this.source.record(id, seconds, outPath) : { ok: false };
  }

  async screenshot(id) {
    return this.source.screenshot(id);
  }

  /** Executa um passo do roteiro no device. */
  async _execStep(id, s) {
    const a = s.args;
    switch (s.action) {
      case "key": return this.source.input(id, a[0]);
      case "tap": return this.source.tap(id, Number(a[0]), Number(a[1]));
      case "swipe": return this.source.swipe(id, Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]), Number(a[4]) || 300);
      case "text": return this.source.text(id, s.rest);
      case "openurl": return this.source.openUrl(id, s.rest);
      case "rotate": return this.source.rotate(id, Number(a[0]) || 90);
      case "wait":
      case "sleep": await delay(Number(a[0])); return { ok: true };
      default: return { ok: false, error: `ação desconhecida: ${s.action}` };
    }
  }

  /** Roda o roteiro inteiro num device; retorna o resultado passo a passo. */
  async runScript(id, text) {
    const steps = parseScript(text);
    const results = [];
    for (const s of steps) {
      if (s.error) { results.push({ n: s.n, raw: s.raw, ok: false, error: s.error }); continue; }
      try {
        const r = await this._execStep(id, s);
        results.push({ n: s.n, raw: s.raw, ok: r?.ok !== false, error: r?.error });
      } catch (e) {
        results.push({ n: s.n, raw: s.raw, ok: false, error: e.message });
      }
    }
    return { ok: results.every((r) => r.ok), total: results.length, steps: results };
  }

  async provision() {
    const r = await this.source.provision();
    await this.poll();
    return r;
  }

  // Reaplica .test nos devices em memória e emite change (sem esperar poll).
  _apply() {
    for (const [id, d] of this.devices) {
      d.test = this.tests.get(id) || "idle";
    }
    this.emit("change", this.list());
  }
}
