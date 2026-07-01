// Sistema de votação local (substitui o vote.js do astabot)
interface Vote {
  id: string;
  motivo: string;
  valor: string;
  duracao: number;
  votos: Map<string, 'sim' | 'nao'>; // userId -> voto
  timeoutId?: NodeJS.Timeout;
}

const votes: Map<string, Vote> = new Map();

export async function addVote(
  id: string,
  motivo: string,
  valor: string,
  duracaoSeg: number,
  replyFn: (msg: string) => Promise<void>
): Promise<void> {
  if (votes.has(id)) {
    await replyFn(`⚠️ Votação com ID "${id}" já existe.`);
    return;
  }

  const duracaoMs = duracaoSeg * 1000;
  const vote: Vote = {
    id,
    motivo,
    valor,
    duracao: duracaoSeg,
    votos: new Map(),
  };

  // Timeout para finalizar votação
  vote.timeoutId = setTimeout(async () => {
    await finalizarVotacao(id, replyFn);
  }, duracaoMs);

  votes.set(id, vote);
  await replyFn(`🗳️ Votação iniciada!\nID: ${id}\nMotivo: ${motivo}\nValor: ${valor}\nDuração: ${duracaoSeg}s\n\nVote com: $voto ${id} sim/não`);
}

export async function registrarVoto(
  id: string,
  userId: string,
  voto: 'sim' | 'nao',
  replyFn: (msg: string) => Promise<void>
): Promise<void> {
  const vote = votes.get(id);
  if (!vote) {
    await replyFn(`⚠️ Votação "${id}" não encontrada.`);
    return;
  }

  if (vote.votos.has(userId)) {
    await replyFn(`⚠️ Você já votou nesta votação.`);
    return;
  }

  vote.votos.set(userId, voto);
  await replyFn(`✅ Voto "${voto}" registrado para votação ${id}.`);
}

export async function delVote(id: string): Promise<void> {
  const vote = votes.get(id);
  if (vote?.timeoutId) {
    clearTimeout(vote.timeoutId);
  }
  votes.delete(id);
}

async function finalizarVotacao(id: string, replyFn: (msg: string) => Promise<void>): Promise<void> {
  const vote = votes.get(id);
  if (!vote) return;

  const sim = Array.from(vote.votos.values()).filter(v => v === 'sim').length;
  const nao = Array.from(vote.votos.values()).filter(v => v === 'nao').length;

  let resultado = `📊 Votação "${id}" finalizada!\nMotivo: ${vote.motivo}\nValor: ${vote.valor}\n\nSim: ${sim}\nNão: ${nao}\n`;
  
  if (sim > nao) {
    resultado += `\n✅ Aprovado!`;
  } else if (nao > sim) {
    resultado += `\n❌ Rejeitado.`;
  } else {
    resultado += `\n🤝 Empate.`;
  }

  await replyFn(resultado);
  votes.delete(id);
}

export function getVote(id: string): Vote | undefined {
  return votes.get(id);
}

export function listVotes(): Vote[] {
  return Array.from(votes.values());
}