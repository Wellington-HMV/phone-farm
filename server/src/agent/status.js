// Diz como terminou um `claude -p --output-format json` (porte de
// scripts/agent_status.py do mobile-agent-testers, MIT).

const PATTERNS = [
  ["usage_limit", /hit your (?:[\w-]+ )?limit|usage limit|limit reached|weekly limit/i],
  ["auth", /invalid api key|authentication_error|oauth token|please run \/login|api error: 401|invalid bearer token|not logged in/i],
  ["credit", /credit balance is too low|insufficient[_ ](?:credit|balance|quota)|billing/i],
  ["rate_limit", /rate_limit_error|api error: 429|too many requests/i],
  ["overloaded", /overloaded_error|api error: 529|overloaded/i],
];

export const STATUS_LABEL = {
  finished: "concluído",
  max_turns: "usou todos os turnos",
  usage_limit: "parou no limite de uso do Claude",
  auth: "login do Claude recusado (rode `claude` e faça login)",
  credit: "sem crédito na API",
  rate_limit: "limite de requisições (rode menos devices juntos)",
  overloaded: "API sobrecarregada, tente depois",
  no_output: "não produziu saída",
  error: "parou com erro",
  cancelled: "cancelado",
};

/** (stdout, stderr) → { status, turns?, costUsd? } */
export function classify(stdout, stderr = "") {
  const raw = String(stdout || "").trim();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (Array.isArray(data)) data = [...data].reverse().find((m) => m && m.type === "result") || null;
  const out = {};
  if (data && typeof data === "object") {
    if (typeof data.num_turns === "number") out.turns = data.num_turns;
    if (typeof data.total_cost_usd === "number") out.costUsd = data.total_cost_usd;
    if (data.subtype === "success" && !data.is_error) return { status: "finished", ...out };
    if (data.subtype === "error_max_turns") return { status: "max_turns", ...out };
  }
  const text = `${data && typeof data === "object" ? data.result || "" : raw}\n${stderr}`;
  for (const [status, re] of PATTERNS) if (re.test(text)) return { status, ...out };
  return { status: data && typeof data === "object" ? "error" : "no_output", ...out };
}
