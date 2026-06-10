import { useEffect, useRef, useState } from "react";
import { KEY } from "../webusb/webadb.js";

/**
 * Espelho ao vivo de um device USB (via WebUSB ADB), com toque/arraste e teclas.
 * Loop de screencap (PNG) renderizado num <img>; o PNG já vem na resolução real
 * do device, então mapeamos o clique pela dimensão natural da imagem.
 */
export default function UsbMirror({ conn, onClose }) {
  const imgRef = useRef(null);
  const aliveRef = useRef(true);
  const urlRef = useRef(null);
  const dragRef = useRef(null); // {x,y,t} do pointerdown (coords device)
  const [model, setModel] = useState("device USB");
  const [err, setErr] = useState("");

  useEffect(() => {
    aliveRef.current = true;
    conn.model().then(setModel).catch(() => {});

    (async function loop() {
      while (aliveRef.current) {
        try {
          const blob = await conn.screencap();
          if (!aliveRef.current) break;
          const url = URL.createObjectURL(blob);
          if (imgRef.current) imgRef.current.src = url;
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = url;
        } catch (e) {
          if (aliveRef.current) setErr("Stream parou: " + e.message + " (device desconectado?)");
          break;
        }
        await new Promise((res) => setTimeout(res, 120)); // ~8 fps
      }
    })();

    return () => {
      aliveRef.current = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [conn]);

  /** Converte coords do clique p/ pixels do device (dimensão natural da img). */
  const toDevice = (e) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return null;
    const rect = img.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * img.naturalWidth,
      y: ((e.clientY - rect.top) / rect.height) * img.naturalHeight,
    };
  };

  const onDown = (e) => {
    const p = toDevice(e);
    if (p) dragRef.current = { ...p, t: Date.now() };
  };
  const onUp = (e) => {
    const start = dragRef.current;
    dragRef.current = null;
    const end = toDevice(e);
    if (!start || !end) return;
    const dist = Math.hypot(end.x - start.x, end.y - start.y);
    const ms = Math.max(50, Date.now() - start.t);
    if (dist < 12) conn.tap(end.x, end.y).catch(() => {});
    else conn.swipe(start.x, start.y, end.x, end.y, Math.min(ms, 800)).catch(() => {});
  };

  const close = async () => {
    aliveRef.current = false;
    try {
      await conn.close();
    } catch {}
    onClose();
  };

  const KeyBtn = ({ code, label, title }) => (
    <button
      onClick={() => conn.key(code).catch(() => {})}
      title={title}
      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-sm"
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-slate-900 ring-1 ring-slate-700 rounded-2xl p-4 max-h-full flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🔌</span>
          <div className="text-sm">
            <div className="font-medium">{model}</div>
            <div className="text-[11px] text-slate-500 font-mono">{conn.serial}</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
            USB · WebUSB
          </span>
          <div className="flex-1" />
          <button onClick={close} className="text-slate-400 hover:text-rose-300 text-sm px-2">
            ✕ Desconectar
          </button>
        </div>

        {err ? (
          <div className="text-rose-400 text-sm py-10 px-6 text-center max-w-sm">{err}</div>
        ) : (
          <img
            ref={imgRef}
            alt="tela do device"
            draggable={false}
            onPointerDown={onDown}
            onPointerUp={onUp}
            className="rounded-lg bg-black select-none touch-none cursor-pointer"
            style={{ maxHeight: "70vh", maxWidth: "min(90vw, 420px)" }}
          />
        )}

        <div className="flex items-center justify-center gap-2 flex-wrap">
          <KeyBtn code={KEY.back} label="◁ Back" title="voltar" />
          <KeyBtn code={KEY.home} label="⌂ Home" title="início" />
          <KeyBtn code={KEY.recents} label="▢ Recentes" title="apps recentes" />
          <KeyBtn code={KEY.power} label="⏻ Power" title="tela on/off" />
          <KeyBtn code={KEY.volup} label="🔊+" title="volume +" />
          <KeyBtn code={KEY.voldown} label="🔉−" title="volume −" />
        </div>
        <p className="text-[11px] text-slate-600 text-center">
          Clique = toque · arraste = swipe. Tudo roda no seu PC; nada sai do navegador.
        </p>
      </div>
    </div>
  );
}
