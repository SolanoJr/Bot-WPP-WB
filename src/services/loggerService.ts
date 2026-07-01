import winston from 'winston';
import path from 'path';
import fs from 'fs';

const LOG_DIR = 'logs';

// Garante que a pasta de logs existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    // Console para debug rápido
    new winston.transports.Console(),
    // Arquivo para erros críticos
    new winston.transports.File({ 
      filename: path.join(LOG_DIR, 'error.log'), 
      level: 'error' 
    }),
    // Arquivo para todo o histórico
    new winston.transports.File({ 
      filename: path.join(LOG_DIR, 'combined.log') 
    }),
  ],
});

export default logger;