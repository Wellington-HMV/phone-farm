import { useEffect, useState } from "react";
import { listImages, createEmulator } from "../api/client.js";

/** Modal de provisionamento de AVD: nome + versão (system-image) + perfil de device. */
export default function ProvisionModal({ open, onClose }) {
  const [images, setImages] = useState([]);
  const [devices, setDevices] = useState([]);
  const [name, setName] = useState("farm-phone");
  const [pkg, setPkg] = useState("");
  const [device, setDevice] = useState("pixel_7");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    listImages()
      .then((d) => {
        setImages(d.images || []);
        setDevices(d.devices || []);
        if (d.images?.[0]) setPkg(d.images[0].pkg);
      })
      .catch(() => setErr("falha ao listar imagens"));
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await createEmulator(name.trim(), { pkg, device });
      if (r?.ok) onClose(true);
      else setErr(r?.error || "falha ao criar");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full bg-slate-900 ring-1 ring-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-sky-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => onClose(false)}>
      <div className="w-[360px] bg-slate-900 ring-1 ring-slate-700 rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white">Provisionar emulador</h2>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Nome</span>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="farm-phone" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Versão Android (system-image)</span>
          <select className={field} value={pkg} onChange={(e) => setPkg(e.target.value)}>
            {images.length === 0 && <option value="">nenhuma instalada</option>}
            {images.map((im) => (
              <option key={im.pkg} value={im.pkg}>{im.label}</option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-slate-400">Perfil de device</span>
          <select className={field} value={device} onChange={(e) => setDevice(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>

        {err && <p className="text-xs text-rose-400">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={() => onClose(false)} className="flex-1 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !pkg}
            className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Criando…" : "Criar + subir"}
          </button>
        </div>
        <p className="text-[10px] text-slate-500">Criar um AVD novo pode levar alguns segundos; o boot aparece como “booting” na grade.</p>
      </div>
    </div>
  );
}
