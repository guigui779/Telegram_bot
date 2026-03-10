const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

function requireEnv(name) {
  const value = process.env[name] && process.env[name].trim();
  if (!value) {
    throw new Error(`缺少环境变量: ${name}`);
  }
  return value;
}

const sb = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_KEY'),
);

async function createTables() {
  console.log('📦 开始创建 Telegram Bot 数据库表...\n');

  // 1. tg_admins
  const { error: e1 } = await sb.from('tg_admins').select('id').limit(1);
  if (e1) {
    console.log('⚠️  tg_admins 表不存在，请在 Supabase SQL Editor 执行建表 SQL');
    console.log('   错误:', e1.message);
    return false;
  } else {
    console.log('✅ tg_admins 表已存在');
  }

  // 2. tg_sale_bots
  const { error: e2 } = await sb.from('tg_sale_bots').select('id').limit(1);
  if (e2) {
    console.log('⚠️  tg_sale_bots 表不存在');
    return false;
  } else {
    console.log('✅ tg_sale_bots 表已存在');
  }

  // 3. tg_packages
  const { error: e3 } = await sb.from('tg_packages').select('id').limit(1);
  if (e3) {
    console.log('⚠️  tg_packages 表不存在');
    return false;
  } else {
    console.log('✅ tg_packages 表已存在');
  }

  // 4. tg_user_codes
  const { error: e4 } = await sb.from('tg_user_codes').select('id').limit(1);
  if (e4) {
    console.log('⚠️  tg_user_codes 表不存在');
    return false;
  } else {
    console.log('✅ tg_user_codes 表已存在');
  }

  // 5. tg_payment_orders
  const { error: e5 } = await sb.from('tg_payment_orders').select('id').limit(1);
  if (e5) {
    console.log('⚠️  tg_payment_orders 表不存在');
    return false;
  } else {
    console.log('✅ tg_payment_orders 表已存在');
  }

  // 6. tg_bot_bindings
  const { error: e6 } = await sb.from('tg_bot_bindings').select('id').limit(1);
  if (e6) {
    console.log('⚠️  tg_bot_bindings 表不存在');
    return false;
  } else {
    console.log('✅ tg_bot_bindings 表已存在');
  }

  // 7. tg_settings
  const { error: e7 } = await sb.from('tg_settings').select('key').limit(1);
  if (e7) {
    console.log('⚠️  tg_settings 表不存在');
    return false;
  } else {
    console.log('✅ tg_settings 表已存在');
  }

  return true;
}

async function insertDefaults() {
  console.log('\n📝 写入默认设置...');

  const defaults = [
    { key: 'payment_address', value: 'TRC20: 待设置' },
    { key: 'payment_backup', value: '' },
    { key: 'usage_instructions', value: '📖 平台使用说明\n\n1️⃣ 购买的授权码会自动存入当前机器人\n2️⃣ 授权码从第一次进入会议开始计时，有效时间12小时，过期作废\n3️⃣ 授权码一码一房间，会议结束后可再次开设房间' },
    { key: 'customer_service', value: '@yunjihuiyi_support' },
    { key: 'news_content', value: '📰 云际会议资讯\n\n暂无最新资讯' },
    { key: 'download_url', value: 'https://www.example.com' },
    { key: 'purchase_notice', value: '📦 购买须知\n\n1️⃣ 购买成功后，授权码会自动存入当前机器人\n2️⃣ 授权码从第一次进入会议开始计时，有效时间 12 小时，过期作废\n3️⃣ 授权码一码一房间，会议结束后可再次开设房间' },
  ];

  for (const item of defaults) {
    const { data: existing } = await sb.from('tg_settings').select('key').eq('key', item.key).single();
    if (existing) {
      console.log(`   ⏭️  ${item.key} 已存在，跳过`);
    } else {
      const { error } = await sb.from('tg_settings').insert(item);
      if (error) {
        console.log(`   ❌ ${item.key} 写入失败:`, error.message);
      } else {
        console.log(`   ✅ ${item.key} 已写入`);
      }
    }
  }
}

async function main() {
  const ok = await createTables();
  if (!ok) {
    console.log('\n========================================');
    console.log('请先在 Supabase SQL Editor 执行以下 SQL：');
    console.log('========================================\n');
    console.log(`
-- 管理员表
CREATE TABLE IF NOT EXISTS tg_admins (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

-- 出售机器人表
CREATE TABLE IF NOT EXISTS tg_sale_bots (
  id SERIAL PRIMARY KEY,
  bot_token TEXT NOT NULL UNIQUE,
  bot_username TEXT,
  bot_name TEXT,
  added_by BIGINT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

-- 套餐表
CREATE TABLE IF NOT EXISTS tg_packages (
  id SERIAL PRIMARY KEY,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 支付订单表
CREATE TABLE IF NOT EXISTS tg_payment_orders (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  bot_id INTEGER REFERENCES tg_sale_bots(id) ON DELETE CASCADE,
  package_id INTEGER REFERENCES tg_packages(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(18,6) NOT NULL,
  total_price DECIMAL(18,6) NOT NULL,
  amount_offset DECIMAL(18,6) NOT NULL,
  payable_amount DECIMAL(18,6) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expire_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ
);

-- 用户授权码表
CREATE TABLE IF NOT EXISTS tg_user_codes (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  bot_id INTEGER REFERENCES tg_sale_bots(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  used BOOLEAN DEFAULT false,
  room_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 机器人绑定用户表
CREATE TABLE IF NOT EXISTS tg_bot_bindings (
  id SERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES tg_sale_bots(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bot_id, telegram_id)
);

-- 设置表
CREATE TABLE IF NOT EXISTS tg_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE tg_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_sale_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_user_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_bot_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tg_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_all" ON tg_admins;
DROP POLICY IF EXISTS "service_all" ON tg_sale_bots;
DROP POLICY IF EXISTS "service_all" ON tg_packages;
DROP POLICY IF EXISTS "service_all" ON tg_payment_orders;
DROP POLICY IF EXISTS "service_all" ON tg_user_codes;
DROP POLICY IF EXISTS "service_all" ON tg_bot_bindings;
DROP POLICY IF EXISTS "service_all" ON tg_settings;

CREATE POLICY "service_all" ON tg_admins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_sale_bots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_packages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_payment_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_user_codes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_bot_bindings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_all" ON tg_settings FOR ALL USING (true) WITH CHECK (true);
    `);
    console.log('\n执行完成后，再次运行本脚本验证。');
    return;
  }

  await insertDefaults();

  // 验证
  console.log('\n📋 验证设置表数据:');
  const { data } = await sb.from('tg_settings').select('key, value');
  if (data) {
    for (const d of data) {
      console.log(`   ${d.key}: ${d.value.substring(0, 40)}${d.value.length > 40 ? '...' : ''}`);
    }
  }
  console.log('\n🎉 数据库初始化完成！');
}

main().catch(console.error);
