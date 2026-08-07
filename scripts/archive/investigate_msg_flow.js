/**
 * Investigation script to trace the message flow in WhatsApp Web
 * Run this in the browser console after WhatsApp Web is loaded
 * Or inject via puppeteer page.evaluate()
 */

// This script traces: newMsgKey -> addAndSendMsgToChat -> msgPromise -> sendMsgResultPromise -> Store -> WAWebCollections.Msg -> Msg.get()

async function investigateMessageFlow() {
    const WWebJS = window.WWebJS;
    const MsgStore = window.require('WAWebCollections').Msg;
    const ChatStore = window.require('WAWebCollections').Chat;
    
    console.log('=== INVESTIGAÇÃO DO FLUXO DE MENSAGEM ===');
    console.log('MsgStore:', !!MsgStore);
    console.log('MsgStore.get:', typeof MsgStore.get);
    console.log('MsgStore.add:', typeof MsgStore.add);
    console.log('MsgStore.set:', typeof MsgStore.set);
    console.log('MsgStore.on:', typeof MsgStore.on);
    
    // 1. Find a chat to send test message
    const chatWid = window.require('WAWebWidFactory').createWid('558898314322@c.us'); // change to test number
    const chat = ChatStore.get(chatWid) || await window.require('WAWebFindChatAction').findOrCreateLatestChat(chatWid);
    
    if (!chat || !chat.chat) {
        console.error('Chat não encontrado');
        return;
    }
    
    const chatModel = chat.chat || chat;
    console.log('Chat encontrado:', chatModel.id._serialized);
    
    // 2. Create a test message
    const newId = await window.require('WAWebMsgKey').newId();
    const { getMaybeMePnUser } = window.require('WAWebUserPrefsMeUser');
    const meUser = getMaybeMePnUser();
    
    const newMsgKey = new (window.require('WAWebMsgKey'))({
        from: meUser,
        to: chatModel.id,
        id: newId,
        participant: window.require('WAWebWidFactory').asUserWidOrThrow(meUser),
        selfDir: 'out',
    });
    
    console.log('newMsgKey:', newMsgKey);
    console.log('newMsgKey._serialized:', newMsgKey._serialized);
    console.log('newMsgKey.$1:', newMsgKey.$1);
    console.log('newMsgKey.id:', newMsgKey.id);
    
    const msgKeyId = WWebJS.getMsgKeyId(newMsgKey);
    console.log('msgKeyId (getMsgKeyId):', msgKeyId);
    
    // 3. Check if message exists BEFORE sending
    console.log('\n--- ANTES DO ENVIO ---');
    console.log('MsgStore.has(msgKeyId):', MsgStore.has ? MsgStore.has(msgKeyId) : 'N/A');
    console.log('MsgStore.get(msgKeyId):', MsgStore.get(msgKeyId));
    
    // Check Chat.msgs
    console.log('chatModel.msgs:', !!chatModel.msgs);
    if (chatModel.msgs) {
        console.log('chatModel.msgs.get(msgKeyId):', chatModel.msgs.get ? chatModel.msgs.get(msgKeyId) : 'N/A');
        console.log('chatModel.msgs.has(msgKeyId):', chatModel.msgs.has ? chatModel.msgs.has(msgKeyId) : 'N/A');
    }
    
    // 4. Hook into MsgStore.add/set to trace when message is added
    console.log('\n--- HOOKING MsgStore.add/set ---');
    const originalAdd = MsgStore.add.bind(MsgStore);
    const originalSet = MsgStore.set.bind(MsgStore);
    
    MsgStore.add = function(...args) {
        console.log('[TRACE] MsgStore.add called:', args[0]?.id?._serialized || args[0]?.id?.$1 || args[0]);
        console.trace('MsgStore.add stack');
        return originalAdd.apply(this, args);
    };
    
    MsgStore.set = function(...args) {
        console.log('[TRACE] MsgStore.set called:', args[0]?.id?._serialized || args[0]?.id?.$1 || args[0]);
        console.trace('MsgStore.set stack');
        return originalSet.apply(this, args);
    };
    
    // 5. Hook into chat.msgs.add/set
    if (chatModel.msgs) {
        const originalChatAdd = chatModel.msgs.add.bind(chatModel.msgs);
        const originalChatSet = chatModel.msgs.set.bind(chatModel.msgs);
        
        chatModel.msgs.add = function(...args) {
            console.log('[TRACE] chatModel.msgs.add called:', args[0]?.id?._serialized || args[0]?.id?.$1 || args[0]);
            return originalChatAdd.apply(this, args);
        };
        
        chatModel.msgs.set = function(...args) {
            console.log('[TRACE] chatModel.msgs.set called:', args[0]?.id?._serialized || args[0]?.id?.$1 || args[0]);
            return originalChatSet.apply(this, args);
        };
    }
    
    // 6. Hook into MsgStore.on('add') to see events
    MsgStore.on('add', (msg) => {
        console.log('[EVENT] MsgStore.on(add):', msg.id?._serialized || msg.id?.$1, 'isNewMsg:', msg.isNewMsg);
    });
    
    // 7. Call addAndSendMsgToChat and trace promises
    console.log('\n--- CHAMANDO addAndSendMsgToChat ---');
    const message = {
        id: newMsgKey,
        ack: 0,
        body: 'TEST MESSAGE ' + Date.now(),
        from: meUser,
        to: chatModel.id,
        local: true,
        self: 'out',
        t: parseInt(Date.now() / 1000),
        isNewMsg: true,
        type: 'chat',
    };
    
    const [msgPromise, sendMsgResultPromise] = window.require('WAWebSendMsgChatAction').addAndSendMsgToChat(chatModel, message);
    
    console.log('msgPromise:', msgPromise);
    console.log('sendMsgResultPromise:', sendMsgResultPromise);
    console.log('msgPromise.constructor.name:', msgPromise?.constructor?.name);
    console.log('sendMsgResultPromise.constructor.name:', sendMsgResultPromise?.constructor?.name);
    
    // 8. Await msgPromise and check state
    console.log('\n--- AGUARDANDO msgPromise ---');
    const msgPromiseResult = await msgPromise;
    console.log('msgPromise resolved to:', msgPromiseResult);
    console.log('msgPromiseResult type:', typeof msgPromiseResult);
    console.log('msgPromiseResult constructor:', msgPromiseResult?.constructor?.name);
    if (msgPromiseResult) {
        console.log('msgPromiseResult.id:', msgPromiseResult.id?._serialized || msgPromiseResult.id?.$1);
        console.log('msgPromiseResult._serialized:', msgPromiseResult._serialized);
    }
    
    // Check stores after msgPromise
    console.log('\n--- APÓS msgPromise ---');
    console.log('MsgStore.get(msgKeyId):', MsgStore.get(msgKeyId) ? 'FOUND' : 'NOT_FOUND');
    if (MsgStore.get(msgKeyId)) {
        console.log('  -> msg.id._serialized:', MsgStore.get(msgKeyId).id?._serialized);
        console.log('  -> msg.id.$1:', MsgStore.get(msgKeyId).id?.$1);
    }
    
    if (chatModel.msgs) {
        console.log('chatModel.msgs.get(msgKeyId):', chatModel.msgs.get(msgKeyId) ? 'FOUND' : 'NOT_FOUND');
    }
    
    // 9. Await sendMsgResultPromise and check state
    console.log('\n--- AGUARDANDO sendMsgResultPromise ---');
    const sendMsgResult = await sendMsgResultPromise;
    console.log('sendMsgResultPromise resolved to:', sendMsgResult);
    console.log('sendMsgResult type:', typeof sendMsgResult);
    console.log('sendMsgResult constructor:', sendMsgResult?.constructor?.name);
    if (sendMsgResult) {
        console.log('sendMsgResult:', JSON.stringify(sendMsgResult, (k,v) => typeof v === 'function' ? '[Function]' : v).substring(0, 500));
    }
    
    // Check stores after sendMsgResultPromise
    console.log('\n--- APÓS sendMsgResultPromise ---');
    console.log('MsgStore.get(msgKeyId):', MsgStore.get(msgKeyId) ? 'FOUND' : 'NOT_FOUND');
    if (MsgStore.get(msgKeyId)) {
        console.log('  -> msg.id._serialized:', MsgStore.get(msgKeyId).id?._serialized);
        console.log('  -> msg.id.$1:', MsgStore.get(msgKeyId).id?.$1);
        console.log('  -> msg.ack:', MsgStore.get(msgKeyId).ack);
        console.log('  -> msg.serverId:', MsgStore.get(msgKeyId).serverId);
    }
    
    if (chatModel.msgs) {
        console.log('chatModel.msgs.get(msgKeyId):', chatModel.msgs.get(msgKeyId) ? 'FOUND' : 'NOT_FOUND');
    }
    
    // 10. Poll MsgStore.get to find exact moment
    console.log('\n--- POLLING MsgStore.get() ---');
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 100));
        const msg = MsgStore.get(msgKeyId);
        if (msg) {
            console.log(`[${i*100}ms] MsgStore.get: FOUND - id: ${msg.id?._serialized || msg.id?.$1}, ack: ${msg.ack}`);
            break;
        } else {
            console.log(`[${i*100}ms] MsgStore.get: NOT_FOUND`);
        }
    }
    
    // 11. Also check if there's a different store
    console.log('\n--- VERIFICANDO OUTROS STORES ---');
    const collections = window.require('WAWebCollections');
    console.log('WAWebCollections keys:', Object.keys(collections).filter(k => k.includes('Msg') || k.includes('msg')));
    
    // Check for MsgCollection or similar
    for (const key of Object.keys(collections)) {
        if (key.toLowerCase().includes('msg') && collections[key] && typeof collections[key].get === 'function') {
            const store = collections[key];
            const result = store.get(msgKeyId);
            if (result) {
                console.log(`OUTRO STORE: ${key}.get(msgKeyId) = FOUND`);
            }
        }
    }
    
    console.log('\n=== FIM DA INVESTIGAÇÃO ===');
}

// Auto-run if in browser
if (typeof window !== 'undefined' && window.WWebJS) {
    investigateMessageFlow().catch(console.error);
} else {
    console.log('Script deve ser executado no contexto do browser após WhatsApp Web carregar');
}

// Export for puppeteer
if (typeof module !== 'undefined') {
    module.exports = { investigateMessageFlow };
}