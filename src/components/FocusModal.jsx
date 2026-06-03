import { useEffect, useRef, useState } from "react";
import FakeScreen from "./FakeScreen.jsx";
import LiveScreen from "./LiveScreen.jsx";
import { useRecorder } from "../hooks/useRecorder.js";
import {
  stopEmulator, typeText, openUrl, rotate, uploadApk, installApk, recordUrl,
  saveScript, listSavedScripts, deleteScript, runScript,
} from "../api/client.js";

/** Modal de foco: tela AO VIVO + toque, metadados e controles reais (adb). */
export default function FocusModal({ device, onClose, onAction }) {
  const [txt, setTxt] = useState("");
  const [url, setUrl] = useState("");
  const [rot, setRot] = useState(0);
  const [msg, setMsg] = useState("");
  const apkInput = useRef(null);

  const rec = useRecorder();
  const [saveName, setSaveName] = useState("");   // nome p/ salvar o fluxo gravado
  const [showSaved, setShowSaved] = useState(false);
  const [saved, setSaved] = useState([]);          // fluxos salvos no servidor
  const [run, setRun] = useState(null);            // resultado da execução de um fluxo salvo

  // carrega a lista de fluxos salvos quando o painel abre
  useEffect(() => {
    if (showSaved) listSavedScripts().then((r) => setSaved(r?.scripts || [])).catch(() => {});
  }, [showSaved]);

  if (!device) return null;

  const online = device.status === "online";

  const onApk = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(`Enviando ${file.name}…`);
    const up = await uploadApk(file);
    if (!up?.ok) return setMsg(`Falha no upload: ${up?.error || "?"}`);
    setMsg(`Instalando ${up.name}…`);
    const r = await installApk(device.id, up.token);
    setMsg(r?.ok ? `✓ ${up.name} instalado` : `✕ ${r?.error || "falha"}`);
  };

  const recordVideo = () => { setMsg("Gravando… (download ao terminar)"); window.open(recordUrl(device.id, 10), "_blank"); };

  // --- gravação de fluxo (mini-DSL) ---
  const startRec = () => { setRun(null); setShowSaved(false); rec.start(); };
  const stopRec = () => {
    rec.stop();
    // sugere o nome do processo/app em foco como nome do fluxo
    const sug = device.app && device.app !== "—" ? device.app : device.name;
    setSaveName(sug || "");
  };
  const persist = async () => {
    const text = rec.toScript();
    if (!text.trim()) { setMsg("Nada gravado."); return; }
    const r = await saveScript({ name: saveName, text, device: device.model });
    if (r?.ok) { setMsg(`✓ fluxo "${r.script.name}" salvo`); rec.reset(); setSaveName(""); if (showSaved) setSaved((s) => [r.script, ...s]); }
    else setMsg(`✕ ${r?.error || "falha ao salvar"}`);
  };

  // grava a tecla/ação ao disparar (só quando gravando)
  const fireKey = (action) => { onAction?.(device.id, action); if (rec.recording && action) rec.record(`key ${action}`); };
  const fireText = (str) => { typeText(device.id, str); if (rec.recording) rec.record(`text ${str}`); };
  const fireUrl = (u) => { openUrl(device.id, u); if (rec.recording) rec.record(`openurl ${u}`); };
  const fireRotate = () => {
    const d = (rot + 90) % 360; setRot(d); rotate(device.id, d);
    if (rec.recording) rec.record(`rotate ${d}`);
  };

  // --- fluxos salvos ---
  const runSaved = async (s) => {
    setRun({ id: s.id, name: s.name, running: true });
    const r = await runScript(device.id, s.text);
    setRun({ id: s.id, name: s.name, running: false, ...r });
  };
  const removeSaved = async (s) => {
    const r = await deleteScript(s.id);
    if (r?.ok) setSaved((list) => list.filter((x) => x.id !== s.id));
  };

  const meta = [
    ["Modelo", device.model],
    ["OS", device.os],
    ["Tipo", device.kind],
    ["Status", device.status],
    ["Teste", device.test],
    ["adb", `${device.ip}:${device.port}`],
  ];

  const ctrl = (label, action) => (
    <button
      onClick={() => fireKey(action)}
      className="text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
    >
      {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="flex gap-6 items-stretch" onClick={(e) => e.stopPropagation()}>
        <div className="w-[250px] aspect-[9/19] rounded-[2rem] bg-black p-2 ring-2 ring-slate-700 shadow-2xl">
          <div className="h-full w-full overflow-hidden rounded-[1.6rem]">
            {online ? (
              <LiveScreen device={device} fps={5} width={540} quality={70} interactive onRecord={rec.recording ? rec.record : undefined} />
            ) : (
              <FakeScreen device={device} />
            )}
          </div>
        </div>

        <div className="w-64 text-slate-300 self-center space-y-3">
          <h2 className="text-lg font-semibold text-white">{device.name}</h2>
          {online && <p className="text-[10px] text-slate-500 -mt-2">clique/arraste na tela = toque real</p>}
          {meta.map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm border-b border-slate-800 pb-1">
              <span className="text-slate-500">{k}</span>
              <span>{v}</span>
            </div>
          ))}

          <div className="grid grid-cols-4 gap-2 pt-1">
            {ctrl("◁ Back", "back")}
            {ctrl("○ Home", "home")}
            {ctrl("▢ Recent", "recents")}
            {ctrl("⏻ Power", "power")}
            {ctrl("🔊 Vol+", "volup")}
            {ctrl("🔉 Vol−", "voldown")}
            <button
              onClick={fireRotate}
              className="text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white col-span-2"
            >
              ⟳ Girar
            </button>
          </div>

          {/* digitar texto no device */}
          <div className="flex gap-1">
            <input
              value={txt}
              onChange={(e) => setTxt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && txt) { fireText(txt); setTxt(""); } }}
              placeholder="digitar no device…"
              className="flex-1 bg-slate-900 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-sky-500"
            />
            <button
              onClick={() => { if (txt) { fireText(txt); setTxt(""); } }}
              className="text-xs px-3 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              ⌨
            </button>
          </div>

          {/* abrir URL no device */}
          <div className="flex gap-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && url) { fireUrl(url); } }}
              placeholder="abrir URL (https://…)"
              className="flex-1 bg-slate-900 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-sky-500"
            />
            <button
              onClick={() => { if (url) fireUrl(url); }}
              className="text-xs px-3 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              ↗
            </button>
          </div>

          {/* instalar APK + gravar vídeo */}
          <div className="flex gap-2">
            <input ref={apkInput} type="file" accept=".apk" className="hidden" onChange={onApk} />
            <button
              onClick={() => apkInput.current?.click()}
              className="flex-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              📦 Instalar APK
            </button>
            <button
              onClick={recordVideo}
              className="flex-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              ⏺ Gravar 10s
            </button>
          </div>

          {/* ---- gravador de fluxo (mini-DSL) ---- */}
          {online && (
            <div className="rounded-lg bg-slate-950/60 ring-1 ring-slate-800 p-2 space-y-2">
              <div className="flex items-center gap-2">
                {!rec.recording ? (
                  <button
                    onClick={startRec}
                    className="flex-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white"
                  >
                    ⏯ Gravar fluxo
                  </button>
                ) : (
                  <button
                    onClick={stopRec}
                    className="flex-1 text-xs py-2 rounded-lg bg-rose-600 text-white flex items-center justify-center gap-1.5"
                  >
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse-dot" /> Parar ({rec.count})
                  </button>
                )}
                <button
                  onClick={() => setShowSaved((v) => !v)}
                  className={`text-xs px-3 py-2 rounded-lg ${showSaved ? "bg-sky-600 text-white" : "bg-slate-800 hover:bg-sky-600 hover:text-white"}`}
                  title="fluxos salvos"
                >
                  📜
                </button>
              </div>

              {rec.recording && (
                <p className="text-[10px] text-slate-500">
                  toques, teclas, texto, URL e rotação viram passos do roteiro.
                </p>
              )}

              {/* salvar fluxo recém-gravado */}
              {!rec.recording && rec.count > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-slate-400">{rec.count} ação(ões) gravada(s)</p>
                  <div className="flex gap-1">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="nome do fluxo (processo)…"
                      className="flex-1 bg-slate-900 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-sky-500"
                    />
                    <button
                      onClick={persist}
                      disabled={!saveName.trim()}
                      className="text-xs px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40"
                    >
                      💾
                    </button>
                    <button
                      onClick={() => { rec.reset(); setSaveName(""); }}
                      className="text-xs px-2 rounded-lg bg-slate-800 hover:bg-slate-700"
                      title="descartar"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* lista de fluxos salvos */}
              {showSaved && (
                <div className="space-y-1 max-h-44 overflow-auto">
                  {saved.length === 0 && <p className="text-[10px] text-slate-600">nenhum fluxo salvo.</p>}
                  {saved.map((s) => (
                    <div key={s.id} className="flex items-center gap-1 bg-slate-900/70 rounded-lg px-2 py-1">
                      <span className="flex-1 truncate text-[11px]" title={s.device || ""}>{s.name}</span>
                      <button
                        onClick={() => runSaved(s)}
                        className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-sky-600 hover:text-white"
                        title="rodar neste device"
                      >
                        ▶
                      </button>
                      <button
                        onClick={() => removeSaved(s)}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-600 hover:text-white"
                        title="excluir"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* resultado da execução de um fluxo salvo */}
              {run && (
                <div className="text-[11px] bg-slate-900/70 rounded-lg px-2 py-1">
                  <span className="text-slate-300">{run.name}</span>{" "}
                  {run.running ? (
                    <span className="text-sky-400">rodando…</span>
                  ) : (
                    <span className={run.ok ? "text-emerald-400" : "text-rose-400"}>
                      {run.ok ? "✓ ok" : "✕ falhou"} · {run.steps?.filter((s) => s.ok).length}/{run.total}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {msg && <p className="text-[10px] text-slate-400">{msg}</p>}

          {device.kind === "virtual" && (
            <button
              onClick={() => { stopEmulator(device.name); onClose(); }}
              className="w-full py-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-sm"
            >
              ■ Parar emulador
            </button>
          )}
          <button onClick={onClose} className="w-full py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
