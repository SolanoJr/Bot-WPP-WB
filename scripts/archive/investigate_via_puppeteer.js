/**
 * Run investigation via puppeteer
 * Usage: node investigate_via_puppeteer.js
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const path = require('path');

const authPath = path.join(process.cwd(), '.wwebjs_auth');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
        headless: true,
        executablePath: '/home/solanojr/.cache/puppeteer/chrome/linux-146.0.7680.31/chrome-linux64/chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions'
        ]
    }
});

let investigationDone = false;

client.on('ready', async () => {
    console.log('[PUPPETEER] Client ready, running investigation...');
    
    try {
        // Read the investigation script
        const script = fs.readFileSync(path.join(process.cwd(), 'investigate_msg_flow.js'), 'utf8');
        
        // Execute in browser context
        const result = await client.pupPage.evaluate(script);
        console.log('[PUPPETEER] Investigation result:', result);
        
        investigationDone = true;
        
        // Give time for logs to flush
        await new Promise(r => setTimeout(r, 5000));
        
    } catch (error) {
        console.error('[PUPPETEER] Investigation error:', error);
    } finally {
        await client.destroy();
        process.exit(0);
    }
});

client.on('qr', (qr) => {
    console.log('[PUPPETEER] QR Code received, scan with WhatsApp');
});

client.on('disconnected', (reason) => {
    console.log('[PUPPETEER] Disconnected:', reason);
    if (!investigationDone) {
        process.exit(1);
    }
});

client.initialize().catch(console.error);

// Timeout safety
setTimeout(() => {
    console.log('[PUPPETEER] Timeout, exiting...');
    process.exit(1);
}, 120000);