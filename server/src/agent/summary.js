// Junta os findings.json de todos os devices de uma execução num resumo:
// problemas do mais grave ao menos grave, com quantas personas viram cada um.
// Ideia do scripts/summarize.py do mobile-agent-testers (MIT); aqui o
// agrupamento é só por título normalizado (sem chamada extra ao modelo).

export const SEVERITY_ORDER = ["blocker", "major", "minor", "cosmetic"];
const IMPACT_ORDER = ["high", "medium", "low"];

const rank = (list, v) => {
  const i = list.indexOf(String(v || "").toLowerCase());
  return i === -1 ? list.length : i;
};

export function normalizeTitle(t) {
  return String(t || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * agents: [{ deviceId, persona: {id,nome}, findings: {score, issues, reproduced, improvements, goal_reached} | null }]
 */
export function summarize(agents) {
  const groups = new Map();
  const improvements = [];
  const personas = [];

  for (const a of agents) {
    const f = a.findings || {};
    personas.push({
      deviceId: a.deviceId,
      persona: a.persona?.id,
      nome: a.persona?.nome,
      score: typeof f.score === "number" ? f.score : null,
      goalReached: f.goal_reached ?? null,
      reproduced: f.reproduced ?? null,
      evidence: Array.isArray(f.evidence) ? f.evidence : [],
      note: f.note ?? null,
      issues: Array.isArray(f.issues) ? f.issues.length : 0,
    });
    for (const it of Array.isArray(f.issues) ? f.issues : []) {
      const key = normalizeTitle(it.title);
      if (!key) continue;
      const g = groups.get(key) || { title: it.title, severity: it.severity, screen: it.screen, hits: [] };
      if (rank(SEVERITY_ORDER, it.severity) < rank(SEVERITY_ORDER, g.severity)) g.severity = it.severity;
      g.hits.push({ deviceId: a.deviceId, persona: a.persona?.id, screens: Array.isArray(it.screens) ? it.screens : [] });
      groups.set(key, g);
    }
    for (const imp of Array.isArray(f.improvements) ? f.improvements : []) {
      improvements.push({ ...imp, deviceId: a.deviceId, persona: a.persona?.id });
    }
  }

  const issues = [...groups.values()].sort(
    (a, b) => rank(SEVERITY_ORDER, a.severity) - rank(SEVERITY_ORDER, b.severity) || b.hits.length - a.hits.length
  );
  improvements.sort((a, b) => rank(IMPACT_ORDER, a.impact) - rank(IMPACT_ORDER, b.impact));
  const scores = personas.map((p) => p.score).filter((s) => s !== null);
  return {
    issues,
    improvements,
    personas,
    bySeverity: Object.fromEntries(SEVERITY_ORDER.map((s) => [s, issues.filter((i) => i.severity === s).length])),
    avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
  };
}

/** Device "falhou" se achou blocker/major, ou se o bug foi reproduzido. */
// pass só quando o agente terminou por conta própria e nada grave apareceu.
// Sem nada grave mas com orçamento estourado (viu pouco) ou reprodução incerta → "uncertain".
export function verdict(findings, status) {
  if (!findings) return "fail";
  if (findings.reproduced === "yes") return "fail";
  const bad = (findings.issues || []).some((i) => ["blocker", "major"].includes(String(i.severity).toLowerCase()));
  if (bad) return "fail";
  if (status === "max_turns" || findings.reproduced === "unclear") return "uncertain";
  return "pass";
}
