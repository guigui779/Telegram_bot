import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

const supabase: SupabaseClient = createClient(config.supabaseUrl, config.supabaseKey);

// ==================== 管理员 ====================

export async function isAdmin(telegramId: number): Promise<boolean> {
  const { data } = await supabase
    .from('tg_admins')
    .select('id')
    .eq('telegram_id', telegramId)
    .single();
  return !!data;
}

export async function addAdmin(telegramId: number, username?: string): Promise<boolean> {
  const { error } = await supabase
    .from('tg_admins')
    .upsert({ telegram_id: telegramId, username }, { onConflict: 'telegram_id' });
  return !error;
}

export async function removeAdmin(telegramId: number): Promise<boolean> {
  const { error } = await supabase
    .from('tg_admins')
    .delete()
    .eq('telegram_id', telegramId);
  return !error;
}

export async function getAdmins(): Promise<{ telegram_id: number; username: string | null }[]> {
  const { data } = await supabase.from('tg_admins').select('telegram_id, username');
  return data || [];
}

// ==================== 出售机器人 ====================

export interface SaleBot {
  id: number;
  bot_token: string;
  bot_username: string | null;
  bot_name: string | null;
  added_by: number | null;
  active: boolean;
}

export async function addSaleBot(
  botToken: string,
  botUsername: string,
  botName: string,
  addedBy: number,
): Promise<boolean> {
  const { error } = await supabase.from('tg_sale_bots').insert({
    bot_token: botToken,
    bot_username: botUsername,
    bot_name: botName,
    added_by: addedBy,
  });
  return !error;
}

export async function removeSaleBot(id: number): Promise<boolean> {
  const { error } = await supabase.from('tg_sale_bots').delete().eq('id', id);
  return !error;
}

export async function getSaleBots(): Promise<SaleBot[]> {
  const { data, error } = await supabase
    .from('tg_sale_bots')
    .select('*')
    .eq('active', true)
    .order('id', { ascending: true });
  if (error) {
    throw error;
  }
  return data || [];
}

export async function getSaleBotById(id: number): Promise<SaleBot | null> {
  const { data } = await supabase.from('tg_sale_bots').select('*').eq('id', id).single();
  return data;
}

// ==================== 套餐 ====================

export interface Package {
  id: number;
  quantity: number;
  unit_price: number;
}

export async function addPackage(quantity: number, unitPrice: number): Promise<boolean> {
  const { error } = await supabase
    .from('tg_packages')
    .insert({ quantity, unit_price: unitPrice });
  return !error;
}

export async function removePackage(id: number): Promise<boolean> {
  const { error } = await supabase.from('tg_packages').delete().eq('id', id);
  return !error;
}

export async function getPackages(): Promise<Package[]> {
  const { data } = await supabase
    .from('tg_packages')
    .select('*')
    .order('quantity', { ascending: true });
  return data || [];
}

// ==================== 支付订单 ====================

export interface PaymentOrder {
  id: number;
  telegram_id: number;
  bot_id: number;
  package_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  amount_offset: number;
  payable_amount: number;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  tx_hash: string | null;
  created_at: string;
  expire_at: string;
  paid_at: string | null;
}

export async function createPaymentOrder(input: {
  telegramId: number;
  botId: number;
  packageId: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  amountOffset: number;
  payableAmount: number;
  expireAt: string;
}): Promise<PaymentOrder | null> {
  const { data, error } = await supabase
    .from('tg_payment_orders')
    .insert({
      telegram_id: input.telegramId,
      bot_id: input.botId,
      package_id: input.packageId,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      total_price: input.totalPrice,
      amount_offset: input.amountOffset,
      payable_amount: input.payableAmount,
      expire_at: input.expireAt,
    })
    .select('*')
    .single();
  if (error) return null;
  return (data as PaymentOrder) || null;
}

export async function getPendingPaymentOrders(): Promise<PaymentOrder[]> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('tg_payment_orders')
    .select('*')
    .eq('status', 'pending')
    .gt('expire_at', now)
    .order('created_at', { ascending: true });
  return (data as PaymentOrder[]) || [];
}

export async function getRecentPendingOrdersByTotal(totalPrice: number): Promise<PaymentOrder[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('tg_payment_orders')
    .select('*')
    .eq('status', 'pending')
    .eq('total_price', totalPrice)
    .gte('created_at', since);
  return (data as PaymentOrder[]) || [];
}

export async function findPaymentOrderByTxHash(txHash: string): Promise<PaymentOrder | null> {
  const { data } = await supabase
    .from('tg_payment_orders')
    .select('*')
    .eq('tx_hash', txHash)
    .single();
  return (data as PaymentOrder) || null;
}

export async function markPaymentOrderPaid(orderId: number, txHash: string): Promise<boolean> {
  const { error } = await supabase
    .from('tg_payment_orders')
    .update({
      status: 'paid',
      tx_hash: txHash,
      paid_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('status', 'pending');
  return !error;
}

export async function markPaymentOrderFailed(orderId: number): Promise<boolean> {
  const { error } = await supabase
    .from('tg_payment_orders')
    .update({ status: 'failed' })
    .eq('id', orderId)
    .eq('status', 'pending');
  return !error;
}

export async function expirePendingPaymentOrders(): Promise<boolean> {
  const { error } = await supabase
    .from('tg_payment_orders')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expire_at', new Date().toISOString());
  return !error;
}

// ==================== 用户授权码 ====================

export interface UserCode {
  id: number;
  telegram_id: number;
  bot_id: number;
  code: string;
  used: boolean;
  room_name: string | null;
  created_at: string;
}

export interface BotBinding {
  id: number;
  bot_id: number;
  telegram_id: number;
  created_at: string;
}

export async function addUserCodes(
  telegramId: number,
  botId: number,
  codes: string[],
): Promise<boolean> {
  const rows = codes.map((code) => ({
    telegram_id: telegramId,
    bot_id: botId,
    code,
  }));
  const { error } = await supabase.from('tg_user_codes').insert(rows);
  return !error;
}

export async function addBotCodes(
  botId: number,
  codes: string[],
  telegramId = 0,
): Promise<boolean> {
  return addUserCodes(telegramId, botId, codes);
}

export async function getUserCodes(
  telegramId: number,
  botId: number,
  used?: boolean,
): Promise<UserCode[]> {
  let query = supabase
    .from('tg_user_codes')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });
  if (used !== undefined) {
    query = query.eq('used', used);
  }
  const { data } = await query;
  return data || [];
}

export async function getBotCodes(botId: number, used?: boolean): Promise<UserCode[]> {
  let query = supabase
    .from('tg_user_codes')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: false });
  if (used !== undefined) {
    query = query.eq('used', used);
  }
  const { data } = await query;
  return (data as UserCode[]) || [];
}

export async function markCodeUsed(code: string, roomName?: string): Promise<boolean> {
  const update: any = { used: true };
  if (roomName) update.room_name = roomName;
  const { error } = await supabase.from('tg_user_codes').update(update).eq('code', code);
  return !error;
}

export async function markCodeUnused(code: string): Promise<boolean> {
  const { error } = await supabase
    .from('tg_user_codes')
    .update({ used: false, room_name: null })
    .eq('code', code);
  return !error;
}

export async function getCodesByBot(botId: number): Promise<UserCode[]> {
  return getBotCodes(botId);
}

export async function getBotBindings(botId: number): Promise<BotBinding[]> {
  const { data } = await supabase
    .from('tg_bot_bindings')
    .select('*')
    .eq('bot_id', botId)
    .order('created_at', { ascending: true });
  return (data as BotBinding[]) || [];
}

export async function isBotUserBound(botId: number, telegramId: number): Promise<boolean> {
  const { data } = await supabase
    .from('tg_bot_bindings')
    .select('id')
    .eq('bot_id', botId)
    .eq('telegram_id', telegramId)
    .single();
  return !!data;
}

export async function bindBotUser(botId: number, telegramId: number): Promise<'bound' | 'exists' | 'full' | 'error'> {
  const exists = await isBotUserBound(botId, telegramId);
  if (exists) return 'exists';

  const bindings = await getBotBindings(botId);
  if (bindings.length >= 2) return 'full';

  const { error } = await supabase.from('tg_bot_bindings').insert({
    bot_id: botId,
    telegram_id: telegramId,
  });
  return error ? 'error' : 'bound';
}

export async function unbindBotUser(botId: number, telegramId: number): Promise<boolean> {
  const { error } = await supabase
    .from('tg_bot_bindings')
    .delete()
    .eq('bot_id', botId)
    .eq('telegram_id', telegramId);
  return !error;
}

export interface BotCodeStats {
  botId: number;
  botName: string;
  total: number;
  used: number;
  unused: number;
  expired: number;
}

export async function getAllCodesStatsByBot(): Promise<BotCodeStats[]> {
  const bots = await getSaleBots();
  const result: BotCodeStats[] = [];
  const now = Date.now();

  for (const bot of bots) {
    const codes = await getBotCodes(bot.id);
    const total = codes.length;
    if (total === 0) {
      result.push({ botId: bot.id, botName: bot.bot_name || bot.bot_username || '未知', total: 0, used: 0, unused: 0, expired: 0 });
      continue;
    }

    const codeStrings = codes.map((c) => c.code.trim().toUpperCase());
    const { data: invites } = await supabase
      .from('invite_codes')
      .select('code, room_name, activated_at, expires_at')
      .in('code', codeStrings);

    let used = 0;
    let expired = 0;

    if (invites && invites.length > 0) {
      const inviteMap = new Map(invites.map((i: any) => [i.code, i]));
      for (const c of codes) {
        const inv = inviteMap.get(c.code.trim().toUpperCase());
        if (inv) {
          const expiresAt = inv.expires_at ? new Date(inv.expires_at).getTime() : null;
          const isExpired = expiresAt !== null && expiresAt <= now;
          const isInUse = !!inv.room_name && !isExpired;
          if (isExpired) { expired++; }
          else if (isInUse || inv.activated_at) { used++; }
        } else {
          if (c.used) used++;
        }
      }
    } else {
      used = codes.filter((c) => c.used).length;
    }

    result.push({
      botId: bot.id,
      botName: bot.bot_name || bot.bot_username || '未知',
      total,
      used,
      unused: total - used - expired,
      expired,
    });
  }

  return result;
}

// ==================== 授权码详情 ====================

export interface CodeDetail {
  code: string;
  room_name: string | null;
  activated_at: string | null;
  expires_at: string | null;
  ttl_seconds: number;
  created_at: string;
  status: 'unused' | 'in_use' | 'expired';
  remaining_seconds: number | null;
}

export async function getBotCodesDetail(botId: number): Promise<CodeDetail[]> {
  const codes = await getBotCodes(botId);
  if (codes.length === 0) return [];

  const codeStrings = codes.map((c) => c.code.trim().toUpperCase());
  const { data: invites } = await supabase
    .from('invite_codes')
    .select('*')
    .in('code', codeStrings);

  const inviteMap = new Map((invites || []).map((i: any) => [i.code, i]));
  const now = Date.now();
  const result: CodeDetail[] = [];

  for (const c of codes) {
    const inv = inviteMap.get(c.code.trim().toUpperCase());
    if (inv) {
      const expiresAt = inv.expires_at ? new Date(inv.expires_at).getTime() : null;
      const isExpired = expiresAt !== null && expiresAt <= now;
      const isInUse = !!inv.room_name && !isExpired;
      result.push({
        code: c.code,
        room_name: inv.room_name,
        activated_at: inv.activated_at,
        expires_at: inv.expires_at,
        ttl_seconds: inv.ttl_seconds,
        created_at: inv.created_at,
        status: isExpired ? 'expired' : isInUse ? 'in_use' : 'unused',
        remaining_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null,
      });
    } else {
      result.push({
        code: c.code,
        room_name: c.room_name,
        activated_at: null,
        expires_at: null,
        ttl_seconds: 0,
        created_at: c.created_at,
        status: c.used ? 'in_use' : 'unused',
        remaining_seconds: null,
      });
    }
  }

  return result;
}

export async function getCodeDetail(code: string): Promise<CodeDetail | null> {
  const normalized = code.trim().toUpperCase();
  const { data } = await supabase
    .from('invite_codes')
    .select('*')
    .eq('code', normalized)
    .maybeSingle();

  if (!data) return null;

  const now = Date.now();
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
  const isExpired = expiresAt !== null && expiresAt <= now;
  const isInUse = !!data.room_name && !isExpired;

  return {
    code: data.code,
    room_name: data.room_name,
    activated_at: data.activated_at,
    expires_at: data.expires_at,
    ttl_seconds: data.ttl_seconds,
    created_at: data.created_at,
    status: isExpired ? 'expired' : isInUse ? 'in_use' : 'unused',
    remaining_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null,
  };
}

export async function deleteUserCode(code: string): Promise<boolean> {
  const { error } = await supabase.from('tg_user_codes').delete().eq('code', code);
  return !error;
}

export async function deleteAllBotCodes(botId: number): Promise<number> {
  const { data } = await supabase.from('tg_user_codes').select('code').eq('bot_id', botId);
  if (!data || data.length === 0) return 0;
  const { error } = await supabase.from('tg_user_codes').delete().eq('bot_id', botId);
  return error ? 0 : data.length;
}

// ==================== 设置 ====================

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await supabase.from('tg_settings').select('value').eq('key', key).single();
  return data?.value || null;
}

export async function getSettingsByPrefix(prefix: string): Promise<{ key: string; value: string }[]> {
  const { data } = await supabase.from('tg_settings').select('key,value').like('key', `${prefix}%`);
  return (data || []).filter((item: any) => item.value);
}

export async function setSetting(key: string, value: string): Promise<boolean> {
  const { error } = await supabase
    .from('tg_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  return !error;
}

export async function deleteSetting(key: string): Promise<boolean> {
  const { error } = await supabase.from('tg_settings').delete().eq('key', key);
  return !error;
}

// ==================== 初始化 ====================

export async function initAdmins(adminIds: number[]): Promise<void> {
  for (const id of adminIds) {
    const exists = await isAdmin(id);
    if (!exists) {
      await addAdmin(id);
    }
  }
}

/** 建表 SQL（需要在 Supabase SQL Editor 执行） */
export const CREATE_TABLES_SQL = `
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

-- 默认设置
INSERT INTO tg_settings (key, value) VALUES
  ('payment_address', 'TRC20: 待设置'),
  ('payment_backup', ''),
  ('api_url', ''),
  ('api_url_main', ''),
  ('api_url_backup', ''),
  ('usage_instructions', '📖 平台使用说明\\n\\n1️⃣ 购买的授权码会自动存入当前机器人\\n2️⃣ 授权码从第一次进入会议开始计时，有效时间12小时，过期作废\\n3️⃣ 授权码一码一房间，会议结束后可再次开设房间'),
  ('customer_service', '@yunjihuiyi_support'),
  ('news_content', '📰 云际会议资讯\\n\\n暂无最新资讯'),
  ('web_url', 'https://www.example.com'),
  ('download_url', 'https://www.example.com'),
  ('purchase_notice', '📦 购买须知\\n\\n1️⃣ 购买成功后，授权码会自动存入当前机器人\\n2️⃣ 授权码从第一次进入会议开始计时\\n   有效时间 12 小时，过期作废\\n3️⃣ 授权码一码一房间\\n   会议结束后可再次开设房间')
ON CONFLICT (key) DO NOTHING;
`;
