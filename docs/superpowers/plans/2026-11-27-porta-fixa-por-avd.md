# Porta fixa por AVD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada AVD ganha uma porta de emulador fixa e única, persistida, numa faixa configurável; start falha com erro claro em vez de trocar de porta; GPU auto; corrige cache de nomes preso.

**Architecture:** Novo módulo puro `server/src/emulatorPorts.js` (config por env + store JSON AVD→porta). `emulators.js` passa a receber o store por injeção e usa a porta do store no `start`/`create`. UI mostra a porta e o erro de start.

**Tech Stack:** Node 25 ESM, `node:test` com `--experimental-test-module-mocks`, React (Vite) + Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-27-porta-fixa-por-avd-design.md`

## Global Constraints

- Env: `PF_EMU_PORT_MIN` (padrão `5554`), `PF_EMU_PORT_MAX` (padrão `5584`), passo 2, porta par; adb = porta+1.
- Inválido (não numérico, ímpar, MIN>MAX, fora de 1024–65534) → erro claro ao criar o manager (boot do servidor).
- Arquivo: `~/.phone-farm/emulator-ports.json` (`{ "<avd>": <porta> }`), override `PF_EMU_PORTS_FILE`; escrita atômica (tmp + rename).
- Faixa esgotada → mensagem exata: `sem porta livre na faixa MIN–MAX — aumente PF_EMU_PORT_MAX` (MIN/MAX numéricos).
- Porta salva fora da faixa atual é mantida. Uma porta nunca é reaproveitada por outro AVD enquanto o dono existir em `listAvds`.
- GPU: `-gpu auto` padrão, override `PF_EMU_GPU`. Manter `-qt-hide-window`, `-no-boot-anim`, `-no-snapshot`, `-no-audio`.
- Mensagens ao usuário em português (padrão do repo). Sem dependências novas.

## Review Focus

- `emulator-ports.json` corrompido/vazio → erro claro citando o arquivo, **sem sobrescrever** (senão todas as portas são reatribuídas em silêncio). Teste na Task 1.
- Pasta `~/.phone-farm` inexistente → criada (recursive). Teste na Task 1.
- Dois cliques rápidos em ▶ do mesmo AVD → um único spawn. Teste na Task 2.
- AVD já rodando fora do phone-farm (Android Studio) em outra porta → `start` retorna o serial existente, não sobe um segundo. Teste na Task 2.
- Porta do AVD ocupada por outro AVD no adb → erro com a porta e o nome do ocupante, sem spawn. Teste na Task 2.

---

### Task 1: Store de portas + config

**Files:**
- Create: `server/src/emulatorPorts.js`
- Create: `server/src/emulatorPorts.test.js`
- Modify: `server/package.json` (script `test` → `node --test --experimental-test-module-mocks`, necessário na Task 2)

**Interfaces:**
- Produces:
  - `readPortConfig(env = process.env) → { min: number, max: number, gpu: string, file: string }` — lança `Error` em config inválida; mensagem cita a variável (`PF_EMU_PORT_MIN`/`PF_EMU_PORT_MAX`). `file` default `join(os.homedir(), ".phone-farm", "emulator-ports.json")`; `gpu` default `"auto"`.
  - `createPortStore({ min, max, file }) → { get(name): number | undefined, assign(name: string, liveAvds?: string[]): number, all(): Record<string, number> }`
    - Carrega o arquivo na criação (inexistente = `{}`; JSON inválido ou não-objeto → lança `Error` com o caminho do arquivo).
    - `assign`: se já tem porta, retorna-a sem gravar. Senão: se `liveAvds` dado, remove do mapa nomes ausentes dele; escolhe a menor porta par em `[min, max]` não usada no mapa; grava (mkdir recursive + write `file.tmp` + `renameSync`); retorna.
    - I/O síncrono (`node:fs`), o que torna `assign` atômico dentro do processo.

- [ ] **Step 1: Write failing tests** (`os.tmpdir()` + `mkdtempSync` por teste)

```js
test("readPortConfig: defaults", () => {
  const c = readPortConfig({});
  assert.equal(c.min, 5554); assert.equal(c.max, 5584); assert.equal(c.gpu, "auto");
  assert.match(c.file, /\.phone-farm[\\/]emulator-ports\.json$/);
});
test("readPortConfig: env custom", () => {
  const c = readPortConfig({ PF_EMU_PORT_MIN: "9000", PF_EMU_PORT_MAX: "9100", PF_EMU_GPU: "host", PF_EMU_PORTS_FILE: "/x/p.json" });
  assert.deepEqual(c, { min: 9000, max: 9100, gpu: "host", file: "/x/p.json" });
});
for (const [env, re] of [
  [{ PF_EMU_PORT_MIN: "abc" }, /PF_EMU_PORT_MIN/],
  [{ PF_EMU_PORT_MIN: "5555" }, /PF_EMU_PORT_MIN/],          // ímpar
  [{ PF_EMU_PORT_MAX: "5585" }, /PF_EMU_PORT_MAX/],          // ímpar
  [{ PF_EMU_PORT_MIN: "6000", PF_EMU_PORT_MAX: "5600" }, /PF_EMU_PORT_MIN.*PF_EMU_PORT_MAX|PF_EMU_PORT_MAX.*PF_EMU_PORT_MIN/],
  [{ PF_EMU_PORT_MIN: "1000" }, /PF_EMU_PORT_MIN/],          // < 1024
  [{ PF_EMU_PORT_MAX: "65536" }, /PF_EMU_PORT_MAX/],         // > 65534
]) test(`readPortConfig inválido ${JSON.stringify(env)}`, () => assert.throws(() => readPortConfig(env), re));

test("assign: sequencial e fixo", () => {
  const s = createPortStore({ min: 5554, max: 5584, file });
  assert.equal(s.assign("A"), 5554); assert.equal(s.assign("B"), 5556); assert.equal(s.assign("A"), 5554);
});
test("persiste e recarrega", () => {
  createPortStore({ min: 5554, max: 5584, file }).assign("A");
  assert.equal(createPortStore({ min: 5554, max: 5584, file }).get("A"), 5554);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { A: 5554 });
});
test("faixa cheia", () => {
  const s = createPortStore({ min: 5554, max: 5556, file });
  s.assign("A"); s.assign("B");
  assert.throws(() => s.assign("C"), { message: "sem porta livre na faixa 5554–5556 — aumente PF_EMU_PORT_MAX" });
});
test("AVD apagado libera porta", () => {
  const s = createPortStore({ min: 5554, max: 5556, file });
  s.assign("A"); s.assign("B");
  assert.equal(s.assign("C", ["B", "C"]), 5554);
  assert.equal(s.get("A"), undefined);
});
test("porta fora da faixa nova é mantida", () => {
  createPortStore({ min: 5554, max: 5584, file }).assign("A");
  const s = createPortStore({ min: 9000, max: 9010, file });
  assert.equal(s.get("A"), 5554); assert.equal(s.assign("B"), 9000);
});
test("JSON corrompido: erro e arquivo intacto", () => {
  writeFileSync(file, "{oops");
  assert.throws(() => createPortStore({ min: 5554, max: 5584, file }), (e) => e.message.includes(file));
  assert.equal(readFileSync(file, "utf8"), "{oops");
});
test("cria pasta inexistente", () => {
  const deep = join(dir, "a", "b", "ports.json");
  createPortStore({ min: 5554, max: 5584, file: deep }).assign("A");
  assert.ok(existsSync(deep));
});
```

- [ ] **Step 2: Run** `cd server && node --test src/emulatorPorts.test.js` — Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** `server/src/emulatorPorts.js` per Interfaces; update `package.json` test script.
- [ ] **Step 4: Run** `cd server && npm test` — Expected: novos testes PASS + 12 de `agent.test.js` PASS.
- [ ] **Step 5: Commit** `feat(emuladores): store de portas fixas por AVD com faixa configuravel`

---

### Task 2: Manager usa porta fixa, falha clara, cache de nomes

**Files:**
- Modify: `server/src/emulators.js` (remove `freePort` e `busyAdbPorts` linhas 79-98; `createEmulatorManager`, `start`, `create`, `ensureNames`, `statusList`; comentário do topo linhas 1-2)
- Create: `server/src/emulators.test.js` (base: mocks de `node:child_process` e `./adbPath.js` do repro `namecache.test.mjs` — `mock.module` + `execFile[promisify.custom]`; `spawn` falso retorna `EventEmitter` com `kill()` e registra args)

**Interfaces:**
- Consumes: `readPortConfig`, `createPortStore` (Task 1).
- Produces:
  - `createEmulatorManager({ ports?, gpu?, bootGraceMs = 3000 } = {})` — sem `ports`, usa `const cfg = readPortConfig(); createPortStore(cfg)` e `gpu = cfg.gpu` (config inválida lança aqui → servidor não sobe, com mensagem).
  - `start(name) → Promise<{ name, port, serial }>`:
    1. `running.has(name)` → retorna entry; start em andamento do mesmo nome → retorna a mesma Promise (map `pending`).
    2. Se `avdSerials()[name]` já existe (externo) → retorna `{ name, port: Number(serial.split("-")[1]), serial }` sem spawn.
    3. `port = ports.get(name) ?? ports.assign(name, await listAvds())`.
    4. Se `emulator-<port>` está no adb com outro nome → lança `porta ${port} ocupada por ${outro} — pare-o antes de iniciar ${name}`.
    5. `nameCache.delete(serial)`; spawn com args atuais trocando `"auto"` por `gpu`.
    6. Aguarda `bootGraceMs`: se `exit` antes → `running.delete`, lança `emulador ${name} saiu ao iniciar (porta ${port}, código ${code})`; `error` (ex. ENOENT) → lança com `e.message`.
  - `create(rawName, opts)` → após avdmanager OK, `ports.assign(name, await listAvds())`; resolve `{ ok: true, name, port }`.
  - `ensureNames(serials)` → antes de consultar, remove do `nameCache` todo serial fora de `serials`.
  - `statusList()` → itens `{ name, running, serial, port: ports.get(name) ?? null }`.

- [ ] **Step 1: Write failing tests** (store real em tmp; `bootGraceMs: 20`)

```js
test("start usa porta do store e -gpu configurado", async () => {
  const emu = createEmulatorManager({ ports: store, gpu: "host", bootGraceMs: 20 });
  state.avds = ["A"]; const r = await emu.start("A");
  assert.deepEqual(r, { name: "A", port: 5554, serial: "emulator-5554" });
  const args = spawned.at(-1);
  assert.equal(args[args.indexOf("-port") + 1], "5554");
  assert.equal(args[args.indexOf("-gpu") + 1], "host");
});
test("porta fixa após stop/start", async () => { /* start A, start B (5556), stop A, start A → 5554 */ });
test("porta ocupada por outro AVD", async () => {
  store.assign("A"); state.devices = ["emulator-5554"]; state.names = { "emulator-5554": "X" };
  await assert.rejects(emu.start("A"), /porta 5554 ocupada por X/);
  assert.equal(spawned.length, 0);
});
test("AVD já rodando externo: sem spawn", async () => {
  state.devices = ["emulator-5600"]; state.names = { "emulator-5600": "A" };
  assert.deepEqual(await emu.start("A"), { name: "A", port: 5600, serial: "emulator-5600" });
  assert.equal(spawned.length, 0);
});
test("cliques duplos: um spawn", async () => {
  await Promise.all([emu.start("A"), emu.start("A")]); assert.equal(spawned.length, 1);
});
test("saída precoce vira erro", async () => {
  nextSpawnExitCode = 1; // fake emite exit(1) em setImmediate
  await assert.rejects(emu.start("A"), /emulador A saiu ao iniciar \(porta 5554, código 1\)/);
  assert.equal(emu.runningList().length, 0);
});
test("statusList inclui port", async () => { /* A atribuído, B não → [{name:"A",port:5554,...},{name:"B",port:null,...}] */ });
// casos 1 e 2 do repro (porta reciclada por outro AVD) via ensureNames/nameOf → esperam "AVD-B"
```

Caso 1 do repro (mesma porta, troca sem sumir do adb entre polls) **não** é coberto por evicção; ele só ocorre se o AVD-B for iniciado nessa porta, o que agora exige passar pelo `start` (que limpa o cache do serial) ou ser externo. Teste o caso 1 assim: A rodando em 5554 → `stop("A")` → B atribuído 5554 manualmente no store → `start("B")` → `nameOf("emulator-5554") === "B"` após `ensureNames`.

- [ ] **Step 2: Run** `cd server && node --test --experimental-test-module-mocks src/emulators.test.js` — Expected: FAIL.
- [ ] **Step 3: Implement** mudanças em `emulators.js` per Interfaces.
- [ ] **Step 4: Run** `cd server && npm test` — Expected: tudo PASS.
- [ ] **Step 5: Commit** `feat(emuladores): porta fixa por AVD, erro claro no start e cache de nomes`

---

### Task 3: UI, README e validação real

**Files:**
- Modify: `src/components/EmulatorBar.jsx` (mostrar `:{port}` ao lado do nome quando `a.port`; `title` inclui porta; resultado de `start/stop` com `ok:false` → guarda `error` em state e exibe linha `text-rose-400 text-xs` com `${name}: ${error}`, some no próximo sucesso)
- Modify: `src/api/client.js:92` (comentário do shape: `{name, running, serial, port}`)
- Modify: `README.md:173,181` + nova seção "Portas dos emuladores" (tabela `PF_EMU_PORT_MIN`, `PF_EMU_PORT_MAX`, `PF_EMU_PORTS_FILE`, `PF_EMU_GPU`; cada emulador usa 2 portas; exemplo `PF_EMU_PORT_MAX=5700`; "janela oculta (`-qt-hide-window`), não headless — mantém GPU")

Sem teste automatizado (o repo não tem testes de frontend); a verificação é manual. Antes de editar o JSX, usar a skill `ui-ux-pro-max` (CLAUDE.md do usuário) só para revisar o badge/linha de erro.

- [ ] **Step 1: Implement** UI + README.
- [ ] **Step 2: Build** `npm run build` na raiz — Expected: sem erro.
- [ ] **Step 3: Validação real** — servidor com `PF_EMU_PORTS_FILE=<scratch>/ports.json`; via API `POST /api/emulators/phone-01/start` e `phone-02/start` → portas 5554 e 5556; `adb devices` lista ambos; `GET /api/emulators` traz `port`; stop phone-01, start de novo → 5554 de novo; `PF_EMU_PORT_MAX=5554` com phone-03 → erro `sem porta livre na faixa 5554–5554 — aumente PF_EMU_PORT_MAX`. Derrubar tudo no fim.
- [ ] **Step 4: Commit** `feat(ui): porta e erro de start na barra de emuladores; docs de portas`
- [ ] **Step 5:** `graphify update .` se o repo tiver `graphify-out/`.
