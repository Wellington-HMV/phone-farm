// Checagem de acessibilidade de uma tela Android (porte de scripts/a11y.py do
// mobile-agent-testers, MIT). Aponta dois problemas:
//  - controles sem nome (nada p/ o TalkBack ler),
//  - alvos de toque menores que 48 dp.
// Ignora elementos cortados pela borda de lista rolável/tela e contêineres grandes.
// Retorna 1 linha, ou null quando a tela passa.

import { bounds } from "./uixml.js";

const MAX_LISTED = 4;
const MIN_DP = 48;

function nameOf(n) {
  const stack = [n];
  while (stack.length) {
    const m = stack.shift();
    const t = (m.attrs.text || "").trim() || (m.attrs["content-desc"] || "").trim();
    if (t) return t;
    stack.unshift(...m.children.filter((c) => c.tag === "node"));
  }
  return "";
}

function cut([x1, y1, x2, y2], frames, smallIsHeight) {
  return frames.some(([fx1, fy1, fx2, fy2]) =>
    smallIsHeight ? y1 <= fy1 || y2 >= fy2 : x1 <= fx1 || x2 >= fx2
  );
}

function line(noname, small) {
  const parts = [];
  if (noname.length) {
    const at = noname.slice(0, MAX_LISTED).map(([x, y]) => `(${x},${y})`).join(" ");
    const more = noname.length > MAX_LISTED ? ` e mais ${noname.length - MAX_LISTED}` : "";
    parts.push(`${noname.length} controle(s) sem nome em ${at}${more}`);
  }
  if (small.length) {
    const at = small
      .slice(0, MAX_LISTED)
      .map((s) => `${s.name ? `"${s.name}" ` : ""}${s.w}x${s.h} dp em (${s.x},${s.y})`)
      .join(", ");
    const more = small.length > MAX_LISTED ? ` e mais ${small.length - MAX_LISTED}` : "";
    parts.push(`${small.length} alvo(s) de toque abaixo de ${MIN_DP} dp: ${at}${more}`);
  }
  return parts.length ? "checagem de acessibilidade (confirme no screenshot): " + parts.join("; ") : null;
}

/** root: árvore de parseUiXml; density: dpi (`wm density`); w,h: tela em px. */
export function checkAndroid(root, density, w, h) {
  const noname = [];
  const small = [];
  const seen = new Set();
  const screen = [0, 0, w, h];

  const visit = (n, scrolls) => {
    const b = bounds(n);
    if (b && n.attrs.scrollable === "true") scrolls = [...scrolls, b];
    const active =
      n.attrs.clickable === "true" || n.attrs["long-clickable"] === "true" || n.attrs.checkable === "true";
    if (b && active && n.attrs.enabled !== "false") {
      const [x1, y1, x2, y2] = b;
      const key = b.join(",");
      if (x2 > x1 && y2 > y1 && !seen.has(key)) {
        seen.add(key);
        const cx = Math.floor((x1 + x2) / 2);
        const cy = Math.floor((y1 + y2) / 2);
        const name = nameOf(n);
        const big = (x2 - x1) * (y2 - y1) > 0.4 * w * h;
        if (!name && !big) noname.push([cx, cy]);
        const wdp = Math.round(((x2 - x1) * 160) / density);
        const hdp = Math.round(((y2 - y1) * 160) / density);
        if (Math.min(wdp, hdp) < MIN_DP && !cut(b, [...scrolls, screen], hdp <= wdp)) {
          small.push({ name: name.slice(0, 30), w: wdp, h: hdp, x: cx, y: cy });
        }
      }
    }
    for (const c of n.children) if (c.tag === "node") visit(c, scrolls);
  };

  for (const top of root.children) {
    // hierarchy -> nodes
    for (const n of top.tag === "hierarchy" ? top.children : [top]) if (n.tag === "node") visit(n, []);
  }
  return line(noname, small);
}
