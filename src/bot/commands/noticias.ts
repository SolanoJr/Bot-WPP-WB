import { ICommand } from './types';
import { askAI } from '../../services/aiService';

export const noticiasCommand: ICommand = {
    name: 'noticias',
    description: 'Busca as 3 principais notícias de tecnologia do dia',
    async execute(ctx: any, _client?: any, _args?: any) {
        await ctx.reply('📰 _Buscando notícias relevantes via IA..._');
        
        const prompt = "Resuma as 3 notícias mais importantes de tecnologia, ciência ou concursos do dia de hoje. Seja conciso e use um tom profissional. Formate como uma lista numerada.";
        const response = await askAI(prompt);
        
        await ctx.reply(`🌍 **TOP NOTÍCIAS DO DIA**\n\n${response}`);
    }
};
