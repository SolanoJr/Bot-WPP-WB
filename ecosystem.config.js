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
    env_file: '/home/solanojr/bot-wpp/.env',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
