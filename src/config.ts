import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量: ${name}`);
  }
  return value;
}

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`环境变量 ${name} 不是有效整数`);
  }

  return value;
}

export const config = {
  adminBotToken: requireEnv('ADMIN_BOT_TOKEN'),
  initialAdminIds: (process.env.INITIAL_ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseKey: requireEnv('SUPABASE_SERVICE_KEY'),
  apiKey: requireEnv('API_KEY'),
  tronGridApiKey: process.env.TRON_GRID_API_KEY || '',
  tronUsdtContract: process.env.TRON_USDT_CONTRACT || 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj',
  paymentPollIntervalMs: readIntEnv('PAYMENT_POLL_INTERVAL_MS', 30000),
  paymentOrderExpireMinutes: readIntEnv('PAYMENT_ORDER_EXPIRE_MINUTES', 30),
};
