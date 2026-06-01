# Phone Farm — Plano de Arquitetura

> Painel web que lista vários celulares ao mesmo tempo em grade ("widgets"),
> cada um rodando um sistema Android (ou iOS) real/virtual, com tela ao vivo e
> controle remoto. Tipo uma "fazenda de celulares".

---

## 1. O que é tecnicamente possível (realidade, sem ilusão)

| Plataforma | Virtual (sem hardware) | Real (hardware físico) | Observação legal |
|---|---|---|---|
| **Android** | ✅ `redroid` (Android em Docker, GPU), Emulador AVD, Genymotion | ✅ celulares reais via USB/WiFi + `adb`/`scrcpy` | Livre. AOSP é open-source. |
| **iOS** | ⚠️ Só em macOS (Simulador Xcode) — **não** virtualiza em Linux/Windows | ✅ iPhones reais via Mac host | Apple **proíbe** virtualizar iOS fora de hardware Apple. Cloud só com provedor (BrowserStack/Sauce). |

**Conclusão estratégica:** começar 100% Android (virtual + real). iOS entra depois
só via Mac host ou provedor de nuvem — nunca virtualizado em PC comum.

---

## 2. Os dois modos de "celular na tela"

### Modo A — Celulares Virtuais (escala, sem hardware)
- **`redroid`** = Android completo dentro de container Docker. GPU acelerada,
  multi-arch (arm64/amd64). Sobe dezenas de instâncias num host Linux.
- Cada container expõe `adb` numa porta → mesma stack de controle do real.
- **Melhor para:** escala (10, 50, 100+ telas), automação, testes, baixo custo.
- **Limite:** sem sensores reais (GPS/câmera/NFC verdadeiros), detectável por apps
  anti-fraude. GPU Nvidia mal suportada (use Intel/AMD).

### Modo B — Celulares Reais (fidelidade)
- Celulares Android físicos conectados via USB hub ou WiFi (`adb connect`).
- **`scrcpy`** espelha tela + repassa toque/teclado, baixa latência.
- **Melhor para:** comportamento 100% real, sensores, lojas, anti-fraude.
- **Limite:** custo de hardware, hub USB, energia/calor, manutenção física.

> O painel trata os dois iguais: **tudo vira "um device com uma porta adb + um stream de tela"**.

---

## 3. Arquitetura proposta (alto nível)

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/JSX)                       │
│   Grade de cards-celular · tela ao vivo · controles · batch   │
└───────────────▲───────────────────────────────▲──────────────┘
                │ WebSocket (controle/estado)    │ WebRTC/WS (vídeo)
┌───────────────┴───────────────────────────────┴──────────────┐
│                   BACKEND / ORQUESTRADOR                      │
│  • API REST/WS (Node ou Go)                                  │
│  • Device Manager: registra/health-check de cada device      │
│  • Session Broker: 1 sessão de controle por device           │
│  • Provisioner: sobe/derruba containers redroid (Docker API)  │
└───────┬──────────────────────────┬───────────────────────────┘
        │ adb                      │ adb / scrcpy-server
┌───────▼─────────┐        ┌───────▼──────────────┐
│  DEVICES VIRT.  │        │   DEVICES REAIS      │
│  redroid x N    │        │  Android USB/WiFi    │
│  (Docker)       │        │  (scrcpy stream)     │
└─────────────────┘        └──────────────────────┘
```

### Pipeline de vídeo (a parte crítica de latência)
- Fonte: `scrcpy-server` (roda no device/container) produz stream H.264.
- Transporte: ou **WebSocket binário** (ex.: `ws-scrcpy` — projeto que já faz
  scrcpy no browser) ou **WebRTC** (menor latência, mais complexo).
- **Decisão inicial:** usar/forkar **`ws-scrcpy`** — já entrega tela Android no
  navegador via WS + decodificação H.264 em JS/WASM. Acelera MVP em semanas.

### Pipeline de controle
- Toque/swipe/tecla do browser → WS → backend → `adb shell input` ou canal de
  controle do scrcpy → device.
- Comandos batch ("instalar APK em todos", "abrir app X", "screenshot all") =
  loop sobre devices selecionados.

---

## 4. Stack recomendada (MVP)

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **React + Vite + Tailwind** | protótipo rápido, grid responsivo |
| Estado/RT | **WebSocket** (Socket.IO ou ws) | estado + controle em tempo real |
| Vídeo | **ws-scrcpy** (fork) | scrcpy no browser pronto |
| Backend | **Node.js** (MVP) → migrar p/ **Go** se escalar | ecossistema adb/ws |
| Devices virt. | **redroid** + **Docker API** | escala em container |
| Devices reais | **adb** + **scrcpy** | padrão de mercado |
| Orquestração | Docker Compose → **Kubernetes** (escala) | sobe/derruba em massa |
| DB | **PostgreSQL** + **Redis** (sessões/fila) | metadados + estado efêmero |

Referência de arquitetura madura: **openstf/STF** (ZeroMQ + protobuf, 160+
devices). Estudar, mas não copiar — começamos mais simples.

---

## 5. Funcionalidades do painel (escopo)

**MVP (v0):**
- Grade de cards, cada um = 1 celular com tela ao vivo + status (online/booting/offline).
- Clique no card = foca/amplia, controle por mouse/teclado.
- Status: bateria, modelo, versão Android, IP/porta.
- Ações por device: home/back/recents, screenshot, reiniciar.

**v1:**
- Multi-seleção + ações em lote (instalar APK, abrir URL/app, digitar texto em todos).
- Provisionar device virtual novo (1 clique sobe container redroid).
- Filtro/busca, grupos/tags, layout de grade ajustável.

**v2:**
- Gravação/replay de scripts de automação (Appium por baixo).
- Métricas (CPU/RAM/FPS por device), alertas de saúde.
- Controle de acesso (multiusuário), reserva de device.

---

## 6. Roadmap — fases (fonte única da verdade)

> 🏁 **v0.1 — primeira versão (2026-05-30):** farm Android local funcional ponta a ponta
> — emuladores sobem/derrubam pela UI, grade espelha a tela real, modal com toque +
> controles + APK + gravação. Fases 0–3.1 concluídas.

| Fase | Entrega | Status |
|---|---|---|
| **0** | Protótipo UI (grade/lista, mock) | ✅ feito |
| **1** | Backend ao vivo (REST + WebSocket, adb/mock) | ✅ feito |
| **2** | Emuladores locais (AVD) | ✅ feito |
| **3** | Vídeo + toque ao vivo (MJPEG + `adb input`) | ✅ feito |
| **3.1** | Downscale de frames (`sharp`) | ✅ feito |
| **3.2** | Refino UI/UX (provision, controles, espelho, duplo-clique) | ✅ feito |
| **4** | Escala & fidelidade (débitos #2/#3) | ⏳ adiado |
| **5** | Empacotamento / distribuição | ⏳ futuro |

### Roteiro de automação (feito 2026-06-01)
- [x] Mini-DSL (1 ação/linha: key/tap/swipe/text/openurl/rotate/wait) — `server/src/script.js`
- [x] `manager.runScript` executa passo a passo; falha não aborta; reporta ✓/✕ por passo
- [x] Rotas `/api/script/help` + `/api/devices/:id/script`; `ScriptModal` + botão "▶ Script"
- [x] Roda nos selecionados (ou todos online) em paralelo. Validado real (2 emuladores)
- [ ] Blocos/loops (repeat), variáveis, gravar-e-reproduzir, Appium (automação avançada)

### Modelo de interação (UX da v0.1)
- **Grade:** espelha a tela **real** do device ao vivo (só visualização, não interativa).
  Clique = selecionar (batch). **Duplo-clique** (ou ⤢) = expandir.
- **Lista:** modo denso, **só animação** placeholder (sem stream) — leve p/ muitas telas.
- **Modal (expandido):** tela ao vivo **interativa** — clique=tap, arraste=swipe,
  segurar=long-press (coords normalizadas → resolução real via `wm size`); + Back/Home/
  Recent/Power/Vol/Girar, digitar texto, abrir URL, instalar APK, gravar 10s, parar.
- Toggle **🪞 Espelho** liga/desliga o espelho da grade (desligar alivia com muitos devices).

> Visão: cada "celular" = **emulador Android (AVD) local** (foco atual) ou device
> físico USB — ambos pelo mesmo `adb`. iOS fora de escopo. redroid/escala e
> scrcpy/fluidez viram a Fase 4 (débito). Distribuição é a Fase 5.

### Fase 0 — Protótipo UI ✅
- [x] Grade ajustável + lista densa; devices mock com telas animadas
- [x] Status de teste por device + contadores pass/fail no header
- [x] Agrupar por versão Android; ação "Rodar suite" (simulada)

### Fase 1 — Backend ao vivo ✅
- [x] Node + Express (REST) + `ws` (WebSocket de estado)
- [x] Device source abstrato: `adbSource` (real) + `mockSource` + chooser
- [x] adb: list (getprop/battery), screenshot (`screencap`), input (keyevent)
- [x] `DeviceManager`: poll + merge de status de teste + broadcast por WS
- [x] Front consome API (`useDevices`), badge da fonte + indicador WS

### Fase 2 — Emuladores locais (AVD) ✅
Cada "celular" = emulador local na mesma máquina; USB real no mesmo `adbSource`.
- [x] `EmulatorManager`: list/start/stop/create de AVDs como processos locais
- [x] Boot headless (porta 555X); adb pega automático; reconcilia estado "booting"
- [x] Rotas `/api/emulators*`; `EmulatorBar`; Provisionar = criar+subir; Parar no modal
- [x] **VALIDADO REAL:** Pixel_7 (Android 15) bootou, screencap real na UI
- [x] **Reconciliar emulador externo** (iniciado fora da UI): EmulatorBar mostra
      running correto; card usa **nome amigável** do AVD (ex.: "Pixel_7", não o serial)
- [x] **Provision corrigido:** `avdmanager.bat` via `shell:true` (Windows bloqueia
      spawn de .bat), stdin "no", nome sanitizado; porta livre evita colisão com
      emulador já no adb (`freePort` exclui portas do `adb devices`)
- [ ] Auto-iniciar conjunto de AVDs ao subir o backend

### Fase 3 — Vídeo + toque ao vivo ✅
**MJPEG** (screencap em loop via `multipart/x-mixed-replace`) renderizado por `<img>`
nativo — zero decode no cliente. Toque via `adb input tap/swipe/text` (coords da
imagem → resolução real).
- [x] `stream.js` + `/stream`; `LiveScreen` (badge AO VIVO)
- [x] `/tap` `/swipe` `/text`; `FocusModal` interativo; toggle "📷 Ao vivo" na grade
- [x] **3.1 Downscale** (`sharp`): cheio **1.39MB** → grade w=240 **8.4KB** (165×) →
      modal w=540 **30KB** (46×); params `?w=&q=`; fallback PNG se faltar sharp
- [x] **VALIDADO REAL:** stream do Android 15 na UI; swipe abriu a gaveta de apps
- [x] **Long-press, teclas de volume, rotação** (refino UX, validado real):
      LiveScreen detecta long-press (segurar→swipe c/ duração); modal ganhou
      Vol±, Girar, abrir URL (`am start VIEW`, validado: Chrome abriu), digitar texto
- [x] **Instalar APK real** (validado): upload 1× (`/api/uploads` via multer) → token
      → `adb install -r -g` por device. UI: botão no modal + batch (instala nos
      selecionados). Gotcha: renomear upload p/ `.apk` (adb exige extensão).
- [x] **Gravar tela** (validado): `screenrecord` por N s → `adb pull` → download mp4
      (`/api/devices/:id/record?seconds=`). Botão "Gravar 10s" no modal.
- [ ] **Multi-toque** — adiado: via adb exige `sendevent` cru (protocolo de eventos
      do kernel), frágil e específico por device. Baixo retorno; só com scrcpy (Fase 4 #2).

### Refino UI/UX (feito 2026-05-30, validado com emulador real)
- [x] **Provisionar:** modal com nome + versão (system-images via `/api/images`) +
      perfil de device (Pixel 7/6/5/4/Tablet/Nexus 5) — substitui o `window.prompt`
- [x] **Controles do device:** Back/Home/Recent/Power, Vol±, Girar, abrir URL, digitar
- [x] **Identidade:** card mostra nome do AVD ("Pixel_7") + serial no rodapé
- [x] **Polish:** header sem quebra (ações agrupadas), toolbar fixa (sticky),
      grade 4/6/8/10 colunas, placeholder corrigido, badge da fonte + WS
- [x] **Densidade validada (mock 30 cards):** grade escala 4/6/8/10 col limpa; nome
      do card vira tooltip a 10 col (trunca p/ "p…"). Sweet spot 6–8 col. `MOCK_N`
      controla qtd de devices fake (ex.: `FORCE_MOCK=1 MOCK_N=30`).

### Fase 4 — Escala & fidelidade (débitos, adiado 2026-05-30)
Adiados ao optar por destravar com o downscale (3.1). Puxar conforme necessidade:
- [ ] **#2 ws-scrcpy (H.264 60fps):** tela fluida no lugar do MJPEG. Baixo risco
      (roda no Windows), alto esforço. Não aumenta nº de telas.
- [ ] **#3 redroid (escala 10–50):** Android em container, mais leve que AVD.
      **Requer Linux** (kernel binder/ashmem; WSL2 padrão não tem) → servidor dedicado.

### Fase 5 — Empacotamento / distribuição ⏳ (meta do usuário) — INICIADA
Rodar local agora; **depois ser instalável em outras máquinas**. Premissa legal:
**não redistribuir** nada do Google (SDK/emulador/Play) — o app orquestra, o cliente
instala o SDK e aceita os termos do Google (ver `LICENSE`).
- [x] **Default AOSP/sem-Play:** criação de AVD prefere imagem `google_apis`/AOSP
      (sem GMS), evitando redistribuição indireta do Play e ToS do Google. Imagens
      marcadas com `play` na API; UI recomenda sem-Play.
- [x] **Servir o front pelo backend (1 processo):** `express.static(dist)` + fallback
      SPA; API/WS/streams na mesma porta (:4000). `npm start` (build+serve) ou
      `npm run serve`. Validado real (grade espelhando 2 devices em :4000, sem vite).
- [x] **Empacotar como app instalável (Electron) — 1 clique:** `desktop/` (Electron
      main sobe o backend via ELECTRON_RUN_AS_NODE e abre a janela nele).
      `electron-builder` → NSIS one-click `Phone Farm Setup 0.1.0.exe` (~82MB).
      Validado real: app empacotado sobe server (:4317) + conecta emuladores.
      Gotchas: `win.signAndEditExecutable:false` (winCodeSign.7z falha no 7z por
      symlinks macOS); sem assinatura (SmartScreen avisa).
- [x] **Ícone 🌾:** emoji renderizado no browser → PNG → `icon.ico` (multi-tamanho via
      sharp + png-to-ico). Aplicado no instalador, atalho e janela/taskbar (runtime via
      `BrowserWindow.icon`). Ressalva: ícone do .exe do app no Explorer segue o padrão
      do Electron (embutir exige rcedit→winCodeSign, que falha aqui).
- [ ] `sharp` é nativo → bundlar o binário certo por plataforma (win/mac/linux)
- [ ] Detector de pré-requisitos: SDK, platform-tools, system-image, virtualização
      (WHPX/KVM) — com instruções/links se faltar (sem baixar binário do Google)
- [ ] Config externável (porta, caminho do SDK, pool de AVDs a auto-subir)
- [x] **Trial 7 dias + ativação por chave (client-side)** (2026-05-30): repo tornado
      privado; `trial.cjs` (estado em userData, chave HMAC por installId), `gate.html`
      (tela de expirado: mostra installId + contato p/ estender), `keygen.cjs` (vendor).
      Validado: trial→expired→keygen→ativar→licensed. **Config:** trocar `SECRET`
      (trial.cjs) e `CONTACT` (gate.html). Ressalva: burlável (apagar pf-state.json).
- [ ] **Trava real = servidor de licença** (valida online; resiste a reset) — débito
- [ ] Distribuição do .exe por canal próprio (repo privado → release não é pública)

---

## 7. Riscos e cuidados

- **Latência de vídeo** é o maior risco técnico → decidir WS vs WebRTC cedo com benchmark.
- **iOS** não virtualiza legalmente em PC — não prometer. Só Mac/cloud.
- **Anti-fraude / ToS:** muitos apps detectam emulador/farm. Uso deve ser legítimo
  (testes/QA/automação própria). Definir o caso de uso real antes de escalar.
- **Recursos:** cada redroid consome CPU/RAM/GPU. 50 telas = servidor parrudo.
- **Energia/calor** (devices reais): hub USB com energia, ventilação.

---

## 8. Decisões travadas (2026-05-29)

| Pergunta | Decisão | Impacto |
|---|---|---|
| **Uso final** | **Testes / QA de apps** | foco em redroid (virtual), matriz de versões Android, install de APK, status pass/fail por device |
| **Escala** | **10–50 telas (1 servidor dedicado)** | local nesta máquina ~8–12 AVDs; 10–50 = servidor Linux + redroid (Fase 4 #3) |
| **iOS** | **Não — só Android** | sem complexidade Mac/cloud; 100% AOSP/adb |
| **Foco escolhido** | **Emuladores AVD locais** | rodar na mesma máquina do sistema; USB real segue suportado |
| **Distribuição** | **Instalável em outras máquinas (depois)** | Fase 5 — empacotar + instalador que provê o SDK |

### Consequências de design (QA + Android + local)
- **AVD-first:** emulador local é o caminho atual (roda no Windows, sem Docker).
  redroid (container, mais leve) só p/ escalar 10–50 num servidor Linux — Fase 4 #3.
- **Matriz de teste:** agrupar/filtrar por versão Android é requisito de UI.
- **Status de teste por device:** idle / rodando / pass / fail visível na grade.
- **Modo denso (lista):** com muitas telas, cards grandes não cabem → toggle grade/lista.
- **Batch:** "instalar APK em todos", "rodar suite", "limpar dados" são ações de 1º nível.
- **Vídeo:** MJPEG + downscale resolve QA agora; ws-scrcpy (fluido) é débito Fase 4 #2.

### Ambiente validado (máquina atual)
- SDK em `%LOCALAPPDATA%\Android\Sdk` · WHPX usável · 38GB RAM · imagem android-35.
- Limite prático: AVD ~2GB RAM cada → ~8–12 emuladores nesta máquina.
- Escala 10–50: servidor Linux + **redroid** (container, mais leve) — Fase futura.
