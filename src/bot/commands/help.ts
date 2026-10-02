import { ICommand } from './types';

/**
 * $help — lista os comandos disponíveis com descrição e permissão.
 *
 * REGRA: só documentar comandos que EXISTEM no registro (`commands` em index.ts).
 * Nomes seguem a nomenclatura oficial do AutoMod.
 */
export const helpCommand: ICommand = {
    name: 'help',
    description: 'Lista os comandos disponíveis.',

    async execute(ctx) {
        const response = [
            '🤖 *Comandos disponíveis*',
            '',
            'Digite `$` seguido do nome do comando.',
            '',
            '🛡️ *AUTOMOD* _(apenas administradores)_',
            '  $automod status - mostra o estado de todas as automações',
            '  $automod on|off - liga/desliga a moderação',
            '  $antispam on|off - Anti-Spam',
            '  $antilink on|off - Anti-Link',
            '  $antibot on|off - Anti-Bot',
            '  $anticassino on|off - Anti-Cassino',
            '  $antiestrangeiro on|off - Anti-Estrangeiro',
            '  $punicao on|off - bane/expulsa ao detectar',
            '  $anuncio on|off - anuncia a ação no grupo',
            '  $auditonly on|off - modo auditoria (não executa ação)',
            '',
            '⚙️ *AUTOMAÇÕES* _(apenas administradores)_',
            '  $bemvindo on|off - boas-vindas a novos membros',
            '  $setwelcome - mostra a mensagem de boas-vindas',
            '  $setwelcome <texto> - substitui a mensagem',
            '  $setwelcome reset - restaura o padrão',
            '  $apresentacao on|off|status - apresentações no grupo',
            '',
            '👮 *ADMINISTRAÇÃO* _(apenas administradores)_',
            '  $kick @membro - remove do grupo',
            '  $ban @membro - bane e remove',
            '  $banidos - lista os banidos',
            '  $mute / $desmute - silencia / desilencia',
            '  $promover @membro - promove a administrador',
            '  $grupos - informações do grupo',
            '  $admin - ajuda de administração',
            '',
            '👤 *USUÁRIO*',
            '  $help - esta lista',
            '  $menu - menu principal',
            '  $ping - testa a conexão',
            '  $alive - verifica se o bot está online',
            '  $ondeestou - gera link de localização',
            '  $apresentar - inicia sua apresentação',
            '  $feedback - envia sugestão',
            '',
            '🧠 *INTELIGÊNCIA*',
            '  $pergunta <texto> - pergunta para a IA',
            '  $fakechat - conversa simulada',
            '  $cantada - cantada aleatória',
            '',
            '🎮 *JOGOS & DIVERSÃO*',
            '  $jogos - lista os jogos',
            '  $piada · $conselho · $aleatoria · $cantada',
            '  $votar · $voto · $delvoto - votações',
            '',
            '🔧 *UTILITÁRIOS*',
            '  $clima <cidade> - previsão do tempo',
            '  $nick <apelido> - define apelido',
            '  $gtts <texto> - texto em áudio',
            '  $sendmsg · $addcmd · $cmdtoggle',
            '  $stats · $info - informações do bot',
            '',
            '_Use $menu para a visão geral._'
        ].join('\n');

        await ctx.reply(response);
    }
};
