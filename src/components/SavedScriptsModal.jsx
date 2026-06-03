import { useEffect, useState } from "react";
import { listSavedScripts, deleteScript, runScript } from "../api/client.js";

/**
 * Gerenciador de roteiros salvos (fluxos gravados no modal do emulador).
 * Lista, roda nos devices alvo (selecionados ou todos online) e exclui.
 */
export default function SavedScriptsModal({ open, targets, onClose }) {
  const [saved, setSaved] = useState([]);
  const [openId, setOpenId] = useState(null); // id do roteiro com preview aberto
  const [running, setRunning] = useState(null); // id rodando
  const [results, setResults] = useState(null); // { [deviceId]: result }

  useEffect(() => {
    if (open) { listSavedScripts().then((r) => setSaved(r?.scripts || [])).catch(() => {}); setResults(null); }
  }, [open]);

  if (!open) return null;

  const run = async (s) => {
    if (!targets.length) return;
    setRunning(s.id);
    setResults({});
    await Promise.all(
      targets.map(async (id) => {
        const r = await runScript(id, s.text);
        setResults((prev) => ({ ...prev, [id]: r }));
      })
    );
    setRunning(null);
  };

  const remove = async (s) => {
    const r = await deleteScript(s.id);
    if (r?.ok) setSaved((list) => list.filter((x) => x.id !== s.id));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={onClose}>
      <div className="w-[620px] max-h-[85vh] overflow-auto bg-slate-900 ring-1 ring-slate-700 rounded-2xl p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">📜 Roteiros salvos</h2>
          <span className="text-xs text-slate-400">{targets.length} device(s) alvo</span>
        </div>

        {saved.length === 0 && (
          <p className="text-sm text-slate-500 py-6 text-center">
            Nenhum fluxo salvo. Grave um no modal de um emulador (⏯ Gravar fluxo).
          </p>
        )}

        <div className="space-y-2">
          {saved.map((s) => (
            <div key={s.id} className="bg-slate-950/60 rounded-lg ring-1 ring-slate-800 p-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpenId(openId === s.id ? null : s.id)}
                  className="flex-1 text-left min-w-0"
                  title="ver passos"
                >
                  <span className="text-sm text-slate-200 truncate block">{s.name}</span>
                  {s.device && <span className="text-[10px] text-slate-500">gravado em {s.device} · roda em qualquer device</span>}
                </button>
                <button
                  onClick={() => run(s)}
                  disabled={running || !targets.length}
                  className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
                >
                  {running === s.id ? "Rodando…" : `▶ Rodar em ${targets.length}`}
                </button>
                <button
                  onClick={() => remove(s)}
                  className="text-xs px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white"
                  title="excluir"
                >
                  🗑
                </button>
              </div>

              {openId === s.id && (
                <pre className="mt-2 bg-slate-950 ring-1 ring-slate-800 rounded-lg p-2 text-[11px] font-mono text-slate-300 whitespace-pre-wrap">{s.text}</pre>
              )}
            </div>
          ))}
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
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}
