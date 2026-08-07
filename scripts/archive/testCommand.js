const { helpCommand, menuCommand, pingCommand, aliveCommand, banCommand, kickCommand, muteCommand, promoteCommand, forcaCommand, velhaCommand, sorteioCommand, climaCommand, nickCommand, gttsCommand } = require('./dist/bot/commands');

// Mock message object
const mockMsg = {
    reply: async (text) => { console.log('REPLY:', text); },
    getChat: async () => ({ isGroup: true, participants: [], id: { _serialized: '123@c.us' } }),
    mentionedIds: [],
    author: 'owner@c.us',
    body: '$help',
};

(async () => {
    console.log('--- Testing helpCommand ---');
    await helpCommand.execute(mockMsg, null, []);
    console.log('--- Testing menuCommand ---');
    await menuCommand.execute(mockMsg, null, []);
    console.log('--- Testing pingCommand ---');
    await pingCommand.execute(mockMsg, null, []);
    console.log('--- Testing aliveCommand ---');
    await aliveCommand.execute(mockMsg, null, []);
    console.log('--- Testing forcaCommand ---');
    await forcaCommand.execute(mockMsg, null, []);
    console.log('--- Testing velhaCommand ---');
    await velhaCommand.execute(mockMsg, null, []);
    console.log('--- Testing sorteioCommand ---');
    await sorteioCommand.execute(mockMsg, null, []);
    console.log('--- Testing climaCommand ---');
    await climaCommand.execute(mockMsg, null, []);
    console.log('--- Testing nickCommand ---');
    await nickCommand.execute(mockMsg, null, []);
    console.log('--- Testing gttsCommand ---');
    await gttsCommand.execute(mockMsg, null, []);
})();
