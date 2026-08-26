import { ICommand } from './types';
import { CommandContext } from '../../platforms/base/PlatformTypes';
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
  async execute(ctx: CommandContext) {
    const chatId = ctx.chatId || ctx.userId || 'unknown';
    // Inicializa estado se ainda não existir
    if (!forcaState.has(chatId) || ctx.args[0]?.toLowerCase() === 'reset') {
      const word = pickRandomWord();
      forcaState.set(chatId, {
        word,
        guessed: new Set<string>(),
        attemptsLeft: 6,
      });
      await ctx.reply(`🕹️ Jogo da Forca iniciado!\n${renderWord(word, new Set())}\nTentativas restantes: 6`);
      return;
    }

    const state = forcaState.get(chatId)!;
    const guess = ctx.args[0]?.toUpperCase();

    if (!guess || guess.length !== 1 || !/[A-Z]/.test(guess)) {
      await ctx.reply('⚠️ Use uma única letra (A‑Z) ou "reset" para reiniciar o jogo.');
      return;
    }

    if (state.guessed.has(guess)) {
      await ctx.reply(`🔁 Você já tentou a letra "${guess}".\n${renderWord(state.word, state.guessed)}\nTentativas restantes: ${state.attemptsLeft}`);
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
      await ctx.reply(`🎉 Parabéns! Você acertou a palavra: ${state.word}`);
      return;
    }

    if (state.attemptsLeft <= 0) {
      // Derrota
      const lostWord = state.word;
      forcaState.delete(chatId);
      await ctx.reply(`❌ Você perdeu! A palavra era: ${lostWord}`);
      return;
    }

    await ctx.reply(`✅ Letra "${guess}" registrada.\n${displayed}\nTentativas restantes: ${state.attemptsLeft}`);
  },
};
