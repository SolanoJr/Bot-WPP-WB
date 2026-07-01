import { ICommand } from './types';
import { forcaState } from './gameState';

// Lista simples de palavras para o jogo da forca
const WORDS = [
  'javascript', 'typescript', 'nodejs', 'whatsapp', 'bot', 'programacao',
  'desenvolvedor', 'algoritmo', 'computador', 'tecnologia'
];

function pickRandomWord(): string {
  const idx = Math.floor(Math.random() * WORDS.length);
  return WORDS[idx].toUpperCase();
}

function renderWord(word: string, guessed: Set<string>): string {
  return word
    .split('')
    .map((c) => (guessed.has(c) ? c : '_'))
    .join(' ');
}

export const forcaCommand: ICommand = {
  name: 'forca',
  description: 'Jogo da forca. Use "$forca" para iniciar, "$forca <letra>" para chutar, "$forca reset" para reiniciar.',
  async execute(msg, client, args) {
    const chatId = msg.from || msg.author || 'unknown';
    // Inicializa estado se ainda não existir
    if (!forcaState.has(chatId) || args[0]?.toLowerCase() === 'reset') {
      const word = pickRandomWord();
      forcaState.set(chatId, {
        word,
        guessed: new Set<string>(),
        attemptsLeft: 6,
      });
      await msg.reply(`🕹️ Jogo da Forca iniciado!\n${renderWord(word, new Set())}\nTentativas restantes: 6`);
      return;
    }

    const state = forcaState.get(chatId)!;
    const guess = args[0]?.toUpperCase();

    if (!guess || guess.length !== 1 || !/[A-Z]/.test(guess)) {
      await msg.reply('⚠️ Use uma única letra (A‑Z) ou "reset" para reiniciar o jogo.');
      return;
    }

    if (state.guessed.has(guess)) {
      await msg.reply(`🔁 Você já tentou a letra "${guess}".\n${renderWord(state.word, state.guessed)}\nTentativas restantes: ${state.attemptsLeft}`);
      return;
    }

    state.guessed.add(guess);
    if (!state.word.includes(guess)) {
      state.attemptsLeft -= 1;
    }

    const displayed = renderWord(state.word, state.guessed);
    if (!displayed.includes('_')) {
      // Vitória
      forcaState.delete(chatId);
      await msg.reply(`🎉 Parabéns! Você acertou a palavra: ${state.word}`);
      return;
    }

    if (state.attemptsLeft <= 0) {
      // Derrota
      const lostWord = state.word;
      forcaState.delete(chatId);
      await msg.reply(`❌ Você perdeu! A palavra era: ${lostWord}`);
      return;
    }

    await msg.reply(`✅ Letra "${guess}" registrada.\n${displayed}\nTentativas restantes: ${state.attemptsLeft}`);
  },
};
