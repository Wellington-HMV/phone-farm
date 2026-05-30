import { useMemo, useRef, useState } from "react";
import { OSES } from "./data/mock.js";
import { useDevices } from "./hooks/useDevices.js";
import { uploadApk, installApk } from "./api/client.js";
import PhoneCard from "./components/PhoneCard.jsx";
import PhoneRow from "./components/PhoneRow.jsx";
import FocusModal from "./components/FocusModal.jsx";
import EmulatorBar from "./components/EmulatorBar.jsx";
import ProvisionModal from "./components/ProvisionModal.jsx";

export default function App() {
  const { devices, source, connected, runSuite, deviceAction } = useDevices();
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const batchApk = useRef(null);

  // sobe APK 1x e instala em todos os selecionados
  const onBatchApk = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ids = [...selected];
    setBatchMsg(`Enviando ${file.name}…`);
    const up = await uploadApk(file);
    if (!up?.ok) return setBatchMsg(`Falha no upload: ${up?.error || "?"}`);
    setBatchMsg(`Instalando em ${ids.length}…`);
    const res = await Promise.all(ids.map((id) => installApk(id, up.token)));
    const okN = res.filter((r) => r?.ok).length;
    setBatchMsg(`${up.name}: ✓ ${okN}/${ids.length} instalado(s)`);
  };

  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(null);
  const [view, setView] = useState("grid"); // grid | list
  const [cols, setCols] = useState(6);
  const [groupOS, setGroupOS] = useState(false);
  const [liveGrid, setLiveGrid] = useState(true); // grade espelha o device por padrão (só visualização)

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const shown = useMemo(
    () =>
      devices.filter(
        (d) =>
          (filter === "all" ||
            d.status === filter ||
            d.kind === filter ||
            d.test === filter ||
            d.os === filter) &&
          d.name.includes(query)
      ),
    [devices, filter, query]
  );

  const counts = useMemo(
    () => ({
      total: devices.length,
      online: devices.filter((d) => d.status === "online").length,
      pass: devices.filter((d) => d.test === "pass").length,
      fail: devices.filter((d) => d.test === "fail").length,
    }),
    [devices]
  );

  const handleRunSuite = () => runSuite(selected.size ? [...selected] : undefined);
  const selectAll = () => setSelected(new Set(shown.map((d) => d.id)));

  const Chip = ({ v, label }) => (
    <button
      onClick={() => setFilter(v)}
      className={`px-3 py-1 rounded-full text-xs whitespace-nowrap ${
        filter === v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );

  const groups = groupOS
    ? OSES.map((os) => ({ os, items: shown.filter((d) => d.os === os) })).filter((g) => g.items.length)
    : [{ os: null, items: shown }];

  const renderItems = (items) =>
    view === "grid" ? (
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
        {items.map((d) => (
          <PhoneCard key={d.id} device={d} selected={selected.has(d.id)} onSelect={toggle} onFocus={setFocus} live={liveGrid} />
        ))}
      </div>
    ) : (
      <div className="space-y-1">
        {items.map((d) => (
          <PhoneRow key={d.id} device={d} selected={selected.has(d.id)} onSelect={toggle} onFocus={setFocus} />
        ))}
      </div>
    );

  return (
    <div className="min-h-screen text-slate-200">
      {/* ---- header ---- */}
      <header className="sticky top-0 z-40 backdrop-blur bg-slate-950/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
            <h1 className="text-lg font-bold tracking-tight">
              Phone<span className="text-sky-400">Farm</span>
            </h1>
          </div>
          <div className="flex gap-4 text-xs text-slate-400">
            <span>
              <b className="text-slate-100">{counts.total}</b> devices
            </span>
            <span>
              <b className="text-emerald-400">{counts.online}</b> online
            </span>
            <span>
              <b className="text-emerald-300">{counts.pass}</b> pass
            </span>
            <span>
              <b className="text-rose-300">{counts.fail}</b> fail
            </span>
          </div>
          {/* fonte + conexão WS */}
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              source === "adb" ? "bg-cyan-500/20 text-cyan-300" : "bg-violet-500/20 text-violet-300"
            }`}
            title="fonte de devices"
          >
            {source ? source.toUpperCase() : "…"}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse-dot" : "bg-slate-600"}`}
            title={connected ? "WS conectado" : "WS desconectado"}
          />
          <div className="flex-1" />
          <div className="flex items-center gap-2 shrink-0">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar device…"
              className="bg-slate-900 ring-1 ring-slate-800 rounded-lg px-3 py-1.5 text-sm w-36 focus:outline-none focus:ring-sky-500"
            />
            <button onClick={() => setProvisionOpen(true)} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm whitespace-nowrap">
              + Provisionar
            </button>
            <button
              onClick={handleRunSuite}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium whitespace-nowrap"
            >
              ▶ Rodar suite
            </button>
          </div>
        </div>
      </header>

      {/* ---- toolbar ---- */}
      <div className="sticky top-[57px] z-30 backdrop-blur bg-slate-950/90 max-w-7xl mx-auto px-5 py-3 flex items-center gap-2 flex-wrap rounded-b-lg">
        <div className="flex gap-2 overflow-x-auto">
          <Chip v="all" label="Todos" />
          <Chip v="online" label="Online" />
          <Chip v="pass" label="✓ Pass" />
          <Chip v="fail" label="✕ Fail" />
          <Chip v="virtual" label="Virtual" />
          <Chip v="real" label="Real" />
          <span className="w-px bg-slate-700 mx-1" />
          {OSES.map((os) => (
            <Chip key={os} v={os} label={os.replace("Android ", "A")} />
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setLiveGrid((v) => !v)}
          className={`text-xs px-2 py-1 rounded ${liveGrid ? "bg-rose-600 text-white" : "bg-slate-800 text-slate-400"}`}
          title="espelhar a tela real do device na grade (só visualização; desligue p/ aliviar com muitos devices)"
        >
          🪞 Espelho
        </button>
        <button
          onClick={() => setGroupOS((g) => !g)}
          className={`text-xs px-2 py-1 rounded ${groupOS ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
        >
          Agrupar OS
        </button>
        <div className="flex rounded-lg overflow-hidden ring-1 ring-slate-700">
          <button
            onClick={() => setView("grid")}
            className={`px-2 py-1 text-xs ${view === "grid" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            ▦ Grade
          </button>
          <button
            onClick={() => setView("list")}
            className={`px-2 py-1 text-xs ${view === "list" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
          >
            ☰ Lista
          </button>
        </div>
        {view === "grid" && (
          <div className="flex items-center gap-1">
            {[4, 6, 8, 10].map((c) => (
              <button
                key={c}
                onClick={() => setCols(c)}
                className={`h-7 w-7 rounded text-xs ${cols === c ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---- emuladores locais ---- */}
      <EmulatorBar />

      {/* ---- batch bar ---- */}
      {selected.size > 0 ? (
        <div className="max-w-7xl mx-auto px-5 pb-2 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-800/80 rounded-lg px-2 py-1">
            <span className="text-xs text-sky-300">{selected.size} selec.</span>
            <button onClick={handleRunSuite} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-sky-600">
              ▶ Rodar suite
            </button>
            <button
              onClick={() => [...selected].forEach((id) => deviceAction(id, "home"))}
              className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-sky-600"
            >
              ⌂ Home
            </button>
            <input ref={batchApk} type="file" accept=".apk" className="hidden" onChange={onBatchApk} />
            <button onClick={() => batchApk.current?.click()} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-sky-600">
              📦 Instalar APK
            </button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 px-1">
              ✕
            </button>
          </div>
          {batchMsg && <span className="text-xs text-slate-400">{batchMsg}</span>}
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-5 pb-1">
          <button onClick={selectAll} className="text-xs text-slate-500 hover:text-slate-300">
            Selecionar todos ({shown.length})
          </button>
        </div>
      )}

      {/* ---- grid/list ---- */}
      <main className="max-w-7xl mx-auto px-5 pb-16 space-y-6">
        {groups.map((g) => (
          <section key={g.os || "all"}>
            {g.os && (
              <h3 className="text-xs uppercase tracking-widest text-slate-500 mb-2">
                {g.os} <span className="text-slate-600">· {g.items.length}</span>
              </h3>
            )}
            {renderItems(g.items)}
          </section>
        ))}
        {devices.length === 0 && (
          <p className="text-center text-slate-600 py-20">Conectando ao backend…</p>
        )}
        {devices.length > 0 && shown.length === 0 && (
          <p className="text-center text-slate-600 py-20">Nenhum device no filtro.</p>
        )}
      </main>

      <FocusModal device={focus} onClose={() => setFocus(null)} onAction={deviceAction} />
      <ProvisionModal open={provisionOpen} onClose={() => setProvisionOpen(false)} />
    </div>
  );
}
