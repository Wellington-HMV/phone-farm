// Segurança do agente local (modo "casca hospedada").
//
// Modelo:
//  - Agente escuta só 127.0.0.1 (LAN não alcança) — ver PF_BIND.
//  - Requisição MESMA-ORIGEM (SPA servida pelo próprio agente / app desktop):
//    liberada sem token. Zero atrito p/ `npm start` e Electron.
//  - Requisição CROSS-ORIGIN (casca web hospedada em outro domínio): exige
//    ORIGEM permitida + TOKEN de pareamento. Browser sempre manda `Origin`
//    cross-origin, então site malicioso na aba do usuário NÃO consegue
//    comandar o adb local (não tem o token) — defesa contra CSRF.
//
// Config persistida em ~/.phone-farm/agent.json (token). Sobrescreva com
// PF_TOKEN; restrinja origens com PF_WEB_ORIGINS (csv; default "*" = qualquer
// origem, mas token segue obrigatório).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const CFG_DIR = path.join(os.homedir(), ".phone-farm");
const CFG_FILE = path.join(CFG_DIR, "agent.json");

export function loadAgentConfig() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); } catch {}

  let token = process.env.PF_TOKEN || saved.token;
  if (!token) {
    token = crypto.randomBytes(24).toString("base64url");
    try {
      fs.mkdirSync(CFG_DIR, { recursive: true });
      fs.writeFileSync(CFG_FILE, JSON.stringify({ token }, null, 2));
    } catch (e) {
      console.warn("[security] não consegui persistir o token:", e.message);
    }
  }

  // origens permitidas p/ casca hospedada (cross-origin). "*" = qualquer (token ainda exigido).
  const origins = (process.env.PF_WEB_ORIGINS || "*")
    .split(",").map((s) => s.trim()).filter(Boolean);

  return { token, origins, cfgFile: CFG_FILE };
}

/** Requisição é mesma-origem? (SPA servida pelo próprio agente / desktop) */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // sem Origin = não é cross-origin de browser
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function originAllowed(origin, origins) {
  return !!origin && (origins.includes("*") || origins.includes(origin));
}

function tokenOk(provided, token) {
  if (!provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Middleware Express: CORS dinâmico + porteiro (mesma-origem livre, cross-origin exige token). */
export function makeAuth({ token, origins }) {
  return function gate(req, res, next) {
    const origin = req.headers.origin;

    // CORS: só ecoa p/ origens conhecidas (mesma-origem ou permitidas)
    if (origin && (sameOrigin(req) || originAllowed(origin, origins))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-PF-Token");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);

    // mesma-origem: confia (página servida pelo próprio agente)
    if (sameOrigin(req)) return next();

    // cross-origin: origem permitida + token válido
    if (!originAllowed(origin, origins))
      return res.status(403).json({ ok: false, error: "origem não autorizada" });
    const provided = req.get("x-pf-token") || req.query.token;
    if (!tokenOk(provided, token))
      return res.status(401).json({ ok: false, error: "token inválido — pareie o agente" });
    next();
  };
}

/** verifyClient do WebSocketServer: mesma regra (token via query, pois <ws> não manda header). */
export function makeWsVerify({ token, origins }) {
  return function verify(info) {
    const req = info.req;
    const origin = info.origin;
    if (!origin) return true; // mesma-origem / não-browser
    try {
      if (new URL(origin).host === req.headers.host) return true;
    } catch {}
    if (!originAllowed(origin, origins)) return false;
    try {
      const provided = new URL(req.url, "http://x").searchParams.get("token");
      return tokenOk(provided, token);
    } catch {
      return false;
    }
  };
}
