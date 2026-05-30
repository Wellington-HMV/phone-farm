// Trial de 7 dias + ativação por chave (offline, HMAC por ID de instalação).
// Client-side: segura usuário honesto. Trava real exige servidor (ver PLANO).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// ⚠️ TROQUE por um segredo seu e mantenha-o privado (gera/valida as chaves).
const SECRET = "pf-7Q2k9Lr4Xv1Zt8Hn3Bw6Ms0Cy5Pd2Ej-CHANGE-ME";
const TRIAL_DAYS = 7;

/** Chave determinística para um installId (vendor gera a mesma com o keygen). */
function keyFor(installId) {
  const raw = crypto
    .createHmac("sha256", SECRET)
    .update("phone-farm:" + installId)
    .digest("base64")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 20);
  return "PF-" + raw.replace(/(.{4})(.{4})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-$5");
}

function validate(installId, key) {
  if (!key) return false;
  const a = Buffer.from(String(key).trim().toUpperCase());
  const b = Buffer.from(keyFor(installId));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function statePath(dataDir) {
  return path.join(dataDir, "pf-state.json");
}
function load(dataDir) {
  try {
    return JSON.parse(fs.readFileSync(statePath(dataDir), "utf8"));
  } catch {
    return {};
  }
}
function save(dataDir, s) {
  try {
    fs.writeFileSync(statePath(dataDir), JSON.stringify(s));
  } catch {}
}

function ensureInstall(dataDir) {
  const s = load(dataDir);
  if (!s.installId) s.installId = crypto.randomUUID();
  if (!s.firstRun) s.firstRun = Date.now();
  save(dataDir, s);
  return s;
}

/** { state: 'licensed'|'trial'|'expired', daysLeft, installId } */
function status(dataDir) {
  const s = ensureInstall(dataDir);
  if (s.key && validate(s.installId, s.key)) return { state: "licensed", daysLeft: null, installId: s.installId };
  const days = (Date.now() - s.firstRun) / 86_400_000;
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - days));
  return { state: daysLeft > 0 ? "trial" : "expired", daysLeft, installId: s.installId };
}

function activate(dataDir, key) {
  const s = ensureInstall(dataDir);
  if (validate(s.installId, key)) {
    s.key = String(key).trim().toUpperCase();
    save(dataDir, s);
    return { ok: true };
  }
  return { ok: false, error: "Chave inválida para este ID." };
}

module.exports = { keyFor, validate, status, activate, ensureInstall, TRIAL_DAYS };
