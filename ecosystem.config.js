module.exports = {
  apps: [{
    name: 'bot-wpp',
    script: './dist/core/multiPlatform.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // Logs estáveis e legíveis (anti-armadilha BUG 33):
    // - merge_logs: junta stdout+stderr num único arquivo
    // - out_file/error_file fixos (NÃO rotaciona para -0.log/-1.log confusos)
    // - log_date_format: PM2 prefixa o timestamp (evita duplo timestamp do código)
    merge_logs: true,
    out_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.out.log',
    error_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env_file: '/home/solanojr/bot-wpp/.env',
    env: {
      NODE_ENV: 'production',
      WPP_ENGINE: 'baileys',
      WWEBJS_AUTH_DIR: '.baileys_auth',
    }
  }]
};
