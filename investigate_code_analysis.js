// Investigation script: Analyze what msgPromise and sendMsgResultPromise return
// This script examines the actual WAWebSendMsgChatAction implementation

console.log('=== INVESTIGAÇÃO: Analisar addAndSendMsgToChat ===');

// Step 1: Find the WAWebSendMsgChatAction file
console.log('Procurando o arquivo WAWebSendMsgChatAction...');

// Simular o carregamento do módulo
const { WAWebSendMsgChatAction } = window.require('WAWebSendMsgChatAction');

console.log('WAWebSendMsgChatAction:', WAWebSendMsgChatAction);
console.log('WAWebSendMsgChatAction.addAndSendMsgToChat:', WAWebSendMsgChatAction.addAndSendMsgToChat);

// Step 2: Inspecionar o código-fonte do módulo
if (WAWebSendMsgChatAction && WAWebSendMsgChatAction.addAndSendMsgToChat) {
    console.log('\n=== INSPEÇÃO DO CÓDIGO ===');
    
    // Tentar obter o código-fonte
    const moduleCode = WAWebSendMsgChatAction.toString();
    console.log('Código do módulo (primeiros 5000 chars):');
    console.log(moduleCode.substring(0, 5000));
    
    // Tentar obter as propriedades do módulo
    console.log('\nPropriedades do módulo:');
    console.log('Keys:', Object.keys(WAWebSendMsgChatAction));
    
    // Procurar por addAndSendMsgToChat especificamente
    if (typeof WAWebSendMsgChatAction.addAndSendMsgToChat === 'function') {
        console.log('\n=== INSPEÇÃO DE addAndSendMsgToChat ===');
        
        // Tentar obter o código-fonte da função
        const functionCode = WAWebSendMsgChatAction.addAndSendMsgToChat.toString();
        console.log('Código da função (primeiros 8000 chars):');
        console.log(functionCode.substring(0, 8000));
        
        // Procurar por padrões que indiquem o que os promises retornam
        console.log('\n=== ANÁLISE DE PATRÕES ===');
        
        // Procurar por return statements
        const returnMatches = functionCode.match(/return\s+([^;]+);/g);
        if (returnMatches) {
            console.log('Possíveis return statements encontrados:');
            returnMatches.forEach((match, i) => {
                console.log(`${i+1}. ${match}`);
            });
        }
        
        // Procurar por promises
        const promisePatterns = functionCode.match(/Promise\.{get|resolve|reject}/g);
        if (promisePatterns) {
            console.log('\nPadrões de Promise encontrados:');
            promisePatterns.forEach(pattern => console.log('  -', pattern));
        }
        
        // Procurar por mensagens sobre MsgStore
        const msgStorePatterns = functionCode.match(/MsgStore|Msg\.get|Msg\.set|Msg\.add/g);
        if (msgStorePatterns) {
            console.log('\nReferências a MsgStore encontradas:');
            msgStorePatterns.forEach(pattern => console.log('  -', pattern));
        }
    }
} else {
    console.log('\nERRO: Não foi possível carregar WAWebSendMsgChatAction');
    console.log('WAWebSendMsgChatAction.addAndSendMsgToChat:', typeof WAWebSendMsgChatAction?.addAndSendMsgToChat);
}

// Step 3: Examinar a janela.require para outras ações de envio
console.log('\n=== EXAMINANDO OUTRAS AÇÕES DE ENVIO ===');
const possibleSendActions = [
    'WAWebSendMsgChatAction',
    'WAWebSendMessageAction', 
    'WAWebSendChatAction',
    'WAWebMsgSendAction',
    'WAWebChatSendAction'
];

for (const actionName of possibleSendActions) {
    try {
        const action = window.require(actionName);
        console.log(`\n${actionName}:`);
        console.log('  - Tipo:', typeof action);
        console.log('  - Keys:', Object.keys(action));
        
        // Procurar por addAndSendMsgToChat
        if (action.addAndSendMsgToChat) {
            console.log('  - Possui addAndSendMsgToChat');
        }
        
    } catch (e) {
        // Ignorar não encontrado
    }
}

// Step 4: Analisar a implementação de sendMessage no Client.js
console.log('\n=== ANÁLISE DO CLIENT.SENDMESSAGE ===');
// Esta análise seria feita através da inspeção do código

// Step 5: Verificar as assinaturas de promise e promises reais
console.log('\n=== INSPEÇÃO DE INSTALAÇÕES DE PROMISE ===');
if (window.WWebJS && typeof window.WWebJS.sendMessage === 'function') {
    console.log('window.WWebJS.sendMessage existe');
    
    // Tentar inspecionar o código
    const sendMessageCode = window.WWebJS.sendMessage.toString();
    console.log('\nCódigo de WWebJS.sendMessage (primeiros 3000 chars):');
    console.log(sendMessageCode.substring(0, 3000));
}

console.log('\n=== INVESTIGAÇÃO CONCLUÍDA ===');