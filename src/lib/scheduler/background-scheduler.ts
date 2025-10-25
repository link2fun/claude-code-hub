/**
 * 后台调度器服务
 *
 * 职责：
 * 1. 每 N 秒自动执行一次实时调度
 * 2. 从系统配置读取调度参数
 * 3. 处理错误和自动重试
 * 4. 支持优雅关闭
 */

import { logger } from "@/lib/logger";
import { RealtimeDecisionEngine } from "./realtime-decision-engine";
import { getSystemSettings } from "@/repository/system-config";
import type { MABConfig } from "./mab-algorithm";

/**
 * 后台调度器状态
 */
interface SchedulerState {
  isRunning: boolean;
  intervalId: NodeJS.Timeout | null;
  lastExecutionTime: Date | null;
  nextExecutionTime: Date | null;
  totalExecutions: number;
  lastError: string | null;
  config: {
    intervalSeconds: number;
    explorationRate: number;
    enabled: boolean;
  };
}

/**
 * 后台调度器单例
 */
class BackgroundScheduler {
  private state: SchedulerState = {
    isRunning: false,
    intervalId: null,
    lastExecutionTime: null,
    nextExecutionTime: null,
    totalExecutions: 0,
    lastError: null,
    config: {
      intervalSeconds: 30,
      explorationRate: 15,
      enabled: false,
    },
  };

  /**
   * 启动调度器
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.warn("[BackgroundScheduler] Already running");
      return;
    }

    try {
      // 读取系统配置
      const settings = await getSystemSettings();

      if (!settings.enableRealtimeSchedule) {
        logger.info("[BackgroundScheduler] Realtime schedule is disabled in system settings");
        return;
      }

      const intervalSeconds = settings.scheduleIntervalSeconds ?? 30;
      const explorationRate = settings.explorationRate ?? 15;

      this.state.config = {
        intervalSeconds,
        explorationRate,
        enabled: true,
      };

      logger.info("[BackgroundScheduler] Starting", {
        intervalSeconds,
        explorationRate,
      });

      // ✅ 修复竞态条件：先设置状态标志
      this.state.isRunning = true;
      this.state.nextExecutionTime = new Date(Date.now() + intervalSeconds * 1000);

      // 立即执行一次
      await this.executeSchedule();

      // ✅ 修复 setInterval 重入：使用 setTimeout 递归调度
      this.scheduleNext(intervalSeconds);

      logger.info("[BackgroundScheduler] Started successfully");
    } catch (error) {
      logger.error("[BackgroundScheduler] Failed to start", { error });
      // 启动失败时重置状态
      this.state.isRunning = false;
      this.state.nextExecutionTime = null;
      throw error;
    }
  }

  /**
   * 调度下一次执行（使用 setTimeout 避免重入）
   */
  private scheduleNext(intervalSeconds: number): void {
    if (!this.state.isRunning) {
      logger.debug("[BackgroundScheduler] Not running, skipping scheduleNext");
      return;
    }

    this.state.intervalId = setTimeout(async () => {
      await this.executeSchedule();

      // 重新读取配置（支持动态更新间隔）
      const settings = await getSystemSettings();
      const newIntervalSeconds = settings.scheduleIntervalSeconds ?? 30;

      // 递归调度下一次
      if (this.state.isRunning) {
        this.scheduleNext(newIntervalSeconds);
      }
    }, intervalSeconds * 1000) as unknown as NodeJS.Timeout;
  }

  /**
   * 停止调度器
   */
  stop(): void {
    if (!this.state.isRunning) {
      logger.warn("[BackgroundScheduler] Not running");
      return;
    }

    logger.info("[BackgroundScheduler] Stopping");

    if (this.state.intervalId) {
      clearTimeout(this.state.intervalId);  // ✅ 使用 clearTimeout 替代 clearInterval
      this.state.intervalId = null;
    }

    this.state.isRunning = false;
    this.state.nextExecutionTime = null;

    logger.info("[BackgroundScheduler] Stopped");
  }

  /**
   * 重启调度器（重新读取配置）
   */
  async restart(): Promise<void> {
    logger.info("[BackgroundScheduler] Restarting");
    this.stop();
    await this.start();
  }

  /**
   * 获取调度器状态
   */
  getStatus(): SchedulerState {
    return { ...this.state };
  }

  /**
   * 执行调度
   */
  private async executeSchedule(): Promise<void> {
    try {
      logger.debug("[BackgroundScheduler] Executing schedule");

      // 重新读取配置（支持动态更新）
      const settings = await getSystemSettings();

      if (!settings.enableRealtimeSchedule) {
        logger.info("[BackgroundScheduler] Realtime schedule disabled, stopping");
        this.stop();
        return;
      }

      // 构建 MAB 配置
      const mabConfig: MABConfig = {
        explorationRate: settings.explorationRate ?? 15,
        minSampleSize: settings.minSampleSize ?? 10,
        circuitRecoveryWeightPercent: settings.circuitRecoveryWeightPercent ?? 30,
        maxWeightAdjustmentPercent: settings.maxWeightAdjustmentPercent ?? 10,
      };

      // 执行调度
      const result = await RealtimeDecisionEngine.execute(mabConfig, false);

      // 更新状态
      this.state.lastExecutionTime = result.executionTime;
      this.state.totalExecutions++;
      this.state.nextExecutionTime = new Date(
        Date.now() + (settings.scheduleIntervalSeconds ?? 30) * 1000
      );

      if (result.ok) {
        this.state.lastError = null;
        logger.debug("[BackgroundScheduler] Schedule executed successfully", {
          totalProviders: result.totalProviders,
          affectedProviders: result.affectedProviders,
        });
      } else {
        this.state.lastError = result.error ?? "Unknown error";
        logger.error("[BackgroundScheduler] Schedule execution failed", {
          error: result.error,
        });
      }
    } catch (error) {
      this.state.lastError = error instanceof Error ? error.message : "Unknown error";
      logger.error("[BackgroundScheduler] Schedule execution threw error", { error });
    }
  }
}

// 导出单例实例
export const backgroundScheduler = new BackgroundScheduler();

/**
 * 初始化后台调度器（在应用启动时调用）
 */
export async function initBackgroundScheduler(): Promise<void> {
  // 仅在服务端运行
  if (typeof window !== "undefined") {
    return;
  }

  try {
    logger.info("[BackgroundScheduler] Initializing");
    await backgroundScheduler.start();
  } catch (error) {
    logger.error("[BackgroundScheduler] Initialization failed", { error });
    // 不抛出错误，避免影响应用启动
  }
}

/**
 * 优雅关闭（在应用关闭时调用）
 */
export function shutdownBackgroundScheduler(): void {
  logger.info("[BackgroundScheduler] Shutting down");
  backgroundScheduler.stop();
}

// 监听进程信号，优雅关闭
if (typeof process !== "undefined") {
  process.on("SIGTERM", () => {
    logger.info("[BackgroundScheduler] Received SIGTERM");
    shutdownBackgroundScheduler();
  });

  process.on("SIGINT", () => {
    logger.info("[BackgroundScheduler] Received SIGINT");
    shutdownBackgroundScheduler();
  });
}
