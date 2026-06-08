import { useState } from "react";
import { setAgent, clearAgent } from "../api/config.js";
import { health } from "../api/client.js";

/**
 * Tela de pareamento (só no build hospedado). O usuário roda o agente local,
 * cola a URL + token que o agente imprime no console, e a casca web passa a
 * comandar o hardware da máquina dele. onPaired() roda após teste de saúde ok.
 */
export default function AgentGate({ onPaired }) {
  const [url, setUrl] = useState("http://localhost:4000");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const connect = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    setAgent(url, token); // health() lê base/token do localStorage
    try {
      const h = await health();
      if (h?.ok) return onPaired();
      throw new Error("resposta inesperada do agente");
    } catch (e2) {
      clearAgent();
      setErr(
        "Não conectou. Confira a URL e o token, e se o agente está rodando. " +
          `(${e2.message})`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 text-slate-200">
      <form
        onSubmit={connect}
        className="w-full max-w-md bg-slate-900 ring-1 ring-slate-800 rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <span className="text-3xl">🌾</span>
          <h1 className="text-xl font-bold">
            Phone<span className="text-sky-400">Farm</span>
          </h1>
        </div>

        <p className="text-sm text-slate-400">
          Esta é a casca web. Pra usar o hardware da <b>sua máquina</b> (emuladores e
          devices USB), rode o <b>agente local</b> e pareie aqui.
        </p>

        <div className="text-xs bg-slate-950/60 rounded-lg p-3 space-y-1 text-slate-400">
          <p className="text-slate-300 font-medium">1. Rode o agente na sua máquina:</p>
          <pre className="bg-black/40 rounded p-2 overflow-x-auto text-[11px] text-emerald-300">
{`git clone https://github.com/Wellington-HMV/phone-farm
cd phone-farm && npm install
cd server && npm install && npm start`}
          </pre>
          <p>2. Ele imprime a <b>URL</b> e o <b>token</b> no console — cole abaixo.</p>
        </div>

        <label className="block text-xs text-slate-400">
          URL do agente
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:4000"
            className="mt-1 w-full bg-slate-950 ring-1 ring-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-sky-500"
          />
        </label>

        <label className="block text-xs text-slate-400">
          Token de pareamento
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="cole o token impresso pelo agente"
            className="mt-1 w-full bg-slate-950 ring-1 ring-slate-800 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-sky-500"
          />
        </label>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <button
          type="submit"
          disabled={busy || !token}
          className="w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-sm font-medium"
        >
          {busy ? "Conectando…" : "Conectar"}
        </button>

        <p className="text-[11px] text-slate-600">
          O agente só aceita comandos com este token e escuta apenas na sua própria
          máquina (127.0.0.1). Nada do hardware sai daqui sem você parear.
        </p>
      </form>
    </div>
  );
}
