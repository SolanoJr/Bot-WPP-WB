import { ICommand } from './types';
import { getReacao } from '../../services/reacaoService';
import { groupTag } from './format';

export const reacaoCommand: ICommand = {
  name: 'reacao',
  description: 'Reage com emoji determinístico para uma palavra.',
  async execute(ctx) {
    const palavra = (ctx.args || []).join(' ').trim();
    if (!palavra) {
      return ctx.reply(`⚠️ Use: $reacao <palavra> (ex: $reacao geek)${groupTag(ctx)}`);
    }
    const r = getReacao(palavra);
    if (!r) {
      return ctx.reply(`❌ Nenhuma reação definida para "${palavra}". Tente: bom, ruim, feliz, triste, geek, nerd, programador.${groupTag(ctx)}`);
    }
    return ctx.reply(`${r} (reação para "${palavra}")${groupTag(ctx)}`);
  }
};
