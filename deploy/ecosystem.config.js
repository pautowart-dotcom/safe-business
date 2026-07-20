// Пакет 2, Этап 10: cluster mode вместо единственного fork-процесса —
// задел на будущую нагрузку (несколько ядер CPU, устойчивость к падению
// одного воркера). instances зафиксировано числом (не 'max') сознательно:
// сервер маленький, а каждый воркер держит свой pg.Pool (backend/src/db/
// pool.js, max по умолчанию 10 соединений) — 'max' на многоядерной машине
// мог бы упереться в Postgres max_connections (по умолчанию 100)
// незаметно для разработчика. При росте — поднимать instances и
// max_connections в Postgres синхронно, не порознь.
//
// Rate limiting логина (core/loginRateLimit.js) и все остальные
// проверки в этом коммите намеренно хранят состояние в Postgres, а не в
// памяти процесса — под несколькими воркерами in-memory Map не делился
// бы между ними и не защищал бы от перебора пароля через кластер.
module.exports = {
  apps: [
    {
      name: 'safe-business-api',
      cwd: '/var/www/safe-business/backend',
      script: 'src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '300M',
      autorestart: true,
    },
  ],
};
