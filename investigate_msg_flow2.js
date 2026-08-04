// Investigation script: Find where WAWebCollections.Msg is populated
// Run this in the browser console after WhatsApp Web is loaded

console.log('=== INICIANDO INVESTIGAÇÃO: ENCONTRAR ONDE WAWebCollections.Msg É POPULADO ===');

const { Msg, Chat, Contact } = window.require('WAWebCollections');

console.log('1. State initial de Msg:');
console.log('   Msg.get:', typeof Msg.get);
console.log('   Msg.add:', typeof Msg.add);
console.log('   Msg.set:', typeof Msg.set);
console.log('   Msg.on:', typeof Msg.on);
console.log('   Msg.has:', typeof Msg.has);

// Obter uma referência para um chat para testar
const { getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
const meUser = getMaybeMePnUser();
const chatWid = meUser; // Usar o próprio chat para enviar mensagem de teste

console.log('\n2. Obter referência para um chat:');
console.log('   meUser:', meUser._serialized);

let testChat;
try {
    testChat = Chat.get(chatWid) || await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
    console.log('   ✓ Chat encontrado:', testChat.id._serialized);
} catch (e) {
    console.error('   ✗ Erro ao obter chat:', e);
    return;
}

// 3. Criar um novo MsgKey para a mensagem de teste
console.log('\n3. Criando novo MsgKey para teste:');
const newId = await window.require('WAWebMsgKey').newId();
const newMsgKey = new (window.require('WAWebMsgKey'))({
    from: meUser,
    to: testChat.id,
    id: newId,
    participant: window.require('WAWebWidFactory').asUserWidOrThrow(meUser),
    selfDir: 'out',
});

console.log('   newMsgKey._serialized:', newMsgKey._serialized);
console.log('   newMsgKey.$1:', newMsgKey.$1);
console.log('   newMsgKey.id:', newMsgKey.id);

// 4. Verificar estado inicial em Msg.get()
const msgKeyId = window.WWebJS.getMsgKeyId(newMsgKey);
console.log('\n4. Estado inicial em Msg.get(msgKeyId):', Msg.get(msgKeyId) ? 'ENCONTRADA' : 'NÃO ENCONTRADA');

// 5. Hook para detectar quando Msg.add ou Msg.set é chamada
console.log('\n5. Configurando hooks para rastrear adição:');
const originalAdd = Msg.add;
const originalSet = Msg.set;
let addCalled = false;
let setCalled = false;

Msg.add = function(...args) {
    addCalled = true;
    console.log('\n=== [HOOK] Msg.add CHAMADO ===');
    console.log('   Argumentos:', args);
    console.log('   args[0]:', args[0]);
    if (args[0]) {
        console.log('   args[0].id:', args[0].id);
        console.log('   args[0].id._serialized:', args[0].id?._serialized);
        console.log('   args[0].id.$1:', args[0].id?.$1);
        console.log('   args[0].isNewMsg:', args[0].isNewMsg);
    }
    console.trace('Stack trace de Msg.add:');
    return originalAdd.apply(this, args);
};

Msg.set = function(...args) {
    setCalled = true;
    console.log('\n=== [HOOK] Msg.set CHAMADO ===');
    console.log('   Argumentos:', args);
    console.log('   args[0]:', args[0]);
    if (args[0]) {
        console.log('   args[0].id:', args[0].id);
        console.log('   args[0].id._serialized:', args[0].id?._serialized);
        console.log('   args[0].id.$1:', args[0].id?.$1);
        console.log('   args[0].isNewMsg:', args[0].isNewMsg);
    }
    console.trace('Stack trace de Msg.set:');
    return originalSet.apply(this, args);
};

// 6. Hook para interceptar evento 'add' do Msg
console.log('\n6. Configurando hook para evento Msg.add:');
Msg.on('add', (msg) => {
    console.log('\n=== [EVENTO] Msg.on(add) ===');
    console.log('   msg.id:', msg.id);
    console.log('   msg.id._serialized:', msg.id?._serialized);
    console.log('   msg.id.$1:', msg.id?.$1);
    console.log('   msg.isNewMsg:', msg.isNewMsg);
    console.log('   msg.from:', msg.from);
    console.log('   msg.to:', msg.to);
    console.log('   msg.body:', msg.body);
    console.trace('Stack de Msg.on(add):');
});

// 7. HOOK PARA INTERCEPTAR Chat.msgs
console.log('\n7. Interceptando Chat.msgs:');
if (testChat.msgs) {
    console.log('   testChat.msgs existe:', testChat.msgs);
    console.log('   testChat.msgs.add:', typeof testChat.msgs.add);
    console.log('   testChat.msgs.set:', typeof testChat.msgs.set);
    
    const originalChatAdd = testChat.msgs.add;
    const originalChatSet = testChat.msgs.set;
    
    testChat.msgs.add = function(...args) {
        console.log('\n=== [HOOK] Chat.msgs.add CHAMADO ===');
        console.log('   Argumentos:', args);
        console.log('   args[0]:', args[0]);
        if (args[0]) {
            console.log('   args[0].id:', args[0].id);
            console.log('   args[0].id._serialized:', args[0].id?._serialized);
            console.log('   args[0].isNewMsg:', args[0].isNewMsg);
        }
        console.trace('Stack de Chat.msgs.add:');
        return originalChatAdd.apply(this, args);
    };
    
    testChat.msgs.set = function(...args) {
        console.log('\n=== [HOOK] Chat.msgs.set CHAMADO ===');
        console.log('   Argumentos:', args);
        console.log('   args[0]:', args[0]);
        if (args[0]) {
            console.log('   args[0].id:', args[0].id);
            console.log('   args[0].id._serialized:', args[0].id?._serialized);
            console.log('   args[0].isNewMsg:', args[0].isNewMsg);
        }
        console.trace('Stack de Chat.msgs.set:');
        return originalChatSet.apply(this, args);
    };
    
    // Hook para evento 'add' de Chat.msgs
    if (testChat.msgs.on) {
        testChat.msgs.on('add', (msg) => {
            console.log('\n=== [EVENTO] Chat.msgs.on(add) ===');
            console.log('   msg.id:', msg.id);
            console.log('   msg.id._serialized:', msg.id?._serialized);
            console.log('   msg.isNewMsg:', msg.isNewMsg);
            console.trace('Stack de Chat.msgs.on(add):');
        });
    }
}

// 8. Chamar addAndSendMsgToChat e rastrear
console.log('\n8. Chamando addAndSendMsgToChat:');
const WWebJS = window.WWebJS;
const sendMsgChatAction = window.require('WAWebSendMsgChatAction');

const message = {
    id: newMsgKey,
    ack: 0,
    body: 'TEST MESSAGE ' + Date.now(),
    from: meUser,
    to: testChat.id,
    local: true,
    self: 'out',
    t: parseInt(Date.now() / 1000),
    isNewMsg: true,
    type: 'chat',
};

console.log('   message.id:', message.id._serialized);
console.log('   message.isNewMsg:', message.isNewMsg);

const [msgPromise, sendMsgResultPromise] = sendMsgChatAction.addAndSendMsgToChat(testChat, message);

console.log('   msgPromise:', msgPromise);
console.log('   sendMsgResultPromise:', sendMsgResultPromise);

// 9. Aguardar msgPromise e verificar
console.log('\n9. Aguardando msgPromise...');
await msgPromise;
console.log('   msgPromise resolvida');

console.log('\n10. Verificando estado após msgPromise:');
console.log('   addCalled (Msg.add):', addCalled);
console.log('   setCalled (Msg.set):', setCalled);
console.log('   Msg.get(msgKeyId):', Msg.get(msgKeyId) ? 'ENCONTRADA' : 'NÃO ENCONTRADA');
if (Msg.get(msgKeyId)) {
    console.log('   -> msg.id._serialized:', Msg.get(msgKeyId).id?._serialized);
    console.log('   -> msg.id.$1:', Msg.get(msgKeyId).id?.$1);
    console.log('   -> msg.isNewMsg:', Msg.get(msgKeyId).isNewMsg);
    console.log('   -> msg.ack:', Msg.get(msgKeyId).ack);
}

if (testChat.msgs) {
    console.log('   testChat.msgs.get(msgKeyId):', testChat.msgs.get(msgKeyId) ? 'ENCONTRADA' : 'NÃO ENCONTRADA');
    if (testChat.msgs.get(msgKeyId)) {
        console.log('   -> msg.id._serialized:', testChat.msgs.get(msgKeyId).id?._serialized);
        console.log('   -> msg.isNewMsg:', testChat.msgs.get(msgKeyId).isNewMsg);
    }
}

// 10. Aguardar sendMsgResultPromise e verificar
console.log('\n11. Aguardando sendMsgResultPromise...');
const sendMsgResult = await sendMsgResultPromise;
console.log('   sendMsgResult:', sendMsgResult);

console.log('\n12. Verificando estado após sendMsgResultPromise:');
console.log('   addCalled (Msg.add):', addCalled);
console.log('   setCalled (Msg.set):', setCalled);
console.log('   Msg.get(msgKeyId):', Msg.get(msgKeyId) ? 'ENCONTRADA' : 'NÃO ENCONTRADA');
if (Msg.get(msgKeyId)) {
    console.log('   -> msg.id._serialized:', Msg.get(msgKeyId).id?._serialized);
    console.log('   -> msg.id.$1:', Msg.get(msgKeyId).id?.$1);
    console.log('   -> msg.isNewMsg:', Msg.get(msgKeyId).isNewMsg);
    console.log('   -> msg.ack:', Msg.get(msgKeyId).ack);
    console.log('   -> msg.serverId:', Msg.get(msgKeyId).serverId);
}

if (testChat.msgs) {
    console.log('   testChat.msgs.get(msgKeyId):', testChat.msgs.get(msgKeyId) ? 'ENCONTRADA' : 'NÃO ENCONTRADA');
    if (testChat.msgs.get(msgKeyId)) {
        console.log('   -> msg.id._serialized:', testChat.msgs.get(msgKeyId).id?._serialized);
        console.log('   -> msg.isNewMsg:', testChat.msgs.get(msgKeyId).isNewMsg);
    }
}

// 11. Polling para encontrar o momento exato
console.log('\n13. Polling Msg.get() para encontrar momento exato:');
for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 50));
    const msg = Msg.get(msgKeyId);
    if (msg) {
        console.log(`[${i*50}ms] MsgStore.get(msgKeyId) = ENCONTRADA`);
        console.log('   -> msg.id._serialized:', msg.id?._serialized);
        console.log('   -> msg.id.$1:', msg.id?.$1);
        console.log('   -> msg.isNewMsg:', msg.isNewMsg);
        console.log('   -> msg.ack:', msg.ack);
        console.log('   -> msg.serverId:', msg.serverId);
        break;
    } else {
        if (i % 5 === 0) {
            console.log(`[${i*50}ms] MsgStore.get(msgKeyId) = NÃO ENCONTRADA`);
        }
    }
}

// 12. Listar todas as coleções possíveis de mensagens
console.log('\n14. Procurando todas as coleções de mensagens possíveis:');
const WAWebCollections = window.require('WAWebCollections');
console.log('   Chaves WAWebCollections:', Object.keys(WAWebCollections));

for (const key of Object.keys(WAWebCollections)) {
    if (key.includes('Msg') || key.includes('msg')) {
        const store = WAWebCollections[key];
        console.log('\n   Coleção:', key, '(tipo:', typeof store, ')');
        if (store.get) {
            const result = store.get(msgKeyId);
            if (result) {
                console.log('     -> Msg.get() = ENCONTRADA!');
                console.log('     -> resultado.id:', result.id?._serialized || result.id?.$1);
                console.log('     -> resultado.isNewMsg:', result.isNewMsg);
            }
        }
    }
}

console.log('\n=== INVESTIGAÇÃO CONCLUÍDA ===');