import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUiXml, visibleElements } from "./uixml.js";
import { checkAndroid } from "./a11y.js";
import { classify } from "./status.js";
import { summarize, verdict, normalizeTitle } from "./summary.js";
import { assignPersonas, PERSONAS } from "./personas.js";
import { validateRequest, ALLOWED_TOOLS, sameLocale } from "./runner.js";
import { buildBrief } from "./missions.js";
import { escapeInputText } from "./adb.js";

const XML = `UI hierchary dumped to: /sdcard/pf_ui.xml<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" class="android.widget.FrameLayout" clickable="false" bounds="[0,0][1080,2400]">
    <node index="0" text="Entrar &amp; continuar" class="android.widget.Button" clickable="true" enabled="true" bounds="[100,2000][980,2160]" />
    <node index="1" text="" content-desc="" class="android.widget.ImageButton" clickable="true" enabled="true" bounds="[40,100][100,160]" />
    <node index="2" text="" class="android.widget.EditText" clickable="true" bounds="[100,500][980,640]" />
    <node index="3" text="Wi&#8209;Fi" class="android.widget.TextView" clickable="false" bounds="[0,700][500,760]" />
  </node>
</hierarchy>`;

test("parser lê elementos visíveis, entidades e ignora lixo antes do XML", () => {
  const els = visibleElements(parseUiXml(XML));
  assert.deepEqual(els.map((e) => e.kind), ["button", "field", "text"]);
  assert.equal(els[0].label, "Entrar & continuar");
  assert.equal(els[0].x, 540);
  assert.equal(els[0].y, 2080);
  assert.equal(els[2].label, "Wi‑Fi");
});

test("acessibilidade: controle sem nome e alvo pequeno (dpi 420)", () => {
  const line = checkAndroid(parseUiXml(XML), 420, 1080, 2400);
  // ícone sem descrição + campo sem rótulo: ambos mudos p/ o TalkBack
  assert.match(line, /2 controle\(s\) sem nome em \(70,130\) \(540,570\)/);
  assert.match(line, /23x23 dp em \(70,130\)/);
  assert.match(line, /alvo\(s\) de toque abaixo de 48 dp/);
});

test("acessibilidade: tela boa passa", () => {
  const ok = `<hierarchy><node text="OK" clickable="true" bounds="[100,1000][980,1200]"/></hierarchy>`;
  assert.equal(checkAndroid(parseUiXml(ok), 420, 1080, 2400), null);
});

test("status do claude -p", () => {
  assert.equal(classify(JSON.stringify({ subtype: "success", num_turns: 40, total_cost_usd: 0.31 })).status, "finished");
  assert.equal(classify(JSON.stringify({ subtype: "error_max_turns" })).status, "max_turns");
  assert.equal(classify("", "Error: API Error: 429 too many requests").status, "rate_limit");
  assert.equal(classify("", "").status, "no_output");
  const c = classify(JSON.stringify([{ type: "x" }, { type: "result", subtype: "success", num_turns: 3 }]));
  assert.deepEqual(c, { status: "finished", turns: 3 });
});

test("resumo agrupa títulos iguais e ordena por severidade", () => {
  const s = summarize([
    { deviceId: "e1", persona: { id: "lucia" }, findings: { score: 6, issues: [
      { title: "Botão 'Salvar' cortado", severity: "minor", screens: ["03"] },
      { title: "App fecha ao enviar foto", severity: "blocker", screens: ["09"] },
    ] } },
    { deviceId: "e2", persona: { id: "rafa" }, findings: { score: 8, issues: [
      { title: "botao salvar cortado", severity: "major", screens: ["05"] },
    ] } },
    { deviceId: "e3", persona: { id: "jorge" }, findings: null },
  ]);
  assert.equal(s.issues.length, 2);
  assert.equal(s.issues[0].severity, "blocker");
  assert.equal(s.issues[1].hits.length, 2);
  assert.equal(s.issues[1].severity, "major");
  assert.equal(s.avgScore, 7);
  assert.equal(normalizeTitle("Botão 'Salvar' cortado"), "botao salvar cortado");
});

test("veredito pass/fail", () => {
  assert.equal(verdict(null), "fail");
  assert.equal(verdict({ issues: [{ severity: "minor" }] }), "pass");
  assert.equal(verdict({ issues: [{ severity: "Major" }] }), "fail");
  assert.equal(verdict({ issues: [], reproduced: "yes" }), "fail");
  // viu pouco: sem nada grave, mas estourou turnos → incerto, não pass
  assert.equal(verdict({ issues: [] }, "max_turns"), "uncertain");
  assert.equal(verdict({ issues: [{ severity: "minor" }] }, "finished"), "pass");
  assert.equal(verdict({ issues: [{ severity: "major" }] }, "max_turns"), "fail");
  assert.equal(verdict({ issues: [], reproduced: "unclear" }), "uncertain");
});

test("personas ciclam pelos devices", () => {
  const a = assignPersonas(["a", "b", "c"], ["rafa", "jorge"]);
  assert.deepEqual(a.map((x) => x.persona.id), ["rafa", "jorge", "rafa"]);
  assert.equal(assignPersonas(["a"], [])[0].persona.id, PERSONAS[0].id);
});

test("validação do pedido", () => {
  assert.match(validateRequest({}).error, /device/);
  assert.match(validateRequest({ deviceIds: ["e"], appId: "x; rm -rf" }).error, /pacote/);
  assert.match(validateRequest({ deviceIds: ["e"], appId: "com.a.b", mission: "reproduce" }).error, /bug/);
  assert.match(validateRequest({ deviceIds: ["e"], appId: "com.a.b", model: "gpt" }).error, /modelo/);
  const ok = validateRequest({ deviceIds: ["e"], appId: "com.a.b", maxTurns: 9999, personas: ["rafa", "nada"] });
  assert.equal(ok.maxTurns, 400);
  assert.deepEqual(ok.personas, ["rafa"]);
  assert.equal(ok.mission, "explore");
});

test("agente não recebe adb livre", () => {
  assert.ok(!ALLOWED_TOOLS.some((t) => /adb|Bash\(\*|^Bash$/.test(t)));
});

test("brief avisa quando o idioma não foi aplicado", () => {
  const p = PERSONAS.find((x) => x.id === "mike");
  assert.match(buildBrief({ mission: "explore", persona: p, applied: { locale: false } }), /NÃO aplicado/);
  assert.match(buildBrief({ mission: "feature", persona: p, applied: { locale: true }, featureText: "Agendar corte" }), /Agendar corte/);
});

test("texto p/ adb: sem acentos, escapado", () => {
  assert.equal(escapeInputText("café & teste"), "cafe%s\\&%steste");
});

test("idioma: vazio nunca conta como igual", () => {
  assert.equal(sameLocale("", "pt-BR"), false);
  assert.equal(sameLocale("pt_BR", "pt-br"), true);
  assert.equal(sameLocale("en-US", "pt-BR"), false);
});
