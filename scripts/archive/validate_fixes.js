const { loadCommands } = require('./dist/bot/commands/index.js');
const cmds = loadCommands();

const mockMsg = {
    reply: (t) => console.log('REPLY:', t),
    author: '5588998314322@c.us', // Seu número Master
    from: 'group123@g.us',
    mentionedIds: ['999999999@c.us'],
    getChat: async () => ({
        isGroup: true,
        id: { _serialized: 'group123@g.us' },
        fetchMessages: async () => [
            { author: '999999999@c.us', delete: async () => console.log('Mensagem deletada') }
        ],
        removeParticipants: async (ids) => console.log('Removendo participantes:', ids)
    })
};

const mockClient = {
    info: { wid: { _serialized: 'bot123@c.us' } },
    getChatById: async () => ({
        id: { _serialized: 'group123@g.us' },
        participants: [
            { id: { _serialized: 'bot123@c.us' }, isAdmin: true },
            { id: { _serialized: '5588998314322@c.us' }, isAdmin: false }, // Master não precisa ser admin
            { id: { _serialized: '999999999@c.us' }, isAdmin: false }
        ]
    }),
    blockContact: async (id) => console.log('Bloqueando contato:', id)
};

(async () => {
    console.log('--- TESTANDO COMANDO $PERGUNTA ---');
    try {
        const pergunta = cmds.get('pergunta');
        await pergunta.execute(mockMsg, mockClient, ['Qual', 'a', 'capital', 'do', 'Brasil?']);
    } catch (e) {
        console.error('Erro no teste de pergunta:', e);
    }

    console.log('\n--- TESTANDO COMANDO $BAN ---');
    try {
        const ban = cmds.get('ban');
        await ban.execute(mockMsg, mockClient, []);
    } catch (e) {
        console.error('Erro no teste de ban:', e);
    }
})();
