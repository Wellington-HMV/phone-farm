# Phone Farm — QA

Painel web de farm de celulares **Android** para QA: grade/lista de devices com
tela ao vivo, status de teste (pass/fail) e controle remoto. Veja arquitetura e
decisões em [`PLANO.md`](./PLANO.md).

> 🏁 **v0.1 — primeira versão funcional.** Cada "celular" é um **emulador Android (AVD)**
> rodando na mesma máquina (device USB também funciona). Sobe/derruba pela UI, a grade
> **espelha a tela real** ao vivo, e o modal dá **controle total** (toque, teclas, APK,
> gravação). Sem SDK/adb, cai em **mock**. Próximo: empacotar p/ instalar em outras máquinas.
>
> **Interação:** grade = espelho (só visual); **duplo-clique** ou ⤢ expande; modal =
> toque/arraste/long-press + Back/Home/Power/Vol/Girar/URL/texto/APK/gravar. Lista = animação leve.

## Pré-requisitos p/ emuladores locais

- **Android SDK** (Android Studio já basta) com `emulator`, `platform-tools`, `cmdline-tools`.
- `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) apontando p/ o SDK.
- Pelo menos 1 **system-image** + 1 AVD (crie no Android Studio ou via "+ Provisionar").
- Virtualização ligada (WHPX no Windows / KVM no Linux) p/ emulador acelerado.

## Rodar

Dois processos — backend e frontend.

```bash
# terminal 1 — backend (porta 4000)
cd server && npm install && npm run dev
#   sem device/adb → cai em mock automaticamente
#   FORCE_MOCK=1 npm run dev   (força mock)
#   FORCE_ADB=1  npm run dev   (força adb)

# terminal 2 — frontend (porta 5173, proxia /api e /ws p/ o backend)
npm install && npm run dev
```

`npm run build` / `npm run preview` para o frontend de produção.

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

## Protótipo standalone

`prototype/index.html` — versão single-file (React+Tailwind via CDN), abre num
server estático qualquer. Mantida só como referência rápida; o app real é este scaffold.
