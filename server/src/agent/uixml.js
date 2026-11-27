// Parser mínimo do XML do `uiautomator dump` (sem dependência).
// O formato é simples: <hierarchy><node attr="…"><node …/></node></hierarchy>.
// Devolve uma árvore { tag, attrs, children }.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function parseAttrs(src) {
  const attrs = {};
  for (const m of src.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = decode(m[2]);
  return attrs;
}

/** XML → árvore. Lixo antes do primeiro "<" (avisos do adb) é ignorado. */
export function parseUiXml(xml) {
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const text = String(xml || "");
  const start = text.indexOf("<");
  if (start === -1) return root;
  for (const m of text.slice(start).matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, rest, selfClose] = m;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const el = { tag, attrs: parseAttrs(rest), children: [] };
    stack[stack.length - 1].children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}

/** Itera todos os <node> (pré-ordem). */
export function* iterNodes(el) {
  for (const c of el.children) {
    if (c.tag === "node") yield c;
    yield* iterNodes(c);
  }
}

/** "[x1,y1][x2,y2]" → [x1,y1,x2,y2] ou null. */
export function bounds(node) {
  const b = (node.attrs.bounds || "").match(/-?\d+/g);
  return b && b.length === 4 ? b.map(Number) : null;
}

/** Elementos visíveis úteis p/ o agente: texto, descrição ou campo editável. */
export function visibleElements(root) {
  const out = [];
  for (const n of iterNodes(root)) {
    const text = (n.attrs.text || "").trim();
    const desc = (n.attrs["content-desc"] || "").trim();
    const field = (n.attrs.class || "").endsWith("EditText");
    const b = bounds(n);
    if (!(text || desc || field) || !b) continue;
    const [x1, y1, x2, y2] = b;
    const kind = field ? "field" : n.attrs.clickable === "true" ? "button" : "text";
    out.push({ kind, label: (text || desc).slice(0, 70), x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) });
  }
  return out;
}
