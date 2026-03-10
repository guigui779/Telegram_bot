import { Bot, InlineKeyboard, Keyboard } from 'grammy';
import { config } from './config';
import * as db from './db';
import * as api from './api';

type AdminState =
	| 'wait_addbot'
	| 'wait_delbot'
	| 'wait_addadmin'
	| 'wait_deladmin'
	| 'wait_addpkg'
	| 'wait_delpkg'
	| 'wait_buytext'
	| 'wait_wallet'
	| 'wait_backup'
	| 'wait_news'
	| 'wait_weburl'
	| 'wait_downloadurl'
	| 'wait_apiurl_main'
	| 'wait_apiurl_backup'
	| 'wait_support'
	| 'wait_sendcodes'
	| 'wait_delcode'
	| 'wait_botstats'
	| 'wait_codeinfo'
	| 'wait_releasecode'
	| 'wait_startrecord'
	| 'wait_stoprecord';

interface ConvState {
	action: AdminState;
	botId?: number;
}

const states = new Map<number, ConvState>();

const BTN_BUY = '🛒 预授权码购买';
const BTN_QUERY = '📋 用户ID查询';
const BTN_HELP = '📖 平台使用说明';
const BTN_SUPPORT = '💬 咨询官方客服';
const BTN_NEWS = '📰 云际会议资讯';
const ROOT_IDS = new Set(config.initialAdminIds);
const ROOT_ONLY_CATEGORIES = new Set(['admin', 'pkg', 'wallet', 'settings']);
const ROOT_ONLY_DO_ACTIONS = new Set(['listadmins', 'listpkgs', 'health', 'apiurlmenu', 'healthcheck', 'recordings']);
const ROOT_ONLY_ASK_ACTIONS = new Set([
	'addbot',
	'delbot',
	'addadmin',
	'deladmin',
	'addpkg',
	'delpkg',
	'buytext',
	'wallet',
	'backup',
	'news',
	'weburl',
	'downloadurl',
	'apiurl_main',
	'apiurl_backup',
	'support',
	'startrecord',
	'stoprecord',
]);
const ROOT_ONLY_STATES = new Set<AdminState>([
	'wait_addbot',
	'wait_delbot',
	'wait_addadmin',
	'wait_deladmin',
	'wait_addpkg',
	'wait_delpkg',
	'wait_buytext',
	'wait_wallet',
	'wait_backup',
	'wait_news',
	'wait_weburl',
	'wait_downloadurl',
	'wait_apiurl_main',
	'wait_apiurl_backup',
	'wait_support',
	'wait_startrecord',
	'wait_stoprecord',
]);

function isRoot(userId: number) {
	return ROOT_IDS.has(userId);
}

function isRootOnlyCategory(cat: string) {
	return ROOT_ONLY_CATEGORIES.has(cat);
}

function isRootOnlyDoAction(action: string) {
	return ROOT_ONLY_DO_ACTIONS.has(action);
}

function isRootOnlyAskAction(action: string) {
	return ROOT_ONLY_ASK_ACTIONS.has(action);
}

function isRootOnlyState(action: AdminState) {
	return ROOT_ONLY_STATES.has(action);
}

function setState(uid: number, action: AdminState, botId?: number) {
	states.set(uid, { action, botId });
}

function clearState(uid: number) {
	states.delete(uid);
}

function replyKeyboard() {
	return new Keyboard()
		.text(BTN_BUY)
		.text(BTN_QUERY)
		.row()
		.text(BTN_HELP)
		.text(BTN_SUPPORT)
		.row()
		.text(BTN_NEWS)
		.resized()
		.persistent();
}

function adminMainMenu(userId: number) {
	const kb = new InlineKeyboard()
		.text('🤖 机器人管理', 'adm_cat:bot')
		.text('🎫 授权码管理', 'adm_cat:auth');

	if (isRoot(userId)) {
		kb
			.row()
			.text('👑 管理员管理', 'adm_cat:admin')
			.text('📦 套餐管理', 'adm_cat:pkg')
			.row()
			.text('💰 收款地址', 'adm_cat:wallet');
	}

	return kb;
}

function backKb(cat: string) {
	return new InlineKeyboard().text('⬅️ 返回', `adm_cat:${cat}`).text('🏠 主菜单', 'adm_back');
}

function apiUrlKb() {
	return new InlineKeyboard()
		.text('🔹 主接口地址', 'adm_ask:apiurl_main')
		.text('🔸 备用接口地址', 'adm_ask:apiurl_backup')
		.row()
		.text('⬅️ 返回', 'adm_cat:admin')
		.text('🏠 主菜单', 'adm_back');
}

function catMenu(cat: string, userId: number) {
	switch (cat) {
		case 'bot':
			if (isRoot(userId)) {
				return new InlineKeyboard()
					.text('➕ 添加用户机器人', 'adm_ask:addbot')
					.text('🗑 删除用户机器人', 'adm_ask:delbot')
					.row()
					.text('📋 查看全部机器人', 'adm_do:listbots')
					.text('🖥 前端页面设置', 'adm_cat:settings')
					.row()
					.text('⬅️ 返回', 'adm_back');
			}
			return new InlineKeyboard()
				.text('📋 查看全部机器人', 'adm_do:listbots')
				.row()
				.text('⬅️ 返回', 'adm_back');
		case 'auth':
			return new InlineKeyboard()
				.text('📤 下发授权码', 'adm_ask:sendcodes')
				.text('🗑 删除单个授权码', 'adm_ask:delcode')
				.text('♻️ 释放房间', 'adm_ask:releasecode')
				.row()
				.text('🔍 授权码详情', 'adm_ask:codeinfo')
				.text('📊 单个机器人统计', 'adm_ask:botstats')
				.text('🔢 全平台统计', 'adm_do:totalstats')
				.row()
				.text('⬅️ 返回', 'adm_back');
		case 'admin':
			if (!isRoot(userId)) return null;
			return new InlineKeyboard()
				.text('➕ 添加管理员', 'adm_ask:addadmin')
				.text('🗑 删除管理员', 'adm_ask:deladmin')
				.row()
				.text('📋 管理员列表', 'adm_do:listadmins')
				.text('✏️ 编辑资讯', 'adm_ask:news')
				.row()
				.text('🩺 健康状态', 'adm_do:health')
				.text('🔗 接口地址更换', 'adm_do:apiurlmenu')
				.text('☎️ 客服账号', 'adm_ask:support')
				.row()
				.text('🎥 录制列表', 'adm_do:recordings')
				.text('⏺ 开始录制', 'adm_ask:startrecord')
				.text('⏹ 停止录制', 'adm_ask:stoprecord')
				.row()
				.text('⬅️ 返回', 'adm_back');
		case 'settings':
			if (!isRoot(userId)) return null;
			return new InlineKeyboard()
				.text('🌐 WEB端网址', 'adm_ask:weburl')
				.text('⬇️ 下载页网址', 'adm_ask:downloadurl')
				.row()
				.text('⬅️ 返回', 'adm_cat:bot')
				.text('🏠 主菜单', 'adm_back');
		case 'pkg':
			if (!isRoot(userId)) return null;
			return new InlineKeyboard()
				.text('➕ 添加套餐', 'adm_ask:addpkg')
				.text('📋 查看套餐', 'adm_do:listpkgs')
				.row()
				.text('🗑 删除套餐', 'adm_ask:delpkg')
				.text('✏️ 购买页文案', 'adm_ask:buytext')
				.row()
				.text('⬅️ 返回', 'adm_back');
		case 'wallet':
			if (!isRoot(userId)) return null;
			return new InlineKeyboard()
				.text('🔹 主收款地址', 'adm_ask:wallet')
				.text('🔸 备用收款地址', 'adm_ask:backup')
				.row()
				.text('⬅️ 返回', 'adm_back');
		default:
			return null;
	}
}

const CAT_TITLE: Record<string, string> = {
	bot: '🤖 机器人管理',
	auth: '🎫 授权码管理',
	admin: '👑 管理员管理',
	settings: '🖥 前端页面设置',
	pkg: '📦 套餐管理',
	wallet: '💰 收款地址',
};

async function sendAdminMenu(ctx: any, userId: number) {
	await ctx.reply('👑 <b>管理员操作菜单</b>\n\n请选择操作类别：', {
		parse_mode: 'HTML',
		reply_markup: adminMainMenu(userId),
	});
}

async function showBotList(ctx: any) {
	const bots = await db.getSaleBots();
	if (bots.length === 0) {
		await ctx.reply('🤖 暂无用户机器人', { reply_markup: backKb('bot') });
		return;
	}
	let msg = '🤖 <b>用户机器人列表</b>\n\n';
	for (const bot of bots) {
		msg += `ID: <code>${bot.id}</code>\n`;
		msg += `名称: ${bot.bot_name || '未设置'}\n`;
		msg += `用户名: @${bot.bot_username || '未设置'}\n\n`;
	}
	await ctx.reply(msg.trim(), { parse_mode: 'HTML', reply_markup: backKb('bot') });
}

async function showPackages(ctx: any) {
	const pkgs = await db.getPackages();
	if (pkgs.length === 0) {
		await ctx.reply('📦 暂无套餐', { reply_markup: backKb('pkg') });
		return;
	}
	let msg = '📦 <b>套餐列表</b>\n\n';
	for (const p of pkgs) {
		const total = p.quantity * p.unit_price;
		msg += `ID: <code>${p.id}</code>\n`;
		msg += `${p.quantity} 个授权码\n`;
		msg += `单价: ${p.unit_price} USDT\n`;
		msg += `总价: ${total} USDT\n\n`;
	}
	await ctx.reply(msg.trim(), { parse_mode: 'HTML', reply_markup: backKb('pkg') });
}

async function showBotStats(ctx: any, botId: number) {
	const codes = await db.getCodesByBot(botId);
	const total = codes.length;
	const used = codes.filter((item) => item.used).length;
	const unused = total - used;
	await ctx.reply(
		`📊 <b>机器人授权码统计</b>\n\n机器人ID: <code>${botId}</code>\n总数: ${total}\n未使用: ${unused}\n已使用: ${used}`,
		{ parse_mode: 'HTML', reply_markup: backKb('auth') },
	);
}

function formatInviteInfo(invite: any) {
	const code = invite?.code || '未知';
	const roomName = invite?.roomName || invite?.room_name || '未绑定';
	const identity = invite?.identity || '未绑定';
	const expiresAt = invite?.expiresAt || invite?.expires_at || '未知';
	const used = invite?.used ? '是' : '否';
	const revoked = invite?.revoked ? '是' : '否';
	return [
		`🔍 <b>授权码详情</b>`,
		'',
		`授权码: <code>${code}</code>`,
		`房间: ${roomName}`,
		`身份: ${identity}`,
		`已使用: ${used}`,
		`已撤销: ${revoked}`,
		`过期时间: ${expiresAt}`,
	].join('\n');
}

async function showAllInvites(ctx: any) {
	const invites = await api.getAllInvites();
	if (!invites || invites.length === 0) {
		await ctx.reply('📜 暂无授权码', { reply_markup: backKb('auth') });
		return;
	}
	let text = '📜 <b>全部授权码</b>\n\n';
	for (const invite of invites.slice(0, 50)) {
		const code = invite?.code || '未知';
		const roomName = invite?.roomName || invite?.room_name || '未绑定';
		const used = invite?.used ? '已使用' : '未使用';
		text += `<code>${code}</code>  ${used}  ${roomName}\n`;
	}
	if (invites.length > 50) {
		text += `\n… 共 ${invites.length} 条，仅显示前 50 条`;
	}
	await ctx.reply(text.trim(), { parse_mode: 'HTML', reply_markup: backKb('auth') });
}

async function showRooms(ctx: any) {
	const rooms = await api.listRooms();
	if (rooms.length === 0) {
		await ctx.reply('🏠 当前没有房间', { reply_markup: backKb('bot') });
		return;
	}
	let text = '🏠 <b>房间列表</b>\n\n';
	for (const room of rooms.slice(0, 50)) {
		text += `房间: <code>${room.name || '未知'}</code>\n`;
		text += `人数: ${room.numParticipants ?? 0}\n`;
		text += `录制中: ${room.activeRecording ? '是' : '否'}\n\n`;
	}
	if (rooms.length > 50) {
		text += `… 共 ${rooms.length} 个房间，仅显示前 50 个`;
	}
	await ctx.reply(text.trim(), { parse_mode: 'HTML', reply_markup: backKb('bot') });
}

async function showHealth(ctx: any, manual = false) {
	const health = manual ? await api.manualHealthCheck() : await api.getHealth();
	if (!health) {
		await ctx.reply(manual ? '❌ 手动巡检失败' : '❌ 获取健康状态失败', { reply_markup: backKb('admin') });
		return;
	}
	const interfaceMain = (await db.getSetting('api_url_main')) || (await db.getSetting('api_url')) || config.apiUrl;
	const interfaceBackup = (await db.getSetting('api_url_backup')) || '未设置';
	const primary = health.primary || {};
	const activeServer = health.activeServer === 'fallback' ? '备用接口' : '主接口';
	const overallHealthy = primary.healthy ? '正常' : '异常';
	const text = [
		manual ? '🔄 <b>手动健康检查</b>' : '🩺 <b>健康状态</b>',
		'',
		`主接口地址: ${interfaceMain}`,
		`备用接口地址: ${interfaceBackup}`,
		'',
		`当前生效: ${activeServer}`,
		`当前状态: ${overallHealthy}`,
		`上次检查: ${primary.lastChecked || '未知'}`,
	].join('\n');
	const kb = new InlineKeyboard()
		.text('🔄 立即巡检', 'adm_do:healthcheck')
		.row()
		.text('⬅️ 返回', 'adm_cat:admin')
		.text('🏠 主菜单', 'adm_back');
	await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
}

async function showRecordings(ctx: any) {
	const list = await api.listRecordings();
	if (list.length === 0) {
		await ctx.reply('🎥 暂无录制任务', { reply_markup: backKb('admin') });
		return;
	}
	let text = '🎥 <b>录制列表</b>\n\n';
	for (const item of list.slice(0, 30)) {
		text += `房间: ${item.roomName || '未知'}\n`;
		text += `Egress: <code>${item.egressId || '未知'}</code>\n`;
		text += `状态: ${item.status || '未知'}\n\n`;
	}
	if (list.length > 30) {
		text += `… 共 ${list.length} 条，仅显示前 30 条`;
	}
	await ctx.reply(text.trim(), { parse_mode: 'HTML', reply_markup: backKb('admin') });
}

async function notifyRoots(bot: Bot, operatorId: number, action: string, details: string[]) {
	if (ROOT_IDS.size === 0) return;
	const text = [
		`🔔 <b>${action}</b>`,
		'',
		`操作人: <code>${operatorId}</code>`,
		...details,
	].join('\n');

	for (const rootId of ROOT_IDS) {
		if (rootId === operatorId) continue;
		try {
			await bot.api.sendMessage(rootId, text, { parse_mode: 'HTML' });
		} catch {
			// 静默监听不影响主流程
		}
	}
}

export function createAdminBot(): Bot {
	const bot = new Bot(config.adminBotToken);

	bot.command('start', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		await ctx.reply(
			'☁️ <b>云际会议（官方总）</b>\n\n请使用下方菜单继续。',
			{ parse_mode: 'HTML', reply_markup: replyKeyboard() },
		);
	});

	bot.command('admin', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		if (!(await db.isAdmin(userId))) {
			await ctx.reply('⛔ 权限不足');
			return;
		}
		await sendAdminMenu(ctx, userId);
	});

	bot.hears(BTN_QUERY, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		const userName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || ctx.from?.username || '未设置';
		const botName = ctx.me.first_name || ctx.me.username || '未设置';
		await ctx.reply(
			`📋 <b>信息查询</b>\n\n本人 ID: <code>${userId}</code>\n本人名字: ${userName}\n机器人 ID: <code>${ctx.me.id}</code>\n机器人名字: ${botName}`,
			{ parse_mode: 'HTML', reply_markup: replyKeyboard() },
		);
	});

	bot.hears(BTN_SUPPORT, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		const contact = (await db.getSetting('customer_service')) || '暂未设置';
		await ctx.reply(`💬 官方客服: ${contact}`, { reply_markup: replyKeyboard() });
	});

	bot.hears(BTN_NEWS, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		const news = (await db.getSetting('news_content')) || '📰 暂无最新资讯';
		await ctx.reply(news, { reply_markup: replyKeyboard() });
	});

	bot.hears(BTN_HELP, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		if (!(await db.isAdmin(userId))) {
			await ctx.reply('⛔ 使用说明仅管理员可查看', { reply_markup: replyKeyboard() });
			return;
		}
		await sendAdminMenu(ctx, userId);
	});

	bot.hears(BTN_BUY, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		clearState(userId);
		const notice =
			(await db.getSetting('purchase_notice')) ||
			'🛒 <b>预授权码购买</b>\n\n请选择下方套餐。';
		const pkgs = await db.getPackages();
		if (pkgs.length === 0) {
			await ctx.reply(`${notice}\n\n⚠️ 暂无可用套餐`, {
				parse_mode: 'HTML',
				reply_markup: replyKeyboard(),
			});
			return;
		}
		const kb = new InlineKeyboard();
		for (const p of pkgs) {
			const total = p.quantity * p.unit_price;
			kb.text(`📦 ${p.quantity}个 · 单价${p.unit_price}USDT · 总价${total}USDT`, `buy_pack:${p.id}`).row();
		}
		await ctx.reply(`${notice}\n\n请选择套餐：`, {
			parse_mode: 'HTML',
			reply_markup: kb,
		});
	});

	bot.callbackQuery(/^buy_pack:(\d+)$/, async (ctx) => {
		await ctx.answerCallbackQuery();
		const pkgId = Number(ctx.match[1]);
		const pkgs = await db.getPackages();
		const pkg = pkgs.find((item) => item.id === pkgId);
		if (!pkg) {
			await ctx.reply('❌ 套餐不存在');
			return;
		}
		const mainWallet = (await db.getSetting('payment_address')) || '未设置';
		const backupWallet = (await db.getSetting('payment_backup')) || '';
		const total = pkg.quantity * pkg.unit_price;
		let text = `💳 <b>付款页面</b>\n\n📦 套餐: ${pkg.quantity} 个授权码\n💰 单价: ${pkg.unit_price} USDT\n💰 总价: <b>${total} USDT</b>\n\n🔹 主收款地址:\n<code>${mainWallet}</code>`;
		if (backupWallet) {
			text += `\n\n🔸 备用地址:\n<code>${backupWallet}</code>`;
		}
		await ctx.reply(text, { parse_mode: 'HTML', reply_markup: replyKeyboard() });
	});

	bot.callbackQuery('adm_back', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId || !(await db.isAdmin(userId))) return;
		clearState(userId);
		await ctx.editMessageText('👑 <b>管理员操作菜单</b>\n\n请选择操作类别：', {
			parse_mode: 'HTML',
			reply_markup: adminMainMenu(userId),
		});
		await ctx.answerCallbackQuery();
	});

	bot.callbackQuery(/^adm_cat:(.+)$/, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId || !(await db.isAdmin(userId))) return;
		const cat = ctx.match[1];
		if (isRootOnlyCategory(cat) && !isRoot(userId)) {
			await ctx.answerCallbackQuery({ text: '⛔ 仅ROOT可访问', show_alert: true });
			return;
		}
		const kb = catMenu(cat, userId);
		if (!kb) return;
		clearState(userId);
		await ctx.editMessageText(`👑 <b>${CAT_TITLE[cat] || cat}</b>\n\n请选择操作：`, {
			parse_mode: 'HTML',
			reply_markup: kb,
		});
		await ctx.answerCallbackQuery();
	});

	bot.callbackQuery(/^adm_do:(.+)$/, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId || !(await db.isAdmin(userId))) return;
		const sub = ctx.match[1];
		if (isRootOnlyDoAction(sub) && !isRoot(userId)) {
			await ctx.answerCallbackQuery({ text: '⛔ 仅ROOT可操作', show_alert: true });
			return;
		}
		await ctx.answerCallbackQuery();
		if (sub === 'listbots') {
			await showBotList(ctx);
			return;
		}
		if (sub === 'listrooms') {
			await showRooms(ctx);
			return;
		}
		if (sub === 'listadmins') {
			const admins = (await db.getAdmins()).filter((admin) => !isRoot(admin.telegram_id));
			if (admins.length === 0) {
				await ctx.reply('👑 暂无管理员', { reply_markup: backKb('admin') });
				return;
			}
			let msg = '👑 <b>管理员列表</b>\n\n';
			for (const admin of admins) {
				msg += `<code>${admin.telegram_id}</code> ${admin.username ? `(${admin.username})` : ''}\n`;
			}
			await ctx.reply(msg.trim(), { parse_mode: 'HTML', reply_markup: backKb('admin') });
			return;
		}
		if (sub === 'listpkgs') {
			await showPackages(ctx);
			return;
		}
		if (sub === 'listallcodes') {
			await showAllInvites(ctx);
			return;
		}
		if (sub === 'health') {
			await showHealth(ctx, false);
			return;
		}
		if (sub === 'apiurlmenu') {
			const currentMain = (await db.getSetting('api_url_main')) || (await db.getSetting('api_url')) || config.apiUrl;
			const currentBackup = (await db.getSetting('api_url_backup')) || '未设置';
			await ctx.reply(
				`🔗 <b>接口地址管理</b>\n\n🔹 主接口地址:\n<code>${currentMain}</code>\n\n🔸 备用接口地址:\n<code>${currentBackup}</code>`,
				{ parse_mode: 'HTML', reply_markup: apiUrlKb() },
			);
			return;
		}
		if (sub === 'healthcheck') {
			await showHealth(ctx, true);
			return;
		}
		if (sub === 'recordings') {
			await showRecordings(ctx);
			return;
		}
		if (sub === 'totalstats') {
			const stats = await db.getAllCodesStats();
			await ctx.reply(
				`🔢 <b>全平台授权码统计</b>\n\n总数: ${stats.total}\n未使用: ${stats.unused}\n已使用: ${stats.used}`,
				{ parse_mode: 'HTML', reply_markup: backKb('auth') },
			);
		}
	});

	bot.callbackQuery(/^adm_ask:(.+)$/, async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId || !(await db.isAdmin(userId))) return;
		const sub = ctx.match[1];
		if (isRootOnlyAskAction(sub) && !isRoot(userId)) {
			await ctx.answerCallbackQuery({ text: '⛔ 仅ROOT可操作', show_alert: true });
			return;
		}
		clearState(userId);
		await ctx.answerCallbackQuery();
		if (sub === 'addbot') {
			setState(userId, 'wait_addbot');
			await ctx.reply('➕ 请发送用户机器人 Bot Token');
			return;
		}
		if (sub === 'delbot') {
			setState(userId, 'wait_delbot');
			await ctx.reply('🗑 请发送要删除的用户机器人 ID');
			return;
		}
		if (sub === 'addadmin') {
			setState(userId, 'wait_addadmin');
			await ctx.reply('➕ 请发送管理员 Telegram ID');
			return;
		}
		if (sub === 'deladmin') {
			setState(userId, 'wait_deladmin');
			await ctx.reply('🗑 请发送要删除的管理员 Telegram ID');
			return;
		}
		if (sub === 'addpkg') {
			setState(userId, 'wait_addpkg');
			await ctx.reply('➕ 请发送：数量 单价USDT\n例：20 40');
			return;
		}
		if (sub === 'delpkg') {
			setState(userId, 'wait_delpkg');
			await ctx.reply('🗑 请发送要删除的套餐 ID');
			return;
		}
		if (sub === 'buytext') {
			setState(userId, 'wait_buytext');
			await ctx.reply('✏️ 请发送新的购买页文案');
			return;
		}
		if (sub === 'wallet') {
			setState(userId, 'wait_wallet');
			await ctx.reply('🔹 请发送主收款地址');
			return;
		}
		if (sub === 'backup') {
			setState(userId, 'wait_backup');
			await ctx.reply('🔸 请发送备用收款地址');
			return;
		}
		if (sub === 'news') {
			setState(userId, 'wait_news');
			await ctx.reply('📰 请发送新的资讯内容');
			return;
		}
		if (sub === 'weburl') {
			setState(userId, 'wait_weburl');
			const currentWebUrl = (await db.getSetting('web_url')) || '未设置';
			await ctx.reply(`🌐 请发送新的 WEB 端网址\n\n当前网址:\n<code>${currentWebUrl}</code>`, {
				parse_mode: 'HTML',
				reply_markup: backKb('settings'),
			});
			return;
		}
		if (sub === 'downloadurl') {
			setState(userId, 'wait_downloadurl');
			const currentDownloadUrl = (await db.getSetting('download_url')) || '未设置';
			await ctx.reply(`⬇️ 请发送新的下载页网址\n\n当前网址:\n<code>${currentDownloadUrl}</code>`, {
				parse_mode: 'HTML',
				reply_markup: backKb('settings'),
			});
			return;
		}
		if (sub === 'apiurl_main') {
			setState(userId, 'wait_apiurl_main');
			const currentApiUrl = (await db.getSetting('api_url_main')) || (await db.getSetting('api_url')) || config.apiUrl;
			await ctx.reply(`🔹 请发送新的主接口地址\n\n当前地址:\n<code>${currentApiUrl}</code>`, {
				parse_mode: 'HTML',
				reply_markup: apiUrlKb(),
			});
			return;
		}
		if (sub === 'apiurl_backup') {
			setState(userId, 'wait_apiurl_backup');
			const currentApiUrl = (await db.getSetting('api_url_backup')) || '未设置';
			await ctx.reply(`🔸 请发送新的备用接口地址\n\n当前地址:\n<code>${currentApiUrl}</code>`, {
				parse_mode: 'HTML',
				reply_markup: apiUrlKb(),
			});
			return;
		}
		if (sub === 'support') {
			setState(userId, 'wait_support');
			await ctx.reply('☎️ 请发送新的客服账号');
			return;
		}
		if (sub === 'startrecord') {
			setState(userId, 'wait_startrecord');
			await ctx.reply('⏺ 请发送：房间名 [输出文件名]\n例：room001 record-room001.mp4');
			return;
		}
		if (sub === 'stoprecord') {
			setState(userId, 'wait_stoprecord');
			await ctx.reply('⏹ 请发送要停止的 egressId');
			return;
		}
		if (sub === 'sendcodes') {
			const bots = await db.getSaleBots();
			if (bots.length === 0) {
				await ctx.reply('❌ 暂无可下发授权码的用户机器人', { reply_markup: backKb('auth') });
				return;
			}
			const kb = new InlineKeyboard();
			for (const item of bots) {
				kb.text(`${item.bot_name || item.bot_username || '用户机器人'} · ID:${item.id}`, `adm_sendbot:${item.id}`).row();
			}
			kb.text('⬅️ 返回', 'adm_cat:auth').text('🏠 主菜单', 'adm_back');
			await ctx.reply('📤 请选择要下发授权码的用户机器人：', { reply_markup: kb });
			return;
		}
		if (sub === 'delcode') {
			setState(userId, 'wait_delcode');
			await ctx.reply('🗑 请发送要删除的授权码');
			return;
		}
		if (sub === 'codeinfo') {
			setState(userId, 'wait_codeinfo');
			await ctx.reply('🔍 请发送要查询的授权码');
			return;
		}
		if (sub === 'releasecode') {
			setState(userId, 'wait_releasecode');
			await ctx.reply('♻️ 请发送要释放房间的授权码');
			return;
		}
		if (sub === 'botstats') {
			setState(userId, 'wait_botstats');
			await ctx.reply('📊 请发送用户机器人 ID');
		}
	});

	bot.callbackQuery(/^adm_sendbot:(\d+)$/, async (ctx) => {
		const operatorId = ctx.from?.id;
		if (!operatorId || !(await db.isAdmin(operatorId))) return;
		await ctx.answerCallbackQuery();
		const botId = Number(ctx.match[1]);
		setState(operatorId, 'wait_sendcodes', botId);
		await ctx.reply(`📤 已选择机器人 ID: ${botId}\n\n请发送：数量 小时\n例：10 12`, {
			reply_markup: backKb('auth'),
		});
	});

	bot.on('message:text', async (ctx) => {
		const userId = ctx.from?.id;
		if (!userId) return;
		const state = states.get(userId);
		const text = ctx.message.text.trim();
		if (!state) return;
		clearState(userId);
		if (!(await db.isAdmin(userId))) {
			await ctx.reply('⛔ 权限不足');
			return;
		}
		if (isRootOnlyState(state.action) && !isRoot(userId)) {
			await ctx.reply('⛔ 仅ROOT可操作', { reply_markup: replyKeyboard() });
			return;
		}

		if (state.action === 'wait_addbot') {
			const token = text;
			try {
				const saleBot = new Bot(token);
				await saleBot.init();
				const ok = await db.addSaleBot(
					token,
					saleBot.botInfo.username || '',
					saleBot.botInfo.first_name || saleBot.botInfo.username || '用户机器人',
					userId,
				);
				await ctx.reply(ok ? `✅ 已添加用户机器人: @${saleBot.botInfo.username}` : '❌ 添加失败，可能已存在', {
					reply_markup: backKb('bot'),
				});
				if (ok) {
					await notifyRoots(bot, userId, '添加用户机器人', [
						`机器人ID: <code>${saleBot.botInfo.id}</code>`,
						`机器人账号: @${saleBot.botInfo.username || '未设置'}`,
					]);
				}
			} catch {
				await ctx.reply('❌ Bot Token 无效', { reply_markup: backKb('bot') });
			}
			return;
		}

		if (state.action === 'wait_delbot') {
			const id = Number(text);
			const ok = Number.isFinite(id) ? await db.removeSaleBot(id) : false;
			await ctx.reply(ok ? '✅ 删除成功' : '❌ 删除失败', { reply_markup: backKb('bot') });
			if (ok) {
				await notifyRoots(bot, userId, '删除用户机器人', [`机器人ID: <code>${id}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_addadmin') {
			const id = Number(text);
			if (!Number.isFinite(id)) {
				await ctx.reply('❌ 请输入正确的管理员 ID', { reply_markup: backKb('admin') });
				return;
			}
			if (isRoot(id)) {
				await ctx.reply('⛔ ROOT 已拥有最高权限，无需添加到管理员列表', { reply_markup: backKb('admin') });
				return;
			}
			const ok = await db.addAdmin(id);
			await ctx.reply(ok ? '✅ 管理员添加成功' : '❌ 添加失败', { reply_markup: backKb('admin') });
			if (ok) {
				await notifyRoots(bot, userId, '添加管理员', [`管理员ID: <code>${id}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_deladmin') {
			const id = Number(text);
			if (!Number.isFinite(id)) {
				await ctx.reply('❌ 请输入正确的管理员 ID', { reply_markup: backKb('admin') });
				return;
			}
			if (isRoot(id)) {
				await ctx.reply('⛔ ROOT 拥有最高权限，不能删除', { reply_markup: backKb('admin') });
				return;
			}
			const ok = await db.removeAdmin(id);
			await ctx.reply(ok ? '✅ 管理员删除成功' : '❌ 删除失败', { reply_markup: backKb('admin') });
			if (ok) {
				await notifyRoots(bot, userId, '删除管理员', [`管理员ID: <code>${id}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_addpkg') {
			const [qtyRaw, priceRaw] = text.split(/\s+/);
			const qty = Number(qtyRaw);
			const price = Number(priceRaw);
			const ok = Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price > 0
				? await db.addPackage(qty, price)
				: false;
			await ctx.reply(ok ? '✅ 套餐添加成功' : '❌ 格式错误或添加失败', { reply_markup: backKb('pkg') });
			if (ok) {
				await notifyRoots(bot, userId, '添加套餐', [
					`数量: ${qty}`,
					`单价: ${price} USDT`,
				]);
			}
			return;
		}

		if (state.action === 'wait_delpkg') {
			const id = Number(text);
			const ok = Number.isFinite(id) ? await db.removePackage(id) : false;
			await ctx.reply(ok ? '✅ 套餐删除成功' : '❌ 删除失败', { reply_markup: backKb('pkg') });
			if (ok) {
				await notifyRoots(bot, userId, '删除套餐', [`套餐ID: <code>${id}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_buytext') {
			const ok = await db.setSetting('purchase_notice', text);
			await ctx.reply(ok ? '✅ 购买页文案已更新' : '❌ 更新失败', { reply_markup: backKb('pkg') });
			if (ok) {
				await notifyRoots(bot, userId, '修改购买页文案', [`文案: ${text}`]);
			}
			return;
		}

		if (state.action === 'wait_wallet') {
			const ok = await db.setSetting('payment_address', text);
			await ctx.reply(ok ? '✅ 主收款地址已更新' : '❌ 更新失败', { reply_markup: backKb('wallet') });
			if (ok) {
				await notifyRoots(bot, userId, '修改主收款地址', [`地址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_backup') {
			const ok = await db.setSetting('payment_backup', text);
			await ctx.reply(ok ? '✅ 备用收款地址已更新' : '❌ 更新失败', { reply_markup: backKb('wallet') });
			if (ok) {
				await notifyRoots(bot, userId, '修改备用收款地址', [`地址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_news') {
			const ok = await db.setSetting('news_content', text);
			await ctx.reply(ok ? '✅ 资讯已更新' : '❌ 更新失败', { reply_markup: backKb('admin') });
			if (ok) {
				await notifyRoots(bot, userId, '修改资讯内容', [`内容: ${text}`]);
			}
			return;
		}

		if (state.action === 'wait_weburl') {
			const ok = /^https?:\/\//i.test(text) ? await db.setSetting('web_url', text) : false;
			await ctx.reply(ok ? '✅ WEB端网址已更新' : '❌ 地址格式错误，请以 http:// 或 https:// 开头', {
				reply_markup: backKb('settings'),
			});
			if (ok) {
				await notifyRoots(bot, userId, '修改WEB端网址', [`网址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_downloadurl') {
			const ok = /^https?:\/\//i.test(text) ? await db.setSetting('download_url', text) : false;
			await ctx.reply(ok ? '✅ 下载页网址已更新' : '❌ 地址格式错误，请以 http:// 或 https:// 开头', {
				reply_markup: backKb('settings'),
			});
			if (ok) {
				await notifyRoots(bot, userId, '修改下载页网址', [`网址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_apiurl_main') {
			const ok = /^https?:\/\//i.test(text)
				? (await db.setSetting('api_url_main', text)) && (await db.setSetting('api_url', text))
				: false;
			await ctx.reply(ok ? '✅ 主接口地址已更新' : '❌ 地址格式错误，请以 http:// 或 https:// 开头', {
				reply_markup: apiUrlKb(),
			});
			if (ok) {
				await notifyRoots(bot, userId, '修改主接口地址', [`地址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_apiurl_backup') {
			const ok = /^https?:\/\//i.test(text) ? await db.setSetting('api_url_backup', text) : false;
			await ctx.reply(ok ? '✅ 备用接口地址已更新' : '❌ 地址格式错误，请以 http:// 或 https:// 开头', {
				reply_markup: apiUrlKb(),
			});
			if (ok) {
				await notifyRoots(bot, userId, '修改备用接口地址', [`地址: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_support') {
			const ok = await db.setSetting('customer_service', text);
			await ctx.reply(ok ? '✅ 客服账号已更新' : '❌ 更新失败', { reply_markup: backKb('admin') });
			if (ok) {
				await notifyRoots(bot, userId, '修改客服账号', [`账号: ${text}`]);
			}
			return;
		}

		if (state.action === 'wait_startrecord') {
			const [roomName, outputFile] = text.split(/\s+/);
			if (!roomName) {
				await ctx.reply('❌ 请输入房间名', { reply_markup: backKb('admin') });
				return;
			}
			const result = await api.startRecording(roomName, outputFile);
			await ctx.reply(result ? `✅ 录制已开始\n房间: ${roomName}\nEgress: <code>${result.egressId}</code>` : '❌ 开始录制失败', {
				parse_mode: 'HTML',
				reply_markup: backKb('admin'),
			});
			if (result) {
				await notifyRoots(bot, userId, '开始录制', [
					`房间名: <code>${roomName}</code>`,
					`Egress: <code>${result.egressId}</code>`,
				]);
			}
			return;
		}

		if (state.action === 'wait_stoprecord') {
			const result = await api.stopRecording(text);
			await ctx.reply(result ? `✅ 录制已停止\nEgress: <code>${text}</code>` : '❌ 停止录制失败', {
				parse_mode: 'HTML',
				reply_markup: backKb('admin'),
			});
			if (result) {
				await notifyRoots(bot, userId, '停止录制', [`Egress: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_sendcodes') {
			const [countRaw, hourRaw] = text.split(/\s+/);
			const botId = state.botId;
			const count = Number(countRaw);
			const hours = Number(hourRaw);
			if (!botId || ![count, hours].every(Number.isFinite) || count < 1 || hours < 1) {
				await ctx.reply('❌ 格式错误，请按：数量 小时', { reply_markup: backKb('auth') });
				return;
			}
			await ctx.reply(`⏳ 正在生成并下发授权码，请稍候...\n\n机器人ID: ${botId}\n数量: ${count}\n有效期: ${hours} 小时`, {
				reply_markup: backKb('auth'),
			});
			const codes = await api.createInviteCodes(count, hours * 3600);
			if (codes.length === 0) {
				await ctx.reply('❌ 授权码创建失败', { reply_markup: backKb('auth') });
				return;
			}
			await db.addBotCodes(botId, codes, userId);
			await ctx.reply(`✅ 已下发 ${codes.length} 个授权码`, { reply_markup: backKb('auth') });
			await notifyRoots(bot, userId, '下发授权码', [
				`机器人ID: <code>${botId}</code>`,
				`数量: ${codes.length}`,
				`有效期: ${hours} 小时`,
			]);
			return;
		}

		if (state.action === 'wait_delcode') {
			const ok = (await api.deleteInviteCode(text)) && (await db.deleteUserCode(text));
			await ctx.reply(ok ? '✅ 授权码已删除' : '❌ 删除失败', { reply_markup: backKb('auth') });
			if (ok) {
				await notifyRoots(bot, userId, '删除授权码', [`授权码: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_codeinfo') {
			const info = await api.getInviteInfo(text);
			if (!info) {
				await ctx.reply('❌ 未找到该授权码', { reply_markup: backKb('auth') });
				return;
			}
			await ctx.reply(formatInviteInfo(info), { parse_mode: 'HTML', reply_markup: backKb('auth') });
			return;
		}

		if (state.action === 'wait_releasecode') {
			const ok = await api.releaseRoom(text);
			await ctx.reply(ok ? '✅ 房间已释放，该授权码可以重新开新房间' : '❌ 释放失败', {
				reply_markup: backKb('auth'),
			});
			if (ok) {
				await notifyRoots(bot, userId, '释放授权码房间', [`授权码: <code>${text}</code>`]);
			}
			return;
		}

		if (state.action === 'wait_botstats') {
			const id = Number(text);
			if (!Number.isFinite(id)) {
				await ctx.reply('❌ 请输入正确的机器人 ID', { reply_markup: backKb('auth') });
				return;
			}
			await showBotStats(ctx, id);
		}
	});

	return bot;
}
