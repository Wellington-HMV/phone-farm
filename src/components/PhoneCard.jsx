import FakeScreen from "./FakeScreen.jsx";
import LiveScreen from "./LiveScreen.jsx";
import { STATUS_DOT, TEST_BADGE } from "../data/mock.js";

/** Card de device para o modo grade. */
export default function PhoneCard({ device, selected, onSelect, onFocus, live = false }) {
  const tb = TEST_BADGE[device.test];
  const showLive = live && device.status === "online";

  return (
    <div
      onClick={() => onSelect(device.id)}
      onDoubleClick={() => onFocus(device)}
      title="clique = selecionar · duplo-clique = expandir"
      className={`group relative rounded-2xl p-2 cursor-pointer transition ${
        selected
          ? "ring-2 ring-sky-400 bg-slate-800/80"
          : "ring-1 ring-slate-800 bg-slate-900/60 hover:ring-slate-600"
      }`}
    >
      <div className="flex items-center justify-between px-1 pb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`h-2 w-2 rounded-full ${STATUS_DOT[device.status]} ${
              device.status === "online" ? "animate-pulse-dot" : ""
            }`}
          />
          <span className="text-xs text-slate-200 font-medium truncate" title={`${device.name} · ${device.id}`}>{device.name}</span>
        </div>
        <span className={`text-[9px] px-1.5 py-0.5 rounded ${tb.c}`}>{tb.t}</span>
      </div>

      <div
        onDoubleClick={(e) => { e.stopPropagation(); onFocus(device); }}
        title="duplo-clique p/ expandir (tela ao vivo + controle)"
        className="relative mx-auto w-full max-w-[140px] aspect-[9/19] rounded-[1.3rem] bg-black p-1.5 shadow-xl ring-1 ring-slate-700 group-hover:ring-sky-500/40"
      >
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-1.5 w-9 rounded-full bg-slate-800 z-10" />
        <div className="h-full w-full overflow-hidden rounded-[1rem]">
          {showLive ? <LiveScreen device={device} fps={2} width={240} quality={55} /> : <FakeScreen device={device} />}
        </div>
      </div>

      <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-slate-500">
        <span className="truncate">{device.os}</span>
        <span className="truncate ml-1 font-mono opacity-70">{device.apk || device.id}</span>
      </div>

      <div className="absolute inset-x-2 bottom-9 flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
        {["◁", "○", "▢", "⤢"].map((c, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              if (c === "⤢") onFocus(device);
            }}
            className="h-6 w-6 rounded-md bg-slate-950/80 text-slate-300 text-xs hover:bg-sky-600 hover:text-white"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
