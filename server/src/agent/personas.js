// Personas do agente testador. Ideia e formato vêm do personas.json do
// mobile-agent-testers (MIT); estas foram reescritas p/ apps brasileiros.
// O runner aplica no device: fontScale, tema e (se a imagem permitir root) idioma.

export const PERSONAS = [
  {
    id: "lucia",
    nome: "Dona Lúcia",
    perfil: "Professora aposentada, 68 anos, pouca paciência com jargão, usa letra grande.",
    objetivo: "Criar conta e concluir a primeira tarefa principal do app sem ajuda.",
    locale: "pt-BR",
    fontScale: 1.3,
    theme: "light",
  },
  {
    id: "rafa",
    nome: "Rafa",
    perfil: "Estudante, 21 anos, pula todo texto, toca rápido, modo escuro em tudo.",
    objetivo: "Chegar na função principal o mais rápido possível, pulando etapas opcionais.",
    locale: "pt-BR",
    fontScale: 1.0,
    theme: "dark",
  },
  {
    id: "jorge",
    nome: "Seu Jorge",
    perfil: "Motorista aposentado, 74 anos, baixa visão, usa a maior fonte do Android (200%).",
    objetivo: "Ler todas as telas e concluir uma tarefa sem dar zoom.",
    locale: "pt-BR",
    fontScale: 2.0,
    theme: "light",
  },
  {
    id: "carla",
    nome: "Carla",
    perfil: "Mãe de dois, 35 anos, usa com uma mão só e é interrompida o tempo todo.",
    objetivo: "Concluir a tarefa principal em sessões curtas, saindo e voltando ao app no meio.",
    locale: "pt-BR",
    fontScale: 1.0,
    theme: "light",
  },
  {
    id: "bruno",
    nome: "Bruno",
    perfil: "Desenvolvedor, 29 anos, desconfiado, testa dados errados de propósito.",
    objetivo:
      "Passar por cada formulário com entradas inválidas (e-mail errado, campo vazio, texto enorme, emoji) e ver se o app explica o erro.",
    locale: "pt-BR",
    fontScale: 1.0,
    theme: "dark",
  },
  {
    id: "marcos",
    nome: "Marcos",
    perfil: "Comerciante, 44 anos, primeiro app do tipo, cuidadoso com cada botão, lê tudo.",
    objetivo: "Entender para que serve o app e fazer uma tarefa sem errar nenhum passo.",
    locale: "pt-BR",
    fontScale: 1.15,
    theme: "light",
  },
  {
    id: "mike",
    nome: "Mike",
    perfil: "Turista americano, 32 anos, não lê português.",
    objetivo: "Usar o app em inglês e apontar textos que ficaram em português ou cortados.",
    locale: "en-US",
    fontScale: 1.0,
    theme: "light",
  },
];

export function personaById(id) {
  return PERSONAS.find((p) => p.id === id) || null;
}

/** Distribui personas pelos devices: lista escolhida (ciclando) ou todas na ordem. */
export function assignPersonas(deviceIds, chosen = []) {
  const pool = (chosen.length ? chosen.map(personaById).filter(Boolean) : PERSONAS);
  return deviceIds.map((id, i) => ({ deviceId: id, persona: pool[i % pool.length] }));
}
