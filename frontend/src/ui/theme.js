// Дизайн-система из reference/studio_os_mvp.tsx (docs/task-frontend-v2.md).
// Единственное осознанное отличие от прототипа — §3 задачи: графитовый
// вместо чистого чёрного как основной акцентный цвет, чтобы не было
// скучно-монохромно. Остальная палитра (статусы) — как в прототипе.
export const C = {
  bg: '#FFFFFF',
  surface: '#F7F7F7',
  border: '#EBEBEB',
  subtle: '#ABABAB',
  secondary: '#6B6B6B',
  primary: '#2A2A2E',
  green: '#16A34A',
  greenBg: '#F0FDF4',
  orange: '#D97706',
  orangeBg: '#FFFBEB',
  red: '#DC2626',
  redBg: '#FFF2F2',
  // Пакет 4: ещё две категории дедлайнов (помещение, журналы) не влезают в
  // прежние 4 цвета без потери различимости бейджей — добавлены две новые,
  // не трогая остальную палитру.
  blue: '#2563EB',
  blueBg: '#EFF6FF',
  purple: '#7C3AED',
  purpleBg: '#F5F3FF',
};

export const F = "-apple-system,'SF Pro Text','Segoe UI',sans-serif";

export const MAX_WIDTH = 430;
