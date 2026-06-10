<h1 align="center">🌾 Phone Farm</h1>

<p align="center">
  Fazenda de celulares Android local — emuladores via UI, espelho ao vivo e controle total.
</p>

---

**Phone Farm** transforma sua máquina numa **fazenda de celulares Android** para QA e
automação. Cada "celular" é um **emulador Android (AVD)** rodando localmente — criado,
iniciado e parado direto pela interface — ou um device físico via **USB** (mesmo
pipeline `adb`). A **grade espelha a tela real** de cada device ao vivo; ao **expandir**,
você controla por **toque, arraste e long-press**, além de teclas (Home/Back/Power/
Volume), rotação, digitação, abertura de URL, **instalação de APK** (em lote) e
**gravação de tela**.

Stack: **React + Vite + Tailwind** no front; **Node + Express + WebSocket** no back, com
streaming **MJPEG** leve (downscale via `sharp`). Sem o SDK Android instalado, roda em
modo **mock** para desenvolvimento da UI.

> Painel de QA/testes/automação **próprios** — não destinado a fraude, multi-conta ou
> burla de Termos de Serviço de apps. Arquitetura e decisões em [`PLANO.md`](./PLANO.md).

> 🏁 **v0.1 — primeira versão funcional.** Cada "celular" é um **emulador Android (AVD)**
> rodando na mesma máquina (device USB também funciona). Sobe/derruba pela UI, a grade
> **espelha a tela real** ao vivo, e o modal dá **controle total** (toque, teclas, APK,
> gravação). Sem SDK/adb, cai em **mock**. Próximo: empacotar p/ instalar em outras máquinas.
>
> **Interação:** grade = espelho (só visual); **duplo-clique** ou ⤢ expande; modal =
> toque/arraste/long-press + Back/Home/Power/Vol/Girar/URL/texto/APK/gravar. Lista = animação leve.

## Pré-requisitos

### Obrigatório

- **Node.js 18+** (e `npm`) — [nodejs.org](https://nodejs.org)
- **Git** p/ clonar o repositório

> Só isso já roda o app em modo **mock** (devices falsos) — útil p/ conhecer a UI
> ou desenvolver o frontend sem nenhum Android por perto.

### Para devices reais (emuladores / USB)

- **Android SDK** (instalar o [Android Studio](https://developer.android.com/studio)
  já basta) com `emulator`, `platform-tools` e `cmdline-tools`.
- Variável de ambiente `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) apontando p/ o SDK.
  - Windows (padrão): `%LOCALAPPDATA%\Android\Sdk`
  - Linux/macOS (padrão): `~/Android/Sdk` / `~/Library/Android/sdk`
- Pelo menos 1 **system-image** + 1 AVD (crie no Android Studio ou pela própria UI
  via "+ Provisionar").
- **Virtualização** ligada na BIOS (WHPX no Windows / KVM no Linux) p/ emulador acelerado.
- Device físico via USB: ative **Depuração USB** nas opções de desenvolvedor e
  confira com `adb devices`.

## Como rodar — passo a passo

### 1. Clonar e instalar

```bash
git clone https://github.com/Wellington-HMV/phone-farm.git
cd phone-farm
npm install               # deps do front
cd server && npm install  # deps do back
cd ..
```

### 2. Subir (produção — 1 processo só, recomendado)

O backend serve o frontend buildado (`dist/`) + API + WebSocket na **mesma porta**.

```bash
npm start                 # build do front + sobe o backend → http://localhost:4000
```

Abra **http://localhost:4000**. Com SDK instalado, os AVDs aparecem na barra
**Emuladores (AVD)** — clique ▶ p/ subir um. Sem SDK, entra em modo mock.

Já buildado antes? `npm run serve` pula o build (backend serve o `dist/` existente).
Force a fonte: `FORCE_MOCK=1` (mock) ou `FORCE_ADB=1` (adb) antes do comando.

### 3. Dev — 2 processos (hot reload)

```bash
# terminal 1 — backend (porta 4000)
cd server && npm run dev

# terminal 2 — frontend (porta 5173, proxia /api e /ws p/ o backend)
npm run dev
```

Abra **http://localhost:5173** (frontend com hot reload).

## 🔌 Device USB no navegador (WebUSB — zero instalação)

Em **Chrome/Edge** dá pra controlar um Android **físico via cabo USB direto no
navegador**, sem instalar adb nem o agente. Clique em **🔌 Device USB** no header,
escolha o aparelho no prompt do navegador e aceite **Depuração USB** no celular.

- ✅ **Zero instalação** — protocolo ADB falado pelo browser via WebUSB ([Tango/ya-webadb](https://github.com/yume-chan/ya-webadb)).
- ✅ Espelho ao vivo (loop `screencap`), **toque** (clique), **swipe** (arraste) e teclas (Back/Home/Recentes/Power/Vol).
- ✅ Tudo roda na máquina do usuário; nada sai do navegador.
- ❌ Só **Chromium** (sem Firefox/Safari) e só **device físico** — emulador (AVD) é binário local, precisa do agente.
- 📦 Os pacotes ADB são carregados **sob demanda** (code-split) — quem não usa USB não baixa.

> Combina com a casca hospedada: WebUSB cobre device físico sem instalar nada; o
> agente local (abaixo) cobre emuladores e o resto.

## Casca web hospedada (usar o hardware da própria máquina pelo navegador)

A UI pode ser **hospedada** (ex.: GitHub Pages) e controlar o **hardware da máquina
do usuário** — desde que ele rode o **agente local** e pareie. A página web não
acessa adb/emulador direto (sandbox do browser proíbe); ela conversa com o agente
que roda no PC dele.

```
[navegador: casca web hospedada]  ──token──▶  [agente local :4000]  ──▶  adb / emulador
        (qualquer domínio)        ◀── WS ───   (só 127.0.0.1)
```

**Como usar:**

1. O usuário roda o agente (= este backend) na máquina dele:
   ```bash
   git clone https://github.com/Wellington-HMV/phone-farm.git
   cd phone-farm && npm install && cd server && npm install && npm start
   ```
2. O agente imprime no console a **URL** (`http://localhost:4000`) e um **token**.
3. Na casca web, ele cola URL + token na tela de pareamento → pronto, controla os
   devices da própria máquina pelo navegador.

**Segurança (por que é seguro ceder isso):**

- O agente escuta **só `127.0.0.1`** — a LAN não alcança (use `PF_BIND=0.0.0.0` p/ expor, por sua conta).
- Requisição **mesma-origem** (app desktop / `npm start`) passa **sem token** — zero atrito.
- Requisição **cross-origin** (casca hospedada) exige **token de pareamento** + origem
  permitida. Como o navegador sempre manda `Origin` cross-origin, **um site malicioso
  aberto noutra aba não consegue comandar seu adb** (não tem o token) — barra CSRF.
- Variáveis: `PF_TOKEN` (fixar token), `PF_WEB_ORIGINS` (csv de origens; default `*` =
  qualquer, mas token segue obrigatório), `PF_BIND` (interface).

> Publicar a casca: `npm run build:web` gera o bundle (base `/phone-farm/`). O workflow
> `.github/workflows/pages.yml` faz deploy no GitHub Pages a cada push na `main`.
> (Ative Pages em **Settings → Pages → Source: GitHub Actions**.)

## Stack

- **Frontend:** Vite 5 + React 18 + Tailwind 3.4 (Node 18 compatível)
- **Backend:** Node + Express (REST) + ws (WebSocket de estado ao vivo)
- **Device source:** `adb` real (USB/WiFi/redroid) com fallback mock automático

### API do backend
| Método | Rota | O quê |
|---|---|---|
| GET | `/api/health` | status + fonte |
| GET | `/api/devices` | lista de devices |
| POST | `/api/suite` | roda suite (body `{ids}`; vazio = todos) |
| POST | `/api/devices/:id/action` | keyevent (`back\|home\|recents\|power`) |
| GET | `/api/devices/:id/screenshot` | PNG real via `adb screencap` (204 no mock) |
| GET | `/api/devices/:id/stream?fps=&w=&q=` | stream MJPEG ao vivo; `w`=largura (downscale), `q`=qualidade |
| POST | `/api/devices/:id/tap` | toque (`{x,y}` em coords reais do device) |
| POST | `/api/devices/:id/swipe` | arraste (`{x1,y1,x2,y2,ms}`) |
| POST | `/api/devices/:id/text` | digita texto (`{text}`) |
| POST | `/api/devices/:id/openurl` | abre URL no device (`{url}` → `am start VIEW`) |
| POST | `/api/devices/:id/rotate` | gira a tela (`{deg}` 0/90/180/270) |
| GET | `/api/images` | system-images instaladas + perfis de device (p/ provisionar) |
| GET | `/api/script/help` | ações suportadas + exemplo do roteiro |
| POST | `/api/devices/:id/script` | roda um roteiro (`{script}`) no device, passo a passo |
| POST | `/api/uploads` | sobe APK 1× (multipart `apk`) → `{token}` p/ reusar |
| POST | `/api/devices/:id/install` | instala APK por `{token}` (`adb install -r -g`) |
| GET | `/api/devices/:id/record?seconds=` | grava a tela e baixa o `.mp4` (`screenrecord`) |
| POST | `/api/provision` | (frontend) cria + sobe um AVD novo |
| GET | `/api/emulators` | lista AVDs e quais estão rodando |
| POST | `/api/emulators/:name/start` | sobe o AVD (headless, porta 555X) |
| POST | `/api/emulators/:name/stop` | derruba o AVD |
| POST | `/api/emulators` | cria AVD (`{name}`) e já sobe |
| WS | `/ws` | push da lista a cada mudança |

### Fluxo emulador
1. Backend detecta o SDK → habilita emuladores locais.
2. UI lista os AVDs na barra **Emuladores (AVD)**; clique ▶ p/ subir.
3. O emulador sobe headless, o `adb` o detecta, e ele aparece na grade.
4. Modal: Back/Home/Recents/Power (keyevent adb), **Shot** (screencap real), **Parar emulador**.

## Estrutura

```
src/                     # frontend
  main.jsx               # entrypoint React
  App.jsx                # orquestrador: filtros, suite, layout (usa useDevices)
  index.css              # Tailwind + keyframes (scanline)
  api/client.js          # REST + WebSocket client (devices + emuladores)
  hooks/useDevices.js    # estado ao vivo (fetch inicial + WS com reconnect)
  data/mock.js           # OSES + maps de status/teste (constantes de UI)
  components/
    FakeScreen.jsx       # tela animada (placeholder do stream contínuo)
    PhoneCard.jsx        # device no modo grade
    PhoneRow.jsx         # device no modo lista (denso)
    FocusModal.jsx       # zoom + AO VIVO + toque + Back/Home/Power/Vol/Girar/URL/texto
    LiveScreen.jsx       # stream MJPEG (<img>) + tap / long-press / swipe
    EmulatorBar.jsx      # barra de AVDs locais (start/stop)
    ProvisionModal.jsx   # criar AVD: nome + versão Android + perfil de device

server/                  # backend
  src/index.js           # Express + WS bootstrap + rotas (devices/emulador/stream/tap)
  src/manager.js         # DeviceManager: poll, merge status de teste, reconcilia emuladores
  src/emulators.js       # EmulatorManager: list/start/stop/create de AVDs locais
  src/stream.js          # MJPEG (multipart/x-mixed-replace) a partir do screencap
  src/frame.js           # downscale via sharp (PNG cheio → JPEG redimensionado)
  # APK: /api/uploads (multer) → /install por token; gravação: /record (screenrecord)
  src/devices/
    index.js             # chooseSource (adb quando disponível, senão mock)
    adbSource.js         # adb real — list/screenshot/input/tap/swipe/text (emulador + USB)
    mockSource.js        # fallback fake (sem SDK/adb)
```

## Funcionalidades (protótipo)

- Grade ajustável (4–7 col) **e** lista densa (escala p/ 10–50 telas)
- Status por device: online / booting / offline
- Status de teste: idle / running / pass / fail + contadores no header
- Filtros (status, tipo, versão Android) e **agrupar por OS**
- Multi-seleção + ações em lote (APK, limpar dados, screenshot, reiniciar)
- "Rodar suite" (simulado) e foco/zoom

## Próximos passos

Ver fases em `PLANO.md`. Imediato:
1. Trocar `src/data/mock.js` por client de API (REST/WS).
2. Fase 1: integrar `ws-scrcpy` p/ tela real de 1 Android no `FakeScreen`.
3. Fase 2: subir `redroid` em Docker e conectar N telas.

## App desktop / instalador (Electron)

Empacota tudo num app de desktop: a janela abre a UI e, por dentro, sobe o backend
(que serve front + API + WS). 1 processo, 1 clique.

```bash
npm run build                 # gera dist/ (front)
cd server && npm install      # deps do backend (vão junto no pacote)
cd ../desktop && npm install  # electron + electron-builder
npm start                     # roda o app desktop (dev)
npm run dist                  # gera o instalador Windows em desktop/release/
```

O instalador **não** inclui o Android SDK/emulador — o usuário instala o SDK e aceita
os termos do Google (ver `LICENSE`). O app apenas orquestra via `adb`/`emulator`.

## Roteiro de automação (script)

Botão **▶ Script** na toolbar abre um editor. 1 ação por linha; roda nos devices
**selecionados** (ou todos online) em paralelo, com resultado passo a passo.

```
# 1 ação por linha · # = comentário · coords 0–1
key home              # back | home | recents | power | volup | voldown
tap 0.5 0.92
swipe 0.5 0.8 0.5 0.25 300
text Olá mundo        # precisa de um campo de texto focado
openurl https://example.com
rotate 90
wait 800              # ou: sleep 800
```

Falha num passo não aborta o roteiro — cada passo reporta ✓/✕. Mesmas ações do
controle manual (via `adb input`). Servidor de automação completo (Appium) é futuro.

## Licença

**MIT** — use, modifique e distribua à vontade (ver [`LICENSE`](./LICENSE)).
O projeto **não** inclui nem redistribui o Android SDK/emulador — esses são do
Google e o usuário instala/aceita os termos por conta própria (ver [`NOTICE`](./NOTICE)).

## Marca

A identidade é o 🌾 + **PhoneFarm** (azul `#38bdf8` sobre fundo escuro `#020617`).
Favicon e ícone do header usam o emoji 🌾.

## Protótipo standalone

`prototype/index.html` — versão single-file (React+Tailwind via CDN), abre num
server estático qualquer. Mantida só como referência rápida; o app real é este scaffold.
