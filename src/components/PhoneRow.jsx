import FakeScreen from "./FakeScreen.jsx";
import { STATUS_DOT, TEST_BADGE } from "../data/mock.js";

/** Linha de device para o modo lista (denso, escala p/ muitas telas). */
export default function PhoneRow({ device, selected, onSelect, onFocus }) {
  const tb = TEST_BADGE[device.test];

  return (
    <div
      onClick={() => onSelect(device.id)}
      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 cursor-pointer text-sm ${
        selected ? "ring-1 ring-sky-400 bg-slate-800/80" : "bg-slate-900/50 hover:bg-slate-800/50"
      }`}
    >
      <input type="checkbox" readOnly checked={selected} className="accent-sky-500" />
      <div className="w-9 h-14 rounded-md bg-black overflow-hidden ring-1 ring-slate-700 shrink-0">
        <FakeScreen device={device} small />
      </div>
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[device.status]} shrink-0`} />
      <span className="text-slate-200 font-medium w-24 truncate">{device.name}</span>
      <span className="text-slate-400 w-24 truncate">{device.os}</span>
      <span className="text-slate-500 w-28 truncate hidden md:block">{device.model}</span>
      <span className="text-slate-500 w-24 truncate hidden lg:block">{device.apk}</span>
      <span className="text-slate-600 w-28 truncate hidden lg:block">
        {device.ip}:{device.port}
      </span>
      <div className="flex-1" />
      <span className={`text-[10px] px-2 py-0.5 rounded ${tb.c}`}>{tb.t}</span>
      <span
        className={`text-[9px] px-1.5 py-0.5 rounded ${
          device.kind === "virtual" ? "bg-violet-500/20 text-violet-300" : "bg-cyan-500/20 text-cyan-300"
        }`}
      >
        {device.kind}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onFocus(device);
        }}
        className="text-slate-400 hover:text-sky-400 px-1"
      >
        ⤢
      </button>
    </div>
  );
}
