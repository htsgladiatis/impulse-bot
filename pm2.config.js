module.exports = {
  apps: [
    {
      name: 'impulse-bot',
      script: 'index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'impulse-vk-bot',
      script: 'index.vk.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'impulse-miniapp',
      script: 'miniapp/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      kill_timeout: 5000,
      env: {
        NODE_ENV: 'production',
        MINIAPP_PORT: 3001,
      },
    },
  ],
};
