module.exports = {
  apps: [{
    name: 'bot-wpp',
    script: './dist/core/multiPlatform.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    // Otimização P0: restart ANTES de atingir 94% (servidor tem 2GB total)
    max_memory_restart: '600M',
    merge_logs: true,
    out_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.out.log',
    error_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env_file: '/home/solanojr/bot-wpp/.env',
    env: {
      NODE_ENV: 'production'
    },
    // Otimização P0: flags do Node.js
    node_args: [
      '--expose-gc',              // Habilita global.gc() para memoryMonitor
      '--max-old-space-size=512', // Limita heap a 512MB (evita crescimento descontrolado)
      '--optimize-for-size'       // Prioriza tamanho sobre velocidade
    ],
    // Restart inteligente
    min_uptime: '10s',            // Considera crash se cair antes de 10s
    max_restarts: 10,             // Máximo de restarts em listen_timeout
    listen_timeout: 5000,         // Timeout para considerar app ready
    kill_timeout: 5000,           // Tempo para graceful shutdown (SIGTERM)
    wait_ready: false             // Não esperar ready signal (usamos logs)
  }, {
    name: 'discord-screen',
    script: './discord-screen/server/index.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '300M',
    merge_logs: true,
    out_file: '/home/solanojr/.pm2/logs/discord-screen-stable.out.log',
    error_file: '/home/solanojr/.pm2/logs/discord-screen-stable.err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env_file: '/home/solanojr/bot-wpp/.env',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    node_args: [
      '--expose-gc',
      '--max-old-space-size=256'
    ],
    min_uptime: '10s',
    max_restarts: 10,
    listen_timeout: 5000,
    kill_timeout: 5000,
    wait_ready: false
  }]
};
