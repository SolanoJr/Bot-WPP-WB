import { describe, it, expect, vi } from 'vitest';
import { processMessage } from '../../src/services/messageHandler';
import { menuCommand } from '../../src/bot/commands/menu';

describe('Multiplatform Menu Command', () => {
    const commands = new Map();
    commands.set('menu', menuCommand);

    it('should execute $menu for WhatsApp', async () => {
        const msg = {
            body: '$menu',
            from: '558581344211@c.us',
            reply: vi.fn().mockResolvedValue(true),
            getChat: vi.fn().mockResolvedValue({ isGroup: false })
        };
        const client = { /* mock wpp client */ };

        await processMessage(msg, client, commands);

        expect(msg.reply).toHaveBeenCalled();
        const replyText = msg.reply.mock.calls[0][0];
        expect(replyText).toContain('BOT');
        expect(replyText).toContain('$stats');
    });

    it('should execute $menu for Telegram', async () => {
        const msg = {
            body: '$menu',
            from: '123456789',
            author: '123456789',
            reply: vi.fn().mockResolvedValue(true),
            getChat: vi.fn().mockResolvedValue({ isGroup: false })
        };
        const client = { /* mock telegram bot */ };

        await processMessage(msg, client, commands);

        expect(msg.reply).toHaveBeenCalled();
        const replyText = msg.reply.mock.calls[0][0];
        expect(replyText).toContain('BOT');
        expect(replyText).toContain('$stats');
    });
});
