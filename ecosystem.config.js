module.exports = {
  apps: [{
    name: 'bot-wpp',
    script: './dist/core/index.js',
    cwd: '/home/solanojr/bot-wpp',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
