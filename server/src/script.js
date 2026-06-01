// Mini-DSL de automação: 1 ação por linha. Linhas vazias e que começam com # são
// ignoradas. Um "execute" opcional no início é descartado.
//
// Ações:
//   key <back|home|recents|power|volup|voldown>
//   tap <x> <y>                      (x,y normalizados 0..1)
//   swipe <x1> <y1> <x2> <y2> [ms]
//   text <texto livre…>
//   openurl <url>
//   rotate <0|90|180|270>
//   wait <ms> | sleep <ms>

export const SCRIPT_ACTIONS = ["key", "tap", "swipe", "text", "openurl", "rotate", "wait", "sleep"];

const EXAMPLE = `# exemplo (roda na home; 'text' só funciona com um campo focado)
key home
wait 500
swipe 0.5 0.8 0.5 0.25 300
wait 600
openurl https://example.com
wait 1500
key home`;
export const SCRIPT_EXAMPLE = EXAMPLE;

/** Parse do roteiro → lista de passos {n, raw, action, args, rest, error?}. */
export function parseScript(text) {
  const steps = [];
  const lines = String(text || "").split(/\r?\n/);
  lines.forEach((line, i) => {
    let raw = line.trim();
    if (!raw || raw.startsWith("#")) return;
    if (/^execute\s+/i.test(raw)) raw = raw.replace(/^execute\s+/i, "");
    const sp = raw.indexOf(" ");
    const action = (sp === -1 ? raw : raw.slice(0, sp)).toLowerCase();
    const rest = sp === -1 ? "" : raw.slice(sp + 1).trim();
    const args = rest ? rest.split(/\s+/) : [];
    const step = { n: i + 1, raw: line.trim(), action, args, rest };
    if (!SCRIPT_ACTIONS.includes(action)) step.error = `ação desconhecida: ${action}`;
    steps.push(step);
  });
  return steps;
}
