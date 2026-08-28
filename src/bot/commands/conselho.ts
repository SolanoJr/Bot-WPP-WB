import { ICommand } from './types';
import { palavrasc } from './conselhos';

export const conselhoCommand: ICommand = {
    name: 'conselho',
    description: 'Envia um conselho aleatório.',
    
    async execute(ctx) {
        const random = Math.floor(Math.random() * palavrasc.length);
        await ctx.reply(palavrasc[random]);
    }
};
