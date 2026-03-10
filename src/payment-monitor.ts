import { Bot } from 'grammy';
import { config } from './config';
import * as api from './api';
import * as db from './db';

type BotResolver = (botId: number) => Bot | undefined;

interface Trc20Transfer {
  txHash: string;
  amount: number;
  timestamp: number;
}

let polling = false;

function normalizeWalletAddress(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/T[1-9A-HJ-NP-Za-km-z]{33}/);
  return match ? match[0] : null;
}

function formatAmount(value: number): string {
  return value.toFixed(3);
}

function isSameAmount(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

async function fetchIncomingUsdtTransfers(address: string, minTimestamp: number): Promise<Trc20Transfer[]> {
  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set('only_to', 'true');
  url.searchParams.set('limit', '200');
  url.searchParams.set('min_timestamp', String(minTimestamp));
  url.searchParams.set('order_by', 'block_timestamp,desc');
  url.searchParams.set('contract_address', config.tronUsdtContract);

  const headers: Record<string, string> = {};
  if (config.tronGridApiKey) {
    headers['TRON-PRO-API-KEY'] = config.tronGridApiKey;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`TRON API 请求失败: ${res.status}`);
  }

  const data = (await res.json()) as { data?: Array<any> };
  const items = Array.isArray(data.data) ? data.data : [];
  return items
    .map((item) => ({
      txHash: String(item.transaction_id || ''),
      amount: Number(item.value || 0) / 1_000_000,
      timestamp: Number(item.block_timestamp || 0),
    }))
    .filter((item) => item.txHash && Number.isFinite(item.amount) && item.timestamp > 0);
}

async function handlePaidOrder(order: db.PaymentOrder, txHash: string, resolveBot: BotResolver) {
  const codes = await api.createInviteCodes(order.quantity);
  if (codes.length !== order.quantity) {
    throw new Error(`订单 ${order.id} 发码失败，期望 ${order.quantity}，实际 ${codes.length}`);
  }

  const added = await db.addBotCodes(order.bot_id, codes, order.telegram_id);
  if (!added) {
    throw new Error(`订单 ${order.id} 写入授权码失败`);
  }

  const marked = await db.markPaymentOrderPaid(order.id, txHash);
  if (!marked) {
    throw new Error(`订单 ${order.id} 标记支付成功失败`);
  }

  const saleBot = resolveBot(order.bot_id);
  if (saleBot) {
    const codeLines = codes.map((code) => `• <code>${code}</code>`).join('\n');
    await saleBot.api.sendMessage(
      order.telegram_id,
      [
        '✅ <b>支付成功，授权码已自动到账</b>',
        '',
        `订单号: <code>${order.id}</code>`,
        `到账金额: <b>${formatAmount(order.payable_amount)} USDT</b>`,
        '',
        codeLines,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  }
}

async function pollOnce(resolveBot: BotResolver) {
  if (polling) return;
  polling = true;

  try {
    await db.expirePendingPaymentOrders();
    const wallet = normalizeWalletAddress(await db.getSetting('payment_address'));
    if (!wallet) return;

    const pendingOrders = await db.getPendingPaymentOrders();
    if (pendingOrders.length === 0) return;

    const earliest = Math.min(...pendingOrders.map((item) => new Date(item.created_at).getTime())) - 60_000;
    const transfers = await fetchIncomingUsdtTransfers(wallet, Math.max(0, earliest));
    if (transfers.length === 0) return;

    for (const order of pendingOrders) {
      const existingTx = order.tx_hash ? await db.findPaymentOrderByTxHash(order.tx_hash) : null;
      if (existingTx) continue;

      const match = transfers.find((tx) => {
        if (!isSameAmount(tx.amount, Number(order.payable_amount))) return false;
        const createdAt = new Date(order.created_at).getTime() - 60_000;
        const expireAt = new Date(order.expire_at).getTime();
        return tx.timestamp >= createdAt && tx.timestamp <= expireAt;
      });

      if (!match) continue;
      const processed = await db.findPaymentOrderByTxHash(match.txHash);
      if (processed) continue;

      await handlePaidOrder(order, match.txHash, resolveBot);
    }
  } catch (error) {
    console.error('TRC20 支付监听失败:', error);
  } finally {
    polling = false;
  }
}

export function startPaymentMonitor(resolveBot: BotResolver) {
  void pollOnce(resolveBot);
  return setInterval(() => {
    void pollOnce(resolveBot);
  }, config.paymentPollIntervalMs);
}