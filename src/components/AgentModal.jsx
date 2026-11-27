import { useEffect, useState } from "react";
import {
  agentOptions,
  devicePackages,
  listAgentRuns,
  startAgentRun,
  getAgentRun,
  cancelAgentRun,
  agentFileUrl,
} from "../api/client.js";

// Agente testador: um Claude Code por device, interpretando uma persona, testa o
// app como usuário real e devolve problemas com screenshots.

const SEV = {
  blocker: { t: "Bloqueador", c: "bg-rose-500/20 text-rose-300 ring-rose-500/40" },
  major: { t: "Grave", c: "bg-orange-500/20 text-orange-300 ring-orange-500/40" },
  minor: { t: "Menor", c: "bg-amber-500/15 text-amber-200 ring-amber-500/30" },
  cosmetic: { t: "Cosmético", c: "bg-slate-500/20 text-slate-300 ring-slate-500/40" },
};
const STATE = {
  queued: "na fila",
  preparing: "preparando device",
  running: "testando",
  done: "concluído",
  error: "erro",
  cancelled: "cancelado",
  interrupted: "interrompido",
};
const MODELS = [
  { id: "sonnet", label: "Sonnet (recomendado)" },
  { id: "haiku", label: "Haiku (mais barato, menos preciso)" },
  { id: "opus", label: "Opus (mais caro)" },
];

const fmtCost = (v) => (typeof v === "number" ? `US$ ${v.toFixed(2)}` : "—");
const fmtDate = (t) => (t ? new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

function Label({ htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-300 mb-1">
      {children}
    </label>
  );
}

const field =
  "w-full bg-slate-950 ring-1 ring-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500";

function NewRun({ targets, options, onStarted }) {
  const [appId, setAppId] = useState("");
  const [packages, setPackages] = useState([]);
  const [mission, setMission] = useState("explore");
  const [text, setText] = useState("");
  const [personas, setPersonas] = useState([]);
  const [model, setModel] = useState("sonnet");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!targets[0]) return;
    devicePackages(targets[0]).then((r) => setPackages(r.packages || [])).catch(() => {});
  }, [targets[0]]);

  const needsText = mission === "reproduce" || mission === "feature";
  const togglePersona = (id) =>
    setPersonas((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await startAgentRun({ deviceIds: targets, appId: appId.trim(), mission, text, personas, model }).catch(
      (err) => ({ ok: false, error: err.message })
    );
    setBusy(false);
    if (!r?.ok) return setError(r?.error || "falha ao iniciar");
    onStarted(r.id);
  };

  if (options?.mock)
    return <p className="text-sm text-amber-300">O agente precisa de devices reais (adb). O backend está em modo mock.</p>;
  if (!targets.length)
    return <p className="text-sm text-slate-400">Nenhum device online. Suba um emulador ou selecione devices na grade.</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="ag-app">App a testar (pacote Android) *</Label>
        <input
          id="ag-app"
          list="ag-packages"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          placeholder="com.empresa.app"
          className={field}
          required
          autoComplete="off"
        />
        <datalist id="ag-packages">
          {packages.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <p className="text-[11px] text-slate-500 mt-1">
          Precisa estar instalado em cada device (use 📦 Instalar APK). Sugestões vêm de {targets[0]}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="ag-mission">Missão</Label>
          <select id="ag-mission" value={mission} onChange={(e) => setMission(e.target.value)} className={field}>
            {(options?.missions || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ag-model">Modelo</Label>
          <select id="ag-model" value={model} onChange={(e) => setModel(e.target.value)} className={field}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {needsText && (
        <div>
          <Label htmlFor="ag-text">{mission === "reproduce" ? "Bug a reproduzir (passos) *" : "Funcionalidade a testar *"}</Label>
          <textarea
            id="ag-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            required
            className={field}
            placeholder={
              mission === "reproduce"
                ? "1. Abrir Agenda\n2. Escolher um horário\n3. Tocar Confirmar → app fecha"
                : "Agendar um corte: escolher barbeiro, serviço, horário, confirmar e ver o agendamento na lista."
            }
          />
        </div>
      )}

      <fieldset>
        <legend className="text-xs font-medium text-slate-300 mb-1">
          Personas <span className="text-slate-500 font-normal">(nenhuma marcada = uma diferente por device)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {(options?.personas || []).map((p) => {
            const on = personas.includes(p.id);
            return (
              <button
                type="button"
                key={p.id}
                aria-pressed={on}
                onClick={() => togglePersona(p.id)}
                title={`${p.perfil}\nObjetivo: ${p.objetivo}\nFonte x${p.fontScale} · ${p.theme === "dark" ? "escuro" : "claro"} · ${p.locale}`}
                className={`px-3 py-1.5 rounded-full text-xs ring-1 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  on ? "bg-sky-600 text-white ring-sky-400" : "bg-slate-800 text-slate-300 ring-slate-700 hover:bg-slate-700"
                }`}
              >
                {on ? "✓ " : ""}
                {p.nome}
                <span className="opacity-60"> · x{p.fontScale}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="text-[11px] text-slate-400 bg-slate-950/60 ring-1 ring-slate-800 rounded-lg p-3 space-y-1">
        <p>
          {targets.length} device(s): {targets.join(", ")}. Cada um usa sua cota do Claude (estimativa: US$ 0,15–0,55 por
          device com Sonnet) e leva 5–30 min.
        </p>
        {targets.length > 3 && <p className="text-amber-300">Mais de 3 emuladores juntos pode faltar RAM e deixar tudo lento.</p>}
        <p>Fonte e tema do device mudam durante o teste e voltam ao normal no fim.</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300"
      >
        {busy ? "Iniciando…" : `▶ Testar em ${targets.length} device(s)`}
      </button>
    </form>
  );
}

function Shots({ runId, deviceId, screens }) {
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {screens.slice(0, 6).map((s) => {
        const url = agentFileUrl(runId, deviceId, `shots/${String(s).replace(/\.png$/, "")}.png`);
        return (
          <a key={s} href={url} target="_blank" rel="noreferrer" title={`screenshot ${s} · ${deviceId}`}>
            <img src={url} alt={`Tela ${s} em ${deviceId}`} loading="lazy" className="h-24 w-auto rounded ring-1 ring-slate-700 hover:ring-sky-400" />
          </a>
        );
      })}
    </div>
  );
}

function Report({ runId, deviceId }) {
  const [txt, setTxt] = useState(null);
  useEffect(() => {
    fetch(agentFileUrl(runId, deviceId, "report.md"))
      .then((r) => (r.ok ? r.text() : "Sem relatório (o agente não chegou a escrever)."))
      .then(setTxt)
      .catch(() => setTxt("Falha ao carregar relatório."));
  }, [runId, deviceId]);
  return (
    <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-300 bg-slate-950 rounded-lg p-3 ring-1 ring-slate-800 max-h-80 overflow-auto">
      {txt ?? "carregando…"}
    </pre>
  );
}

function RunView({ id }) {
  const [run, setRun] = useState(null);
  const [open, setOpen] = useState(null); // deviceId com relatório aberto

  useEffect(() => {
    let alive = true;
    let timer;
    const load = () =>
      getAgentRun(id)
        .then((r) => {
          if (!alive) return;
          setRun(r);
          if (r.state === "running") timer = setTimeout(load, 3000);
        })
        .catch(() => alive && (timer = setTimeout(load, 5000)));
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id]);

  if (!run) return <p className="text-sm text-slate-400">carregando…</p>;
  const s = run.summary;
  const cost = run.agents.reduce((t, a) => t + (a.costUsd || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="font-mono text-slate-200">{run.appId}</span>
        <span className="text-slate-400">{run.mission}</span>
        <span className="text-slate-400">{fmtDate(run.createdAt)}</span>
        <span className={run.state === "running" ? "text-sky-300" : "text-slate-300"}>{STATE[run.state] || run.state}</span>
        <span className="text-slate-400">custo {fmtCost(cost)}</span>
        <div className="flex-1" />
        {run.state === "running" && (
          <button
            onClick={() => cancelAgentRun(id)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-700 text-rose-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-400"
          >
            Cancelar
          </button>
        )}
      </div>

      <table className="w-full text-xs">
        <thead className="text-slate-500 text-left">
          <tr>
            <th className="py-1 font-medium">Device</th>
            <th className="font-medium">Persona</th>
            <th className="font-medium">Estado</th>
            <th className="font-medium text-right">Telas</th>
            <th className="font-medium text-right">Custo</th>
            <th className="font-medium text-right">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {run.agents.map((a) => (
            <tr key={a.deviceId} className="border-t border-slate-800 align-top">
              <td className="py-1.5 font-mono text-slate-300">{a.deviceId}</td>
              <td className="text-slate-300">{a.persona?.nome}</td>
              <td className="text-slate-400">
                {STATE[a.state] || a.state}
                {a.note && <div className="text-sky-300">{a.note}</div>}
                {a.statusLabel && a.status !== "finished" && <div className="text-amber-300">{a.statusLabel}</div>}
                {a.error && <div className="text-rose-300">{a.error}</div>}
                {a.applied && a.applied.locale === false && a.persona?.locale !== "pt-BR" && (
                  <div className="text-slate-500">idioma {a.persona.locale} não aplicado</div>
                )}
              </td>
              <td className="text-right tabular-nums text-slate-300">{a.shots?.length ?? 0}</td>
              <td className="text-right tabular-nums text-slate-300">{fmtCost(a.costUsd)}</td>
              <td className="text-right">
                {a.verdict === "pass" && <span className="text-emerald-300">✓ passou</span>}
                {a.verdict === "uncertain" && (
                  <span className="text-amber-300" title="Nada grave achado, mas o agente não terminou de testar (turnos esgotados) ou a reprodução ficou incerta.">
                    ? incerto
                  </span>
                )}
                {a.verdict === "fail" && <span className="text-rose-300">✕ falhou</span>}
                {a.state === "done" && (
                  <button
                    onClick={() => setOpen(open === a.deviceId ? null : a.deviceId)}
                    className="block ml-auto mt-0.5 text-sky-300 hover:underline"
                    aria-expanded={open === a.deviceId}
                  >
                    {open === a.deviceId ? "fechar relatório" : "relatório"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && <Report runId={id} deviceId={open} />}

      {run.state === "running" && (
        <p className="text-xs text-slate-500" aria-live="polite">
          Acompanhe ao vivo na grade (🪞 Espelho). Atualiza a cada 3 s.
        </p>
      )}

      {s && (
        <section className="space-y-3">
          <div className="flex gap-2 flex-wrap text-xs">
            {Object.entries(s.bySeverity).map(([k, n]) => (
              <span key={k} className={`px-2 py-1 rounded ring-1 ${SEV[k].c}`}>
                {SEV[k].t}: <b className="tabular-nums">{n}</b>
              </span>
            ))}
            {s.avgScore !== null && <span className="px-2 py-1 text-slate-300">nota média {s.avgScore}/10</span>}
          </div>

          {s.personas.some((p) => p.reproduced) && (
            <div className="text-xs space-y-1">
              <h3 className="text-sm font-semibold text-white">Reprodução do bug</h3>
              {s.personas.map((p) => (
                <div key={p.deviceId} className="flex gap-2">
                  <span className="font-mono text-slate-400">{p.deviceId}</span>
                  <span className={p.reproduced === "yes" ? "text-rose-300" : p.reproduced === "no" ? "text-emerald-300" : "text-amber-300"}>
                    {{ yes: "reproduzido", no: "não reproduzido", unclear: "incerto" }[p.reproduced] || "—"}
                  </span>
                  {p.note && <span className="text-slate-400">{p.note}</span>}
                </div>
              ))}
            </div>
          )}

          <h3 className="text-sm font-semibold text-white">Problemas ({s.issues.length})</h3>
          {s.issues.length === 0 && <p className="text-xs text-slate-400">Nenhum problema reportado.</p>}
          <ul className="space-y-2">
            {s.issues.map((it, i) => (
              <li key={i} className="bg-slate-950/60 rounded-lg p-3 ring-1 ring-slate-800">
                <div className="flex items-start gap-2">
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ring-1 ${(SEV[it.severity] || SEV.cosmetic).c}`}>
                    {(SEV[it.severity] || { t: it.severity }).t}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-100">{it.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {it.screen ? `${it.screen} · ` : ""}
                      visto em {it.hits.length} device(s): {it.hits.map((h) => h.persona).join(", ")}
                    </p>
                  </div>
                </div>
                {it.hits[0]?.screens?.length > 0 && <Shots runId={id} deviceId={it.hits[0].deviceId} screens={it.hits[0].screens} />}
              </li>
            ))}
          </ul>

          {s.improvements.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-white">Melhorias sugeridas</h3>
              <ul className="space-y-1 text-xs">
                {s.improvements.map((m, i) => (
                  <li key={i} className="text-slate-300">
                    <b className="text-slate-100">[{m.impact}]</b> {m.title}{" "}
                    <span className="text-slate-500">
                      ({m.area}, {m.persona}){m.why ? ` — ${m.why}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default function AgentModal({ open, targets, onClose }) {
  const [tab, setTab] = useState("new");
  const [options, setOptions] = useState(null);
  const [runs, setRuns] = useState([]);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    if (!open) return;
    agentOptions().then(setOptions).catch(() => {});
    listAgentRuns().then((r) => setRuns(r.runs || [])).catch(() => {});
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tab, current]);

  if (!open) return null;

  const Tab = ({ v, children }) => (
    <button
      role="tab"
      aria-selected={tab === v}
      onClick={() => setTab(v)}
      className={`px-3 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 ${
        tab === v ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-title"
        className="w-full max-w-3xl max-h-[90vh] overflow-auto bg-slate-900 ring-1 ring-slate-700 rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <h2 id="agent-title" className="text-lg font-semibold text-white">
            🤖 Agente testador
          </h2>
          <div className="flex gap-1" role="tablist">
            <Tab v="new">Nova execução</Tab>
            <Tab v="history">Histórico{runs.length ? ` (${runs.length})` : ""}</Tab>
            {current && <Tab v="run">Execução atual</Tab>}
          </div>
          <div className="flex-1" />
          <button onClick={onClose} aria-label="Fechar" className="h-8 w-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
            ✕
          </button>
        </div>

        {tab === "new" && (
          <NewRun
            targets={targets}
            options={options}
            onStarted={(id) => {
              setCurrent(id);
              setTab("run");
            }}
          />
        )}
        {tab === "run" && current && <RunView id={current} />}
        {tab === "history" && (
          <ul className="space-y-1">
            {runs.length === 0 && <li className="text-sm text-slate-400">Nenhuma execução ainda.</li>}
            {runs.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => {
                    setCurrent(r.id);
                    setTab("run");
                  }}
                  className="w-full text-left flex gap-3 items-center px-3 py-2 rounded-lg bg-slate-950/60 ring-1 ring-slate-800 hover:ring-sky-500 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <span className="text-slate-400 w-28">{fmtDate(r.createdAt)}</span>
                  <span className="font-mono text-slate-200 flex-1 truncate">{r.appId}</span>
                  <span className="text-slate-400">{r.devices} dev.</span>
                  <span className="text-slate-400">{r.issues ?? "—"} probl.</span>
                  <span className="text-slate-400 tabular-nums">{fmtCost(r.costUsd)}</span>
                  <span className={r.state === "running" ? "text-sky-300" : "text-slate-300"}>{STATE[r.state] || r.state}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
