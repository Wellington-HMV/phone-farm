// Persistência de roteiros gravados. Cada roteiro = um fluxo de ações (mini-DSL)
// salvo com nome (ex.: nome do processo/app) p/ ser reexecutado depois.
// Guarda num único JSON em ~/.phone-farm/scripts.json (sobrevive a rebuilds).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.join(os.homedir(), ".phone-farm");
const FILE = path.join(DIR, "scripts.json");

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, FILE); // escrita atômica
    return true;
  } catch (e) {
    console.error("[scriptsStore] falha ao salvar:", e.message);
    return false;
  }
}

/** Lista roteiros (mais recentes primeiro). */
export function listScripts() {
  return readAll().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/** Salva um roteiro novo. { name, text, device? } -> registro com id/createdAt. */
export function saveScript({ name, text, device } = {}) {
  const n = String(name || "").trim();
  const t = String(text || "").trim();
  if (!n) return { ok: false, error: "nome obrigatório" };
  if (!t) return { ok: false, error: "roteiro vazio" };
  const rec = { id: crypto.randomUUID(), name: n, text: t, device: device || null, createdAt: Date.now() };
  const list = readAll();
  list.push(rec);
  if (!writeAll(list)) return { ok: false, error: "falha ao gravar arquivo" };
  return { ok: true, script: rec };
}

/** Remove por id. */
export function deleteScript(id) {
  const list = readAll();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return { ok: false, error: "não encontrado" };
  if (!writeAll(next)) return { ok: false, error: "falha ao gravar arquivo" };
  return { ok: true };
}
