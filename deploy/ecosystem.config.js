module.exports = {
  apps: [
    {
      name: 'safe-business-api',
      cwd: '/var/www/safe-business/backend',
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
