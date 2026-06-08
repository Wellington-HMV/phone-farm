// Config de conexão com o agente.
//
// - Build local/desktop (mode != "web"): base vazia → URLs relativas (mesma-origem).
//   Funciona como sempre, sem pareamento.
// - Build hospedado (`vite build --mode web`): a casca roda em outro domínio e
//   precisa parear com o agente local (URL + token), guardado no localStorage.

const KEY = "pf.agent"; // { base, token }

/** True quando este bundle foi buildado p/ hospedagem (casca web). */
export const HOSTED = import.meta.env.MODE === "web";

export function getAgent() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function setAgent(base, token) {
  const clean = String(base || "").trim().replace(/\/+$/, "");
  localStorage.setItem(KEY, JSON.stringify({ base: clean, token: String(token || "").trim() }));
}

export function clearAgent() {
  localStorage.removeItem(KEY);
}

/** Base das chamadas REST (sem barra final). Vazio = mesma-origem. */
export function apiBase() {
  return HOSTED ? getAgent()?.base || "" : "";
}

export function apiToken() {
  return HOSTED ? getAgent()?.token || "" : "";
}

/** Precisa parear? Só no build hospedado e sem agente salvo. */
export function needsPairing() {
  return HOSTED && !getAgent();
}
