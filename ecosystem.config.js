module.exports = {
  apps: [{
    name: 'screen-server',
    script: './dist/services/discord-screen/index.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    merge_logs: true,
    out_file: '/home/solanojr/.pm2/logs/screen-server.out.log',
    error_file: '/home/solanojr/.pm2/logs/screen-server.err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env_file: '/home/solanojr/bot-wpp/.env-screen',
    env: {
      NODE_ENV: 'production',
      DISCORD_SCREEN_PORT: '3003'
    }
  }, {
    name: 'bot-wpp',
    script: './dist/core/multiPlatform.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    merge_logs: true,
    out_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.out.log',
    error_file: '/home/solanojr/.pm2/logs/bot-wpp-stable.err.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',
    env_file: '/home/solanojr/bot-wpp/.env',
    env: {
      NODE_ENV: 'production',
      WPP_ENGINE: 'baileys',
      WWEBJS_AUTH_DIR: '.baileys_auth'
    }
  }]
};
