// Agente testador local: um `claude -p` por device, cada um interpretando uma
// persona e testando o app como usuário real. Inspirado no mobile-agent-testers
// (MIT), rodando na máquina em vez do GitHub Actions.
//
// Por device:
//   1. confere o app instalado, aplica a persona (fonte, tema, idioma se der)
//   2. abre o app e monta a pasta do agente (BRIEF.md, tools/)
//   3. roda `claude -p` só com as ferramentas screen/act + Read/Write
//   4. lê findings.json, marca pass/fail no device e restaura as configurações
// Tudo fica em ~/.phone-farm/agent-runs/<run>/<device>/.

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { adbPath } from "../adbPath.js";
import { assignPersonas, PERSONAS } from "./personas.js";
import { buildBrief, MISSIONS } from "./missions.js";
import { classify, STATUS_LABEL } from "./status.js";
import { summarize, verdict } from "./summary.js";

const execP = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RUNS_DIR = process.env.PF_RUNS_DIR || path.join(os.homedir(), ".phone-farm", "agent-runs");
const CLAUDE = process.env.PF_CLAUDE_BIN || "claude";
const AGENT_TIMEOUT_MS = 60 * 60 * 1000;
const MODELS = new Set(["sonnet", "haiku", "opus"]);

/** Ferramentas liberadas ao agente — nada além disto (sem adb livre, sem rede). */
export const ALLOWED_TOOLS = ["Bash(node tools/screen.mjs:*)", "Bash(node tools/act.mjs:*)", "Read", "Write"];

export function validateRequest(body = {}) {
  const deviceIds = Array.isArray(body.deviceIds) ? body.deviceIds.map(String).filter(Boolean) : [];
  if (!deviceIds.length) return { error: "selecione ao menos 1 device" };
  const appId = String(body.appId || "").trim();
  if (!/^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/.test(appId)) return { error: "pacote do app inválido (ex.: com.empresa.app)" };
  const mission = MISSIONS[body.mission] ? body.mission : "explore";
  const text = String(body.text || "").trim();
  if ((mission === "reproduce" || mission === "feature") && !text)
    return { error: mission === "reproduce" ? "descreva o bug a reproduzir" : "descreva a funcionalidade" };
  const model = String(body.model || "sonnet").trim();
  if (!MODELS.has(model) && !/^claude-[\w.-]+$/.test(model)) return { error: "modelo inválido" };
  const maxTurns = Math.min(400, Math.max(20, Number(body.maxTurns) || 150));
  const known = new Set(PERSONAS.map((p) => p.id));
  const personas = (Array.isArray(body.personas) ? body.personas : []).filter((p) => known.has(p));
  return { deviceIds, appId, mission, text: text.slice(0, 4000), model, maxTurns, personas };
}

function adb(serial, args, timeout = 30000) {
  return execP(adbPath(), ["-s", serial, ...args], { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })
    .then((r) => String(r.stdout || ""))
    .catch((e) => String(e.stdout || "") + String(e.stderr || ""));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitBoot(serial) {
  for (let i = 0; i < 60; i++) {
    if ((await adb(serial, ["shell", "getprop", "sys.boot_completed"])).trim() === "1") return true;
    await sleep(3000);
  }
  return false;
}

/** Lê o estado atual p/ restaurar depois. */
async function snapshotSettings(serial) {
  const font = (await adb(serial, ["shell", "settings", "get", "system", "font_scale"])).trim();
  const night = /yes/i.test(await adb(serial, ["shell", "cmd", "uimode", "night"]));
  // emulador novo não tem persist.sys.locale: o idioma vem de ro.product.locale
  const locale =
    (await adb(serial, ["shell", "getprop", "persist.sys.locale"])).trim() ||
    (await adb(serial, ["shell", "getprop", "ro.product.locale"])).trim();
  return { font: /^[\d.]+$/.test(font) ? font : "1.0", night, locale };
}

async function setLocale(serial, locale) {
  const r = await adb(serial, ["root"]);
  if (/cannot run as root|production builds/i.test(r)) return false;
  await sleep(3000);
  await adb(serial, ["wait-for-device"], 60000);
  await adb(serial, ["shell", `setprop persist.sys.locale ${locale}; setprop ctl.restart zygote`]);
  await sleep(10000);
  await adb(serial, ["wait-for-device"], 60000);
  return waitBoot(serial);
}

async function applyPersona(serial, p, before) {
  await adb(serial, ["shell", "settings", "put", "system", "font_scale", String(p.fontScale)]);
  await adb(serial, ["shell", "cmd", "uimode", "night", p.theme === "dark" ? "yes" : "no"]);
  if (sameLocale(before.locale, p.locale)) return { locale: true, changedLocale: false };
  const ok = /^[a-z]{2}-[A-Z]{2}$/.test(p.locale) && (await setLocale(serial, p.locale));
  return { locale: ok, changedLocale: ok };
}

export function sameLocale(a, b) {
  return Boolean(a) && Boolean(b) && a.toLowerCase().replace("_", "-") === b.toLowerCase().replace("_", "-");
}

async function restore(serial, before, applied) {
  await adb(serial, ["shell", "settings", "put", "system", "font_scale", before.font]);
  await adb(serial, ["shell", "cmd", "uimode", "night", before.night ? "yes" : "no"]);
  if (applied.changedLocale && before.locale) await setLocale(serial, before.locale);
}

/** Roda o Claude Code headless na pasta do agente; nunca lança. */
function runClaude(args, { dir, env, onSpawn }) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const child = spawn(CLAUDE, args, { cwd: dir, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    onSpawn(child);
    const to = setTimeout(() => killTree(child), AGENT_TIMEOUT_MS);
    child.stdout.on("data", (d) => { if (out.length < 4e6) out += d; });
    child.stderr.on("data", (d) => { if (err.length < 1e6) err += d; });
    child.on("error", (e) => { clearTimeout(to); resolve({ out, err: err + "\n" + e.message, spawnError: e }); });
    child.on("close", () => { clearTimeout(to); resolve({ out, err }); });
  });
}

function sessionId(out) {
  try {
    const d = JSON.parse(out);
    return typeof d?.session_id === "string" && /^[\w-]+$/.test(d.session_id) ? d.session_id : null;
  } catch {
    return null;
  }
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], () => {});
  else child.kill("SIGTERM");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function createAgentRunner(manager) {
  const runs = new Map(); // id -> run (em memória; disco é a fonte p/ antigas)
  const busy = new Map(); // deviceId -> runId

  const runDir = (id) => path.join(RUNS_DIR, id);

  function persist(run) {
    try {
      fs.mkdirSync(runDir(run.id), { recursive: true });
      const { _children, ...plain } = run;
      fs.writeFileSync(path.join(runDir(run.id), "run.json"), JSON.stringify(plain, null, 2));
    } catch (e) {
      console.error("[agent] falha ao salvar run:", e.message);
    }
  }

  function finishIfDone(run) {
    if (run.agents.some((a) => ["queued", "preparing", "running"].includes(a.state))) return;
    run.state = run.agents.some((a) => a.state === "cancelled") ? "cancelled" : "done";
    run.finishedAt = Date.now();
    run.summary = summarize(run.agents.map((a) => ({ deviceId: a.deviceId, persona: a.persona, findings: a.findings })));
    persist(run);
  }

  async function runAgent(run, agent) {
    const serial = agent.deviceId;
    const dir = path.join(runDir(run.id), serial.replace(/[^\w.-]/g, "_"));
    agent.dir = dir;
    const update = (patch) => {
      Object.assign(agent, patch);
      persist(run);
    };
    let before = null;
    let applied = { locale: false };
    try {
      update({ state: "preparing", startedAt: Date.now() });
      manager.setTest(serial, "running");

      const installed = (await adb(serial, ["shell", "pm", "path", run.appId])).includes("package:");
      if (!installed) throw new Error(`app ${run.appId} não está instalado neste device`);

      before = await snapshotSettings(serial);
      applied = await applyPersona(serial, agent.persona, before);
      agent.applied = applied;

      await adb(serial, ["shell", "am", "force-stop", run.appId]);
      await adb(serial, ["shell", "monkey", "-p", run.appId, "-c", "android.intent.category.LAUNCHER", "1"]);
      await adb(serial, ["logcat", "-c"]);
      await sleep(4000);

      fs.mkdirSync(path.join(dir, "tools"), { recursive: true });
      fs.mkdirSync(path.join(dir, "shots"), { recursive: true });
      for (const t of ["screen", "act"]) {
        const target = pathToFileURL(path.join(HERE, "cli", `${t}.js`)).href;
        fs.writeFileSync(path.join(dir, "tools", `${t}.mjs`), `import ${JSON.stringify(target)};\n`);
      }
      fs.writeFileSync(
        path.join(dir, "BRIEF.md"),
        buildBrief({ mission: run.mission, persona: agent.persona, applied, featureText: run.text })
      );
      if (run.mission === "reproduce") fs.writeFileSync(path.join(dir, "bug_report.md"), run.text);

      const prompt =
        `Leia BRIEF.md e cumpra a missão até o relatório final. APP_ID=${run.appId}. ` +
        `Device ${serial}, fonte x${agent.persona.fontScale}, tema ${agent.persona.theme}. ` +
        `Reporte tudo que não cabe nesta tela (texto cortado, botão fora da tela, layout quebrado). ` +
        `Limite: ${run.maxTurns} turnos no total; cada ação com screenshot gasta uns 3. ` +
        `Escreva report.md e findings.json antes de passar de ${Math.floor(run.maxTurns * 0.8)} turnos.`;
      const flags = [
        "--model", run.model,
        "--output-format", "json",
        "--allowedTools", ...ALLOWED_TOOLS,
        "--setting-sources", "project",
        "--strict-mcp-config",
      ];
      const env = { ...process.env, ANDROID_SERIAL: serial, PF_ADB: adbPath(), APP_ID: run.appId };
      delete env.CLAUDECODE; // permite subir o agente mesmo com o backend aberto de dentro do Claude Code
      const onSpawn = (child) => run._children.set(serial, child);

      update({ state: "running" });
      const result = await runClaude(["-p", prompt, "--max-turns", String(run.maxTurns), ...flags], { dir, env, onSpawn });
      run._children.delete(serial);
      fs.writeFileSync(path.join(dir, "agent-output.json"), result.out);
      fs.writeFileSync(path.join(dir, "agent-errors.txt"), result.err);

      if (agent.state === "cancelled") return;
      if (result.spawnError) throw new Error(`não consegui iniciar o Claude Code (${CLAUDE}): ${result.spawnError.message}`);
      const st = classify(result.out, result.err);
      let cost = st.costUsd || 0;

      // acabou o orçamento sem relatório: retoma a MESMA sessão só p/ escrever o que já viu
      const sid = sessionId(result.out);
      if (!fs.existsSync(path.join(dir, "findings.json")) && sid && ["max_turns", "finished"].includes(st.status)) {
        update({ state: "running", note: "escrevendo relatório" });
        const rescue = await runClaude(
          [
            "-p",
            "Seu orçamento de ações acabou. Pare de testar e escreva AGORA report.md e findings.json " +
              "(formato do BRIEF.md) com tudo o que você já viu, usando os screenshots já tirados.",
            "--resume", sid,
            "--max-turns", "12",
            ...flags,
          ],
          { dir, env, onSpawn }
        );
        run._children.delete(serial);
        fs.writeFileSync(path.join(dir, "agent-output-relatorio.json"), rescue.out);
        cost += classify(rescue.out, rescue.err).costUsd || 0;
        if (agent.state === "cancelled") return;
      }

      const findings = readJson(path.join(dir, "findings.json"));
      const v = verdict(findings, st.status);
      update({
        state: "done",
        note: undefined,
        status: st.status,
        statusLabel: findings ? STATUS_LABEL[st.status] : "terminou sem relatório",
        turns: st.turns,
        costUsd: cost || undefined,
        findings,
        verdict: v,
      });
      manager.setTest(serial, v);
    } catch (e) {
      if (agent.state !== "cancelled") {
        update({ state: "error", error: e.message });
        manager.setTest(serial, "fail");
      }
    } finally {
      if (before) await restore(serial, before, applied).catch(() => {});
      busy.delete(serial);
      agent.finishedAt = Date.now();
      finishIfDone(run);
    }
  }

  function start(body) {
    const req = validateRequest(body);
    if (req.error) return { ok: false, error: req.error };
    const online = new Set(manager.list().filter((d) => d.status === "online").map((d) => d.id));
    const off = req.deviceIds.filter((id) => !online.has(id));
    if (off.length) return { ok: false, error: `device(s) offline: ${off.join(", ")}` };
    const taken = req.deviceIds.filter((id) => busy.has(id));
    if (taken.length) return { ok: false, error: `já tem agente rodando em: ${taken.join(", ")}` };

    const id = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + crypto.randomBytes(2).toString("hex");
    const run = {
      id,
      appId: req.appId,
      mission: req.mission,
      text: req.text,
      model: req.model,
      maxTurns: req.maxTurns,
      state: "running",
      createdAt: Date.now(),
      agents: assignPersonas(req.deviceIds, req.personas).map(({ deviceId, persona }) => ({
        deviceId,
        persona,
        state: "queued",
      })),
      _children: new Map(),
    };
    runs.set(id, run);
    persist(run);
    for (const a of run.agents) busy.set(a.deviceId, id);
    for (const a of run.agents) runAgent(run, a);
    return { ok: true, id };
  }

  function cancel(id) {
    const run = runs.get(id);
    if (!run || run.state !== "running") return { ok: false, error: "execução não está rodando" };
    for (const a of run.agents) {
      if (["queued", "preparing", "running"].includes(a.state)) {
        a.state = "cancelled";
        manager.setTest(a.deviceId, "idle");
      }
    }
    for (const child of run._children.values()) killTree(child);
    persist(run);
    return { ok: true };
  }

  /** Progresso ao vivo: nº de screenshots já tirados por agente. */
  function withProgress(run) {
    const { _children, ...plain } = run;
    return {
      ...plain,
      agents: plain.agents.map((a) => {
        let shots = [];
        try {
          shots = fs.readdirSync(path.join(a.dir || "", "shots")).filter((f) => f.endsWith(".png")).sort();
        } catch {}
        return { ...a, shots };
      }),
    };
  }

  function get(id) {
    if (!/^[\w-]+$/.test(id)) return null;
    const run = runs.get(id) || readJson(path.join(runDir(id), "run.json"));
    return run ? withProgress(run) : null;
  }

  function list() {
    let ids = [];
    try {
      ids = fs.readdirSync(RUNS_DIR).filter((d) => /^[\w-]+$/.test(d));
    } catch {}
    return ids
      .map((id) => runs.get(id) || readJson(path.join(runDir(id), "run.json")))
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        appId: r.appId,
        mission: r.mission,
        state: r.state,
        createdAt: r.createdAt,
        devices: r.agents.length,
        issues: r.summary?.issues?.length ?? null,
        costUsd: r.agents.reduce((s, a) => s + (a.costUsd || 0), 0),
      }))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50);
  }

  /** Caminho seguro de um arquivo do agente (screenshot ou relatório). */
  function filePath(id, deviceId, name) {
    if (!/^[\w-]+$/.test(id)) return null;
    if (!/^(shots\/[\w-]+\.png|report\.md|findings\.json)$/.test(name)) return null;
    const p = path.join(runDir(id), String(deviceId).replace(/[^\w.-]/g, "_"), ...name.split("/"));
    return p.startsWith(runDir(id)) && fs.existsSync(p) ? p : null;
  }

  /** Pacotes de terceiros instalados num device (p/ o seletor de app). */
  async function packages(deviceId) {
    const out = await adb(deviceId, ["shell", "pm", "list", "packages", "-3"]);
    return out.split(/\r?\n/).map((l) => l.replace(/^package:/, "").trim()).filter(Boolean).sort();
  }

  // execuções que estavam "running" quando o backend caiu não voltam: marca como interrompidas
  try {
    for (const d of fs.readdirSync(RUNS_DIR)) {
      const f = path.join(RUNS_DIR, d, "run.json");
      const r = readJson(f);
      if (r && r.state === "running") {
        r.state = "interrupted";
        for (const a of r.agents) if (["queued", "preparing", "running"].includes(a.state)) a.state = "interrupted";
        fs.writeFileSync(f, JSON.stringify(r, null, 2));
      }
    }
  } catch {}

  return { start, cancel, get, list, filePath, packages, personas: () => PERSONAS, missions: () => MISSIONS };
}
