import { useRef, useState } from "react";
import FakeScreen from "./FakeScreen.jsx";
import LiveScreen from "./LiveScreen.jsx";
import { stopEmulator, typeText, openUrl, rotate, uploadApk, installApk, recordUrl } from "../api/client.js";

/** Modal de foco: tela AO VIVO + toque, metadados e controles reais (adb). */
export default function FocusModal({ device, onClose, onAction }) {
  const [txt, setTxt] = useState("");
  const [url, setUrl] = useState("");
  const [rot, setRot] = useState(0);
  const [msg, setMsg] = useState("");
  const apkInput = useRef(null);
  if (!device) return null;

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

  const record = () => { setMsg("Gravando… (download ao terminar)"); window.open(recordUrl(device.id, 10), "_blank"); };

  const online = device.status === "online";
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
      onClick={() => action && onAction?.(device.id, action)}
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
            {online ? <LiveScreen device={device} fps={5} width={540} quality={70} interactive /> : <FakeScreen device={device} />}
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
              onClick={() => { const d = (rot + 90) % 360; setRot(d); rotate(device.id, d); }}
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
              onKeyDown={(e) => { if (e.key === "Enter" && txt) { typeText(device.id, txt); setTxt(""); } }}
              placeholder="digitar no device…"
              className="flex-1 bg-slate-900 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-sky-500"
            />
            <button
              onClick={() => { if (txt) { typeText(device.id, txt); setTxt(""); } }}
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
              onKeyDown={(e) => { if (e.key === "Enter" && url) { openUrl(device.id, url); } }}
              placeholder="abrir URL (https://…)"
              className="flex-1 bg-slate-900 ring-1 ring-slate-800 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-sky-500"
            />
            <button
              onClick={() => { if (url) openUrl(device.id, url); }}
              className="text-xs px-3 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              ↗
            </button>
          </div>

          {/* instalar APK + gravar tela */}
          <div className="flex gap-2">
            <input ref={apkInput} type="file" accept=".apk" className="hidden" onChange={onApk} />
            <button
              onClick={() => apkInput.current?.click()}
              className="flex-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              📦 Instalar APK
            </button>
            <button
              onClick={record}
              className="flex-1 text-xs py-2 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white"
            >
              ⏺ Gravar 10s
            </button>
          </div>
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
