import { ICommand } from './types';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export const gttsCommand: ICommand = {
    name: 'gtts',
    description: 'Converte texto em áudio e envia como mensagem de voz.',
    async execute(ctx) {
        const args = ctx.args || [];
        if (args.length === 0) {
            await ctx.reply('❌ Por favor, digite o texto para converter. Exemplo: $gtts Olá mundo');
            return;
        }

        const text = args.join(' ');
        
        // Limitar texto a 200 caracteres para evitar problemas
        if (text.length > 200) {
            await ctx.reply('❌ Texto muito longo. Limite: 200 caracteres.');
            return;
        }

        try {
            // Usando Google Translate TTS API (gratuita)
            const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=pt-BR&client=tw-ob`;
            
            // Fazer download do áudio
            const response = await axios.get(ttsUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // Criar diretório temporário se não existir
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Salvar arquivo temporário
            const audioPath = path.join(tempDir, `tts_${Date.now()}.mp3`);
            fs.writeFileSync(audioPath, response.data);

            // Ler o áudio como buffer e enviar como mensagem de voz (agnóstico de plataforma)
            const audioBuffer = fs.readFileSync(audioPath);
            await ctx.client.sendMedia(ctx.chatId, {
              type: 'audio',
              data: audioBuffer,
              filename: 'tts.mp3',
              mimetype: 'audio/mpeg',
            }, undefined, { sendAudioAsVoice: true });

            // Limpar arquivo temporário após envio
            setTimeout(() => {
              try {
                fs.unlinkSync(audioPath);
              } catch (e) {
                // Ignorar erro ao deletar
              }
            }, 5000);

        } catch (error) {
            console.error('Erro ao converter texto para voz:', error);
            await ctx.reply('⚠️ Erro ao converter texto para voz. Tente novamente mais tarde.');
        }
    }
};
