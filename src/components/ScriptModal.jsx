import { useEffect, useRef, useState } from "react";
import { scriptHelp, runScript } from "../api/client.js";

/**
 * Editor de roteiro de automação. Roda o script (1 ação por linha) nos devices alvo
 * em paralelo e mostra o resultado passo a passo de cada um.
 */
export default function ScriptModal({ open, targets, onClose }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null); // { [id]: {ok,total,steps} }
  const [help, setHelp] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    scriptHelp().then((h) => { setHelp(h); if (!text) setText(h.example || ""); }).catch(() => {});
  }, [open, text]);

  if (!open) return null;

  const run = async () => {
    if (!targets.length) return;
    setRunning(true);
    setResults({});
    await Promise.all(
      targets.map(async (id) => {
        const r = await runScript(id, text);
        setResults((prev) => ({ ...prev, [id]: r }));
      })
    );
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-[680px] max-h-[85vh] overflow-auto bg-slate-900 ring-1 ring-slate-700 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">▶ Roteiro de automação</h2>
          <span className="text-xs text-slate-400">{targets.length} device(s) alvo</span>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={10}
          className="w-full bg-slate-950 ring-1 ring-slate-800 rounded-lg p-3 text-sm font-mono text-slate-200 focus:outline-none focus:ring-sky-500"
          placeholder="key home&#10;tap 0.5 0.92&#10;wait 800&#10;text Phone Farm"
        />

        <p className="text-[11px] text-slate-500">
          1 ação por linha · <code>{help?.actions?.join(" · ") || "key tap swipe text openurl rotate wait"}</code> ·
          coords 0–1 · <code>#</code> = comentário
        </p>

        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={running || !targets.length}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium disabled:opacity-50"
          >
            {running ? "Rodando…" : `▶ Rodar em ${targets.length}`}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">Fechar</button>
        </div>

        {results && (
          <div className="space-y-2 pt-1">
            {Object.entries(results).map(([id, r]) => (
              <div key={id} className="bg-slate-950/60 rounded-lg p-2 ring-1 ring-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-200">{id}</span>
                  <span className={r.ok ? "text-emerald-400" : "text-rose-400"}>
                    {r.ok ? "✓ ok" : "✕ falhou"} · {r.steps?.filter((s) => s.ok).length}/{r.total}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5">
                  {r.steps?.map((s, i) => (
                    <div key={i} className="flex gap-2 text-[11px] font-mono">
                      <span className={s.ok ? "text-emerald-500" : "text-rose-500"}>{s.ok ? "✓" : "✕"}</span>
                      <span className="text-slate-400 truncate">{s.raw}</span>
                      {s.error && <span className="text-rose-400">— {s.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
