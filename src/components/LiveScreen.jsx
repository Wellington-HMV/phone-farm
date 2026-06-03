import { useRef, useState } from "react";
import { streamUrl, tap, swipe } from "../api/client.js";

/**
 * Tela ao vivo de um device via stream MJPEG.
 * `interactive` habilita toque/arraste: clique vira `adb input tap`,
 * arraste vira `input swipe`, mapeando coords da imagem p/ a resolução real.
 * Usa object-contain + cálculo de letterbox p/ o toque cair no lugar certo.
 */
export default function LiveScreen({ device, fps = 3, width = 0, quality = 60, interactive = false, onRecord }) {
  const imgRef = useRef(null);
  const down = useRef(null); // ponto inicial (coords do device)
  const [ok, setOk] = useState(true);
  const [ripple, setRipple] = useState(null); // feedback visual do toque (px no elemento)

  // evento do mouse -> coords NORMALIZADAS (0..1) da tela do device, ciente do
  // letterbox (object-contain). O backend converte p/ pixels reais (wm size),
  // então o downscale do stream não afeta a precisão do toque.
  const toDevice = (e) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return null;
    const r = img.getBoundingClientRect();
    const scale = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const dispW = img.naturalWidth * scale;
    const dispH = img.naturalHeight * scale;
    const offX = (r.width - dispW) / 2; // barras laterais
    const offY = (r.height - dispH) / 2; // barras topo/baixo
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    if (px < offX || px > offX + dispW || py < offY || py > offY + dispH) return null; // na barra
    return {
      nx: (px - offX) / dispW, // 0..1
      ny: (py - offY) / dispH,
      ex: px, // posição no elemento (ripple)
      ey: py,
    };
  };

  const showRipple = (ex, ey) => {
    setRipple({ ex, ey, k: (ripple?.k || 0) + 1 });
    setTimeout(() => setRipple(null), 350);
  };

  const onDown = (e) => {
    if (!interactive) return;
    const p = toDevice(e);
    if (p) down.current = { ...p, t: performance.now() };
  };

  const onUp = (e) => {
    if (!interactive || !down.current) return;
    const a = down.current;
    const b = toDevice(e);
    down.current = null;
    if (!b) return;
    showRipple(b.ex, b.ey);
    const dist = Math.hypot(b.nx - a.nx, b.ny - a.ny); // em fração (0..1)
    const held = performance.now() - a.t;
    const f = (n) => n.toFixed(3);
    if (dist < 0.02) {
      if (held > 450) {
        swipe(device.id, a.nx, a.ny, a.nx, a.ny, 600); // long-press
        onRecord?.(`swipe ${f(a.nx)} ${f(a.ny)} ${f(a.nx)} ${f(a.ny)} 600`);
      } else {
        tap(device.id, a.nx, a.ny);
        onRecord?.(`tap ${f(a.nx)} ${f(a.ny)}`);
      }
    } else {
      swipe(device.id, a.nx, a.ny, b.nx, b.ny, 200); // arraste
      onRecord?.(`swipe ${f(a.nx)} ${f(a.ny)} ${f(b.nx)} ${f(b.ny)} 200`);
    }
  };

  if (!ok)
    return (
      <div className="h-full w-full flex items-center justify-center bg-slate-900 text-slate-600 text-[10px] uppercase tracking-widest">
        sem stream
      </div>
    );

  return (
    <div className="relative h-full w-full bg-black">
      <img
        ref={imgRef}
        src={streamUrl(device.id, { fps, w: width, q: quality })}
        alt={device.name}
        className={`h-full w-full object-contain ${interactive ? "cursor-pointer" : ""}`}
        draggable={false}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onError={() => setOk(false)}
      />
      {ripple && (
        <span
          key={ripple.k}
          className="pointer-events-none absolute h-7 w-7 -ml-3.5 -mt-3.5 rounded-full ring-2 ring-sky-300/90 bg-sky-400/30"
          style={{ left: ripple.ex, top: ripple.ey, animation: "pulse-dot .35s ease-out" }}
        />
      )}
      <span className="absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded bg-rose-600/80 text-white flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-dot" /> AO VIVO
      </span>
    </div>
  );
}
