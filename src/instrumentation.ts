/**
 * Next.js Instrumentation Hook
 * 在服务器启动时自动执行数据库迁移
 */

import { logger } from "@/lib/logger";

export async function register() {
  // 仅在服务器端执行
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 仅在生产环境自动迁移
    // 开发环境建议手动运行 pnpm run db:migrate
    if (process.env.NODE_ENV === "production" && process.env.AUTO_MIGRATE !== "false") {
      const { checkDatabaseConnection, runMigrations } = await import("@/lib/migrate");

      logger.info("Initializing Claude Code Hub");

      // 等待数据库连接
      const isConnected = await checkDatabaseConnection();
      if (!isConnected) {
        logger.error("Cannot start application without database connection");
        process.exit(1);
      }

      // 执行迁移
      await runMigrations();

      // 初始化价格表（如果数据库为空）
      const { ensurePriceTable } = await import("@/lib/price-sync/seed-initializer");
      await ensurePriceTable();

      // 初始化后台调度器
      // ⚠️ 注意：在 instrumentation.ts 中初始化后台任务存在潜在问题：
      // 1. Next.js 的 instrumentation.ts 在每个 worker 进程中都会执行
      // 2. 如果数据库迁移失败，调度器仍然会启动
      // 3. 可能导致多个调度器实例同时运行
      // TODO: 未来考虑使用 Redis 分布式锁或独立进程管理调度器
      const { initBackgroundScheduler } = await import("@/lib/scheduler/background-scheduler");
      await initBackgroundScheduler();

      logger.info("Application ready");
    }
  }
}
