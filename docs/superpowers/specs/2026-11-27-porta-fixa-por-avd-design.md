# Porta fixa por AVD (design curto)

Data: 2026-11-27 · Status: aprovado

## Intenção
Cada device virtual criado na tela de devices é um AVD próprio, rodando como emulador próprio, numa **porta própria e fixa**. Deve usar a placa de vídeo quando houver. A faixa de portas é configurável: o padrão é a faixa atual, mas dá para ampliar e ter mais emuladores.

## Fatos verificados (emulador 36.5.11, Windows, GTX 1060)
- `-port` aceita portas fora da faixa da ajuda (5600, 9282 e 8337 bootaram). O adb vê o emulador como `emulator-<porta>`, e a porta adb é console+1.
- `-gpu auto` usa a GPU do host (renderer `OpenGL ES 3.1 (NVIDIA …)`). `-qt-hide-window` funciona.

## Abordagens
1. **Mapa persistido AVD→porta, atribuído uma vez** (escolhida). A porta nunca muda nem é reaproveitada por outro AVD.
2. Porta derivada de um hash do nome. Descartada: colisões e portas sem padrão.
3. Porta livre escolhida a cada start (o que existe hoje). Descartada: a porta muda e o cache de nomes troca de AVD (bug A).

## Design
- **Configuração** por env: `PF_EMU_PORT_MIN` (padrão 5554) e `PF_EMU_PORT_MAX` (padrão 5584), em passos de 2 (porta par, adb = porta+1). Valores inválidos (não numéricos, ímpares, MIN>MAX, fora de 1024–65534) geram erro claro no boot do servidor.
- **Persistência**: `~/.phone-farm/emulator-ports.json` (`{ "<avd>": <porta> }`), com override por `PF_EMU_PORTS_FILE`. Escrita atômica (tmp + rename).
- **Atribuição**: no `create` e, para AVDs antigos, no primeiro `start`. Pega a menor porta da faixa que não está no mapa. Faixa esgotada gera o erro `sem porta livre na faixa MIN–MAX — aumente PF_EMU_PORT_MAX`. AVD apagado (fora do `listAvds`) libera a porta na próxima atribuição.
- **Porta fora da faixa nova** (o usuário reduziu a faixa): mantém a porta salva. Ela continua fixa.
- **Start**: se a porta do AVD já aparece no `adb devices` com outro AVD, ou o processo morre logo no início (cerca de 3s ou `exit` antes do boot), retorna erro com a porta. Não pula para outra porta.
- **GPU**: `-gpu auto` por padrão, com override por `PF_EMU_GPU` (`auto|host|swiftshader_indirect|…`).
- **Correção A**: `ensureNames` remove do `nameCache` os serials que não estão mais vivos. O start de um AVD invalida o cache do serial dele.
- **API e UI**: `statusList` inclui `port`, e a EmulatorBar mostra a porta.
- **README**: seção com as variáveis e o ajuste do texto "headless" (a janela fica oculta, não é headless de fato).

## Testes
- Unitários de alocação: reserva, reuso, faixa cheia, env inválida, persistência e recarga do arquivo, liberação de AVD apagado.
- Unitário do cache de nomes: a reprodução do bug A vira teste do repo.
- Validação manual: subir 2 AVDs reais e conferir a porta fixa depois de um restart.

## Fora de escopo
redroid/Linux, escala para 10–50, mudar a porta de um AVD pela UI.
