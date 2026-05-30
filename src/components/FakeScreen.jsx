import { useEffect, useState } from "react";

/**
 * Tela falsa animada de um device. Placeholder do stream real (ws-scrcpy / WebRTC)
 * que entra na Fase 1. `small` = versão compacta usada nas linhas da lista.
 */
export default function FakeScreen({ device, small = false }) {
  const [clock, setClock] = useState("12:00");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      );
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  if (device.status === "offline")
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-1 bg-slate-900 text-slate-600">
        <div className="text-2xl">⏻</div>
        {!small && <div className="text-[10px] uppercase tracking-widest">offline</div>}
      </div>
    );

  if (device.status === "booting")
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-black text-slate-400">
        <div className="h-6 w-6 rounded-full border-2 border-slate-700 border-t-sky-400 animate-spin" />
        {!small && <div className="text-[9px] uppercase tracking-widest">booting…</div>}
      </div>
    );

  const hue = (device.id.charCodeAt(4) * 47) % 360;

  return (
    <div
      className="relative h-full w-full overflow-hidden scanline"
      style={{
        background: `linear-gradient(160deg,hsl(${hue} 45% 14%),hsl(${(hue + 40) % 360} 50% 8%))`,
      }}
    >
      <div className="flex items-center justify-between px-2 pt-1 text-[8px] text-white/80">
        <span>{clock}</span>
        <span>
          {device.kind === "virtual" ? "VIRT" : "5G"} {device.battery}%
        </span>
      </div>

      {device.test === "running" && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] text-sky-300 bg-black/50 px-2 py-1 rounded z-20">
          running suite…
        </div>
      )}

      <div className="px-2 pt-2 space-y-1">
        {!small && <div className="text-white/90 text-[11px] font-semibold">{device.app}</div>}
        <div className="overflow-hidden" style={{ height: small ? 60 : 110 }}>
          <div className="animate-drift space-y-1.5">
            {Array.from({ length: 8 }).map((_, k) => (
              <div key={k} className="flex items-center gap-1.5">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ background: `hsl(${(hue + k * 30) % 360} 60% 55%)` }}
                />
                <div className="flex-1 space-y-1">
                  <div className="h-1 rounded bg-white/25" style={{ width: `${50 + ((k * 17) % 45)}%` }} />
                  <div className="h-1 rounded bg-white/10" style={{ width: `${30 + ((k * 11) % 40)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {!small && (
        <div className="absolute bottom-1 inset-x-0 flex justify-center gap-5 text-white/40 text-[10px]">
          ◁ ○ ▢
        </div>
      )}
    </div>
  );
}
