
/**
 * 🚫 SERVICO DE RATE LIMITING
 * Limita o número de comandos por usuário por período de tempo
 */

interface RateLimitEntry {
    count: number;
    firstSeen: number;
}

class RateLimiter {
    private readonly requests: Map<string, RateLimitEntry>;
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number = 20, windowMs: number = 60000) {
        this.requests = new Map();
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }

    /**
     * Verifica se o usuário excedeu o limite de requisições
     * @param userId - ID único do usuário (com prefixo da plataforma, ex: "wpp:12345")
     * @returns { limitExceeded: boolean; remaining: number; resetTime: number }
     */
    checkLimit(userId: string): { limitExceeded: boolean; remaining: number; resetTime: number } {
        const now = Date.now();
        const entry = this.requests.get(userId);

        if (!entry) {
            this.requests.set(userId, { count: 1, firstSeen: now });
            return { limitExceeded: false, remaining: this.maxRequests - 1, resetTime: now + this.windowMs };
        }

        if (now - entry.firstSeen > this.windowMs) {
            // Resetar o contador
            this.requests.set(userId, { count: 1, firstSeen: now });
            return { limitExceeded: false, remaining: this.maxRequests - 1, resetTime: now + this.windowMs };
        }

        const newCount = entry.count + 1;
        this.requests.set(userId, { ...entry, count: newCount });

        const remaining = Math.max(0, this.maxRequests - newCount);
        const limitExceeded = newCount > this.maxRequests;

        return { limitExceeded, remaining, resetTime: entry.firstSeen + this.windowMs };
    }

    /**
     * Limpa entradas expiradas para economizar memória
     */
    cleanExpired(): void {
        const now = Date.now();
        for (const [userId, entry] of this.requests.entries()) {
            if (now - entry.firstSeen > this.windowMs) {
                this.requests.delete(userId);
            }
        }
    }
}

const rateLimiter = new RateLimiter(20, 60000); // 20 comandos por minuto

export { rateLimiter, RateLimiter };
