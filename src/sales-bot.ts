import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config } from './config';
import * as api from './api';
import * as db from './db';

/** 创建并启动一个出售机器人 */
export function createSaleBot(botToken: string, botId: number): Bot {
  const bot = new Bot(botToken);
  const BTN_ACTIVE_CODES = '🔴 已使用';
  const BTN_UNUSED_CODES = '🟢 未使用';
  const BTN_BUY_CODES = '🟡 购买授权码';
  const BTN_DOWNLOAD_PAGE = '⬇️ 会议下载页';
  const BTN_WEB_PAGE = '🌐 网页端';
  const BTN_BIND = '🔐 绑定当前账号';
  const BTN_UNBIND = '🔓 解除当前绑定';

  type CodeStatus = 'unused' | 'active' | 'expired';

  type CodeStatusItem = {
    code: db.UserCode;
    status: CodeStatus;
    roomName: string | null;
    activatedAt: string | null;
    expiresAt: string | null;
    ttlSeconds: number | null;
  };

  function formatAmount(value: number) {
    return value.toFixed(3);
  }

  function buildQrCodeUrl(content: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(content)}`;
  }

  async function sendWalletBlock(ctx: any, label: string, address: string) {
    await ctx.reply(`${label}\n<code>${address}</code>`, {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });

    await ctx.replyWithPhoto(buildQrCodeUrl(address), {
      caption: `${label.replace(':', '')}二维码\n请核对地址后扫码付款`,
      reply_markup: mainKeyboard(),
    });
  }

  async function allocatePayableAmount(baseTotal: number) {
    const pending = await db.getRecentPendingOrdersByTotal(baseTotal);
    const used = new Set(pending.map((item) => formatAmount(Number(item.payable_amount))));
    for (let step = 1; step <= 999; step++) {
      const offset = step / 1000;
      const payable = Number((baseTotal + offset).toFixed(3));
      if (!used.has(formatAmount(payable))) {
        return { offset, payable };
      }
    }
    return null;
  }

  function mainKeyboard() {
    return new Keyboard()
      .text(BTN_BIND)
      .text(BTN_UNBIND)
      .row()
      .text(BTN_DOWNLOAD_PAGE)
      .text(BTN_WEB_PAGE)
      .row()
      .text(BTN_BUY_CODES)
      .text(BTN_ACTIVE_CODES)
      .text(BTN_UNUSED_CODES)
      .resized()
      .persistent();
  }

  async function getBindingState(telegramId: number) {
    const bindings = await db.getBotBindings(botId);
    const isBound = bindings.some((item) => item.telegram_id === telegramId);
    return { bindings, isBound };
  }

  async function ensureBound(ctx: any) {
    const userId = ctx.from?.id;
    if (!userId) return false;
    const { bindings, isBound } = await getBindingState(userId);
    if (isBound) return true;

    const usedSlots = bindings.length;
    const message = usedSlots >= 2
      ? '🔒 当前机器人已绑定满 2 个用户，仅绑定用户可使用。'
      : `🔒 使用前请先点击下方“${BTN_BIND}”按钮完成绑定\n当前已绑定 ${usedSlots}/2 个用户`;
    await ctx.reply(message, { reply_markup: mainKeyboard() });
    return false;
  }

  async function showPackages(ctx: any) {
    const notice =
      (await db.getSetting('purchase_notice')) ||
      '📦 <b>购买须知</b>\n\n购买成功后，授权码会自动存入当前机器人。';
    const packages = await db.getPackages();
    if (packages.length === 0) {
      await ctx.reply(`${notice}\n\n⚠️ 暂无可用套餐`, {
        parse_mode: 'HTML',
        reply_markup: mainKeyboard(),
      });
      return;
    }
    const keyboard = new InlineKeyboard();
    for (const item of packages) {
      const total = item.quantity * item.unit_price;
      keyboard
        .text(`📦 ${item.quantity}个 · 单价${item.unit_price} · 总价${total}USDT`, `sale_buy_pack:${item.id}`)
        .row();
    }
    await ctx.reply(`${notice}\n\n请选择套餐：`, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  }

  function getInviteRoomName(invite: any) {
    return invite?.roomName || invite?.room_name || null;
  }

  function getInviteExpiresAt(invite: any) {
    return invite?.expiresAt || invite?.expires_at || null;
  }

  function getInviteActivatedAt(invite: any) {
    return invite?.activatedAt || invite?.activated_at || null;
  }

  function getInviteTtlSeconds(invite: any) {
    const value = invite?.ttlSeconds || invite?.ttl_seconds;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  function formatDateTime(value: string | null) {
    if (!value) return '未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未知';
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function formatDuration(totalSeconds: number | null) {
    if (!totalSeconds || totalSeconds <= 0) return '未知';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`;
    if (hours > 0) return `${hours}小时`;
    return `${minutes}分钟`;
  }

  function formatRemainingTime(expiresAt: string | null) {
    if (!expiresAt) return '未知';
    const remainMs = new Date(expiresAt).getTime() - Date.now();
    if (!Number.isFinite(remainMs)) return '未知';
    if (remainMs <= 0) return '已到期';
    return formatDuration(Math.floor(remainMs / 1000));
  }

  async function getCodeStatusItems(): Promise<CodeStatusItem[]> {
    const codes = await db.getBotCodes(botId);
    if (codes.length === 0) {
      return [];
    }

    const activeInvites = await api.getAllInvites();
    const activeInviteMap = new Map(activeInvites.map((invite) => [invite.code, invite]));
    const now = Date.now();

    return Promise.all(
      codes.map(async (code) => {
        let invite = activeInviteMap.get(code.code);
        if (!invite) {
          invite = await api.getInviteInfo(code.code);
        }

        if (!invite) {
          return {
            code,
            status: 'expired',
            roomName: code.room_name,
            activatedAt: null,
            expiresAt: null,
            ttlSeconds: null,
          };
        }

        const expiresAt = getInviteExpiresAt(invite);
        const activatedAt = getInviteActivatedAt(invite);
        const ttlSeconds = getInviteTtlSeconds(invite);
        const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : NaN;
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= now) {
          return {
            code,
            status: 'expired',
            roomName: getInviteRoomName(invite),
            activatedAt,
            expiresAt,
            ttlSeconds,
          };
        }

        const roomName = getInviteRoomName(invite);
        return {
          code,
          status: activatedAt ? 'active' : 'unused',
          roomName,
          activatedAt,
          expiresAt,
          ttlSeconds,
        };
      }),
    );
  }

  async function buildOverview() {
    const items = await getCodeStatusItems();
    const total = items.length;
    const unused = items.filter((item) => item.status === 'unused').length;
    const active = items.filter((item) => item.status === 'active').length;
    const expired = items.filter((item) => item.status === 'expired').length;
    return (
      '📋 <b>授权码总览</b>\n' +
      `总数 (${total})\n` +
      `未使用 (${unused}) / 使用中 (${active}) / 过期 (${expired})`
    );
  }

  async function sendCodeList(ctx: any, status: CodeStatus) {
    const items = (await getCodeStatusItems()).filter((item) => item.status === status);
    const title = status === 'active'
      ? '📤 <b>授权码（使用中）</b>'
      : status === 'expired'
        ? '⌛ <b>授权码（过期）</b>'
        : '📦 <b>授权码（未使用）</b>';
    if (items.length === 0) {
      await ctx.reply(`${title}\n\n暂无数据`, {
        parse_mode: 'HTML',
        reply_markup: mainKeyboard(),
      });
      return;
    }

    if (status === 'unused') {
      let text = `${title}\n\n`;
      for (const item of items) {
        text += [
          `• <code>${item.code.code}</code>`,
          `  时长: ${formatDuration(item.ttlSeconds)}`,
          '',
        ].join('\n');
      }
      await ctx.reply(text.trim(), {
        parse_mode: 'HTML',
        reply_markup: mainKeyboard(),
      });
      return;
    }

    if (status === 'active') {
      await ctx.reply(title, {
        parse_mode: 'HTML',
        reply_markup: mainKeyboard(),
      });
      for (const item of items) {
        const text = [
          `📦 <b>授权码</b>: <code>${item.code.code}</code>`,
          `房间: ${item.roomName || '未绑定'}`,
          `开始时间: ${formatDateTime(item.activatedAt)}`,
          `到期时间: ${formatDateTime(item.expiresAt)}`,
          `剩余时间: ${formatRemainingTime(item.expiresAt)}`,
        ].join('\n');
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: item.roomName
            ? new InlineKeyboard().text('🔓 释放房间', `sale_release:${item.code.code}`)
            : undefined,
        });
      }
      return;
    }

    let text = `${title}\n\n`;
    for (const item of items) {
      text += [
        `• <code>${item.code.code}</code>`,
        `  到期时间: ${formatDateTime(item.expiresAt)}`,
        '',
      ].join('\n');
    }
    await ctx.reply(text.trim(), {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });
  }

  bot.command('start', async (ctx) => {
	const userId = ctx.from?.id;
	if (!userId) return;
	const { bindings, isBound } = await getBindingState(userId);
	if (!isBound) {
		const remain = Math.max(0, 2 - bindings.length);
		await ctx.reply(
			remain > 0
				? `🔐 当前机器人启用了绑定使用，点击下方“${BTN_BIND}”即可绑定。\n剩余可绑定名额: ${remain}`
				: '🔒 当前机器人已绑定满 2 个用户，仅绑定用户可使用。',
			{ reply_markup: mainKeyboard() },
		);
		return;
	}
	const overview = await buildOverview();
    await ctx.reply(overview, {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });
  });

  bot.hears(BTN_ACTIVE_CODES, async (ctx) => {
    if (!(await ensureBound(ctx))) return;
    await sendCodeList(ctx, 'active');
  });

  bot.hears(BTN_UNUSED_CODES, async (ctx) => {
    if (!(await ensureBound(ctx))) return;
    await sendCodeList(ctx, 'unused');
  });

  bot.hears(BTN_BUY_CODES, async (ctx) => {
    if (!(await ensureBound(ctx))) return;
    await showPackages(ctx);
  });

  bot.hears(BTN_DOWNLOAD_PAGE, async (ctx) => {
    if (!(await ensureBound(ctx))) return;
    const url = (await db.getSetting('download_url')) || '暂未设置';
    if (!/^https?:\/\//i.test(url)) {
      await ctx.reply('⬇️ 会议下载页暂未设置', { reply_markup: mainKeyboard() });
      return;
    }
    await ctx.reply('⬇️ 会议下载页', {
      reply_markup: new InlineKeyboard().url('打开会议下载页', url),
    });
  });

  bot.hears(BTN_WEB_PAGE, async (ctx) => {
    if (!(await ensureBound(ctx))) return;
    const url = (await db.getSetting('web_url')) || '暂未设置';
    if (!/^https?:\/\//i.test(url)) {
      await ctx.reply('🌐 网页端暂未设置', { reply_markup: mainKeyboard() });
      return;
    }
    await ctx.reply('🌐 网页端', {
      reply_markup: new InlineKeyboard().url('打开网页端', url),
    });
  });

  bot.hears(BTN_BIND, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const result = await db.bindBotUser(botId, userId);
    if (result === 'exists') {
      await ctx.reply('✅ 你已经绑定过当前机器人', { reply_markup: mainKeyboard() });
      return;
    }
    if (result === 'full') {
      await ctx.reply('❌ 当前机器人最多只能绑定 2 个用户', { reply_markup: mainKeyboard() });
      return;
    }
    if (result === 'error') {
      await ctx.reply('❌ 绑定失败，请稍后重试', { reply_markup: mainKeyboard() });
      return;
    }
    const overview = await buildOverview();
    await ctx.reply(`✅ 绑定成功\n\n${overview}`, {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });
  });

  bot.hears(BTN_UNBIND, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    const isBound = await db.isBotUserBound(botId, userId);
    if (!isBound) {
      await ctx.reply('❌ 你当前没有绑定这个机器人', { reply_markup: mainKeyboard() });
      return;
    }
    const ok = await db.unbindBotUser(botId, userId);
    await ctx.reply(ok ? '✅ 你已解绑当前机器人' : '❌ 解绑失败，请稍后重试', {
      reply_markup: mainKeyboard(),
    });
  });

  bot.callbackQuery(/^sale_buy_pack:(\d+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    const { isBound } = await getBindingState(userId);
    if (!isBound) {
      await ctx.reply(`🔒 请先点击“${BTN_BIND}”完成绑定后再购买`, { reply_markup: mainKeyboard() });
      return;
    }

    const packageId = Number(ctx.match[1]);
    const packages = await db.getPackages();
    const pkg = packages.find((item) => item.id === packageId);
    if (!pkg) {
      await ctx.reply('❌ 套餐不存在', { reply_markup: mainKeyboard() });
      return;
    }

    const paymentAddress = (await db.getSetting('payment_address')) || '';
    if (!paymentAddress || paymentAddress.includes('待设置')) {
      await ctx.reply('❌ 收款地址未设置，请联系管理员', { reply_markup: mainKeyboard() });
      return;
    }

    const amountPlan = await allocatePayableAmount(pkg.quantity * pkg.unit_price);
    if (!amountPlan) {
      await ctx.reply('❌ 当前待支付订单过多，请稍后再试', { reply_markup: mainKeyboard() });
      return;
    }

    const expireAt = new Date(Date.now() + config.paymentOrderExpireMinutes * 60 * 1000).toISOString();
    const order = await db.createPaymentOrder({
      telegramId: userId,
      botId,
      packageId: pkg.id,
      quantity: pkg.quantity,
      unitPrice: pkg.unit_price,
      totalPrice: pkg.quantity * pkg.unit_price,
      amountOffset: amountPlan.offset,
      payableAmount: amountPlan.payable,
      expireAt,
    });

    if (!order) {
      await ctx.reply('❌ 创建订单失败，请稍后重试', { reply_markup: mainKeyboard() });
      return;
    }

    const backupWallet = (await db.getSetting('payment_backup')) || '';
    const text = [
      '💳 <b>订单已创建</b>',
      '',
      `订单号: <code>${order.id}</code>`,
      `套餐数量: ${pkg.quantity} 个授权码`,
      `应付金额: <b>${formatAmount(amountPlan.payable)} USDT</b>`,
      `支付时效: ${config.paymentOrderExpireMinutes} 分钟`,
      '',
      '请务必按上方准确金额转账。下方会分别发送主收款地址和二维码；如主地址不可用，再使用备用地址。',
    ].join('\n');

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: mainKeyboard(),
    });

    await sendWalletBlock(ctx, '🔹 主收款地址:', paymentAddress);

    if (backupWallet) {
      await sendWalletBlock(ctx, '🔸 备用收款地址:', backupWallet);
    }
  });

  bot.callbackQuery(/^sale_release:([A-Z0-9]+)$/, async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;
    await ctx.answerCallbackQuery();
    const { isBound } = await getBindingState(userId);
    if (!isBound) {
      await ctx.reply(`🔒 请先点击“${BTN_BIND}”完成绑定后再操作`, { reply_markup: mainKeyboard() });
      return;
    }

    const code = ctx.match[1];
    const ok = await api.releaseRoom(code);
    if (!ok) {
      await ctx.reply(`❌ 授权码 ${code} 释放失败，请稍后重试`, { reply_markup: mainKeyboard() });
      return;
    }

    await db.markCodeUnused(code);
    await ctx.reply(`✅ 授权码 ${code} 已释放，可再次开设房间`, { reply_markup: mainKeyboard() });
  });

  return bot;
}
