import { useCallback, useEffect, useState } from "react";
import { listEmulators, startEmulator, stopEmulator } from "../api/client.js";

/** Barra de AVDs locais: lista emuladores e permite subir/derrubar cada um. */
export default function EmulatorBar() {
  const [data, setData] = useState({ sdk: true, avds: [] });
  const [busy, setBusy] = useState(null);

  const refresh = useCallback(() => {
    listEmulators().then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [refresh]);

  if (!data.sdk)
    return (
      <div className="max-w-7xl mx-auto px-5 pb-2">
        <div className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-1.5">
          SDK Android não encontrado — defina ANDROID_HOME p/ rodar emuladores locais.
        </div>
      </div>
    );

  const act = async (name, running) => {
    setBusy(name);
    try {
      await (running ? stopEmulator(name) : startEmulator(name));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-5 pb-2 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-widest text-slate-500">Emuladores (AVD)</span>
      {data.avds.length === 0 && <span className="text-xs text-slate-600">nenhum AVD — use “+ Provisionar”</span>}
      {data.avds.map((a) => (
        <button
          key={a.name}
          onClick={() => act(a.name, a.running)}
          disabled={busy === a.name}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg ring-1 transition disabled:opacity-50 ${
            a.running
              ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-rose-500/15 hover:text-rose-300 hover:ring-rose-500/30"
              : "bg-slate-800 text-slate-300 ring-slate-700 hover:bg-sky-600 hover:text-white"
          }`}
          title={a.running ? `parar ${a.name} (${a.serial})` : `iniciar ${a.name}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${a.running ? "bg-emerald-400" : "bg-slate-500"}`} />
          {a.name}
          <span className="opacity-60">{busy === a.name ? "…" : a.running ? "■" : "▶"}</span>
        </button>
      ))}
    </div>
  );
}
