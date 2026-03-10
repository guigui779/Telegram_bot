import { config } from './config';
import { initAdmins, getSaleBots } from './db';
import { createAdminBot } from './admin-bot';
import { createSaleBot } from './sales-bot';
import { startPaymentMonitor } from './payment-monitor';
import { Bot } from 'grammy';

const saleBots = new Map<number, Bot>();
let syncingSaleBots = false;
let shuttingDown = false;

async function startSaleBot(botId: number, token: string) {
  if (saleBots.has(botId)) return;
  try {
    const bot = createSaleBot(token, botId);
    await bot.init();
    // 清除旧的轮询连接，防止 409 冲突
    await bot.api.deleteWebhook({ drop_pending_updates: false });
    console.log(`✅ 出售机器人已启动: @${bot.botInfo.username} (ID: ${botId})`);
    bot.start({
      onStart: () => {},
      drop_pending_updates: false,
    });
    bot.catch((err) => {
      console.error(`❌ 出售机器人 #${botId} 轮询出错:`, err);
    });
    saleBots.set(botId, bot);
  } catch (err) {
    console.error(`❌ 出售机器人 #${botId} 启动失败:`, err);
  }
}

async function loadSaleBots() {
  const bots = await getSaleBots();
  console.log(`📦 加载 ${bots.length} 个出售机器人...`);
  for (const b of bots) {
    await startSaleBot(b.id, b.bot_token);
  }
}

async function syncSaleBots() {
  if (syncingSaleBots || shuttingDown) return;
  syncingSaleBots = true;
  try {
    const bots = await getSaleBots();
    const currentIds = new Set(bots.map((bot) => bot.id));

    for (const b of bots) {
      if (!saleBots.has(b.id)) {
        console.log(`🆕 发现新出售机器人 #${b.id}，正在启动...`);
        await startSaleBot(b.id, b.bot_token);
      }
    }

    for (const [id, bot] of saleBots) {
      if (!currentIds.has(id)) {
        console.log(`🗑 出售机器人 #${id} 已被删除，正在停止...`);
        await bot.stop();
        saleBots.delete(id);
      }
    }
  } catch (err) {
    console.error('检查出售机器人时出错，本次跳过同步:', err);
  } finally {
    syncingSaleBots = false;
  }
}

async function main() {
  console.log('🚀 云际会议 Telegram Bot 启动中...');

  // 初始化管理员
  if (config.initialAdminIds.length > 0) {
    await initAdmins(config.initialAdminIds);
    console.log(`👥 初始管理员已设置: ${config.initialAdminIds.join(', ')}`);
  }

  // 启动管理员机器人
  const adminBot = createAdminBot();
  await adminBot.init();
  // 清除旧的轮询连接，防止 409 冲突
  await adminBot.api.deleteWebhook({ drop_pending_updates: false });
  console.log(`🤖 管理员机器人已启动: @${adminBot.botInfo.username}`);

  // 加载并启动所有出售机器人
  await loadSaleBots();

  // 定期检查新添加的出售机器人（每30秒）
  setInterval(() => {
    void syncSaleBots();
  }, 30000);

  // 启动管理员机器人轮询
  adminBot.catch((err) => {
    console.error('❌ 管理员机器人轮询出错:', err);
  });
  adminBot.start({
    onStart: () => console.log('✅ 管理员机器人轮询已启动'),
    drop_pending_updates: false,
  });

  startPaymentMonitor((botId) => saleBots.get(botId));

  // 优雅退出
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('\n🛑 正在关闭...');
    await adminBot.stop();
    for (const [id, bot] of saleBots) {
      await bot.stop();
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('💥 启动失败:', err);
  process.exit(1);
});
