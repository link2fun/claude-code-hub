"use server";

import { logger } from "@/lib/logger";
import { backgroundScheduler } from "@/lib/scheduler/background-scheduler";
import { getSystemSettings, updateSystemSettings } from "@/repository/system-config";
import { resetAllProvidersToBaseline } from "@/repository/provider";
import type { RealtimeScheduleStatus } from "@/types/schedule";
import type { UpdateRealtimeScheduleConfigInput } from "@/types/system-config";

/**
 * 获取实时调度状态
 */
export async function getRealtimeScheduleStatus(): Promise<{
  ok: boolean;
  data?: RealtimeScheduleStatus;
  error?: string;
}> {
  try {
    const status = backgroundScheduler.getStatus();
    const settings = await getSystemSettings();

    return {
      ok: true,
      data: {
        isRunning: status.isRunning,
        lastExecutionTime: status.lastExecutionTime,
        nextExecutionTime: status.nextExecutionTime,
        totalExecutions: status.totalExecutions,
        lastError: status.lastError,
        config: {
          enableRealtimeSchedule: settings.enableRealtimeSchedule ?? false,
          scheduleIntervalSeconds: settings.scheduleIntervalSeconds ?? 30,
          explorationRate: settings.explorationRate ?? 15,
          circuitRecoveryWeightPercent: settings.circuitRecoveryWeightPercent ?? 30,
          circuitRecoveryObservationCount: settings.circuitRecoveryObservationCount ?? 10,
          maxWeightAdjustmentPercent: settings.maxWeightAdjustmentPercent ?? 10,
          shortTermWindowMinutes: settings.shortTermWindowMinutes ?? 60,
          mediumTermWindowMinutes: settings.mediumTermWindowMinutes ?? 360,
          longTermWindowMinutes: settings.longTermWindowMinutes ?? 1440,
        },
      },
    };
  } catch (error) {
    logger.error("[RealtimeScheduleAPI] Failed to get status", { error });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to get status",
    };
  }
}

/**
 * 切换实时调度开关
 */
export async function toggleRealtimeSchedule(enabled: boolean): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    logger.info("[RealtimeScheduleAPI] Toggling realtime schedule", { enabled });

    // 更新系统配置
    await updateSystemSettings({
      enableRealtimeSchedule: enabled,
    });

    if (enabled) {
      // 开启时：重置所有供应商到基准，然后启动调度器
      const affectedCount = await resetAllProvidersToBaseline();
      logger.info("[RealtimeScheduleAPI] Reset providers to baseline", { affectedCount });

      await backgroundScheduler.restart();

      return {
        ok: true,
        message: `实时调度已开启，已重置 ${affectedCount} 个供应商到基准配置`,
      };
    } else {
      // 关闭时：停止调度器
      backgroundScheduler.stop();

      return {
        ok: true,
        message: "实时调度已关闭",
      };
    }
  } catch (error) {
    logger.error("[RealtimeScheduleAPI] Failed to toggle schedule", { error });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to toggle schedule",
    };
  }
}

/**
 * 更新实时调度配置
 */
export async function updateRealtimeScheduleConfig(
  config: UpdateRealtimeScheduleConfigInput
): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    logger.info("[RealtimeScheduleAPI] Updating config", { config });

    // 更新系统配置
    await updateSystemSettings({
      ...(config.scheduleIntervalSeconds !== undefined && {
        scheduleIntervalSeconds: config.scheduleIntervalSeconds,
      }),
      ...(config.explorationRate !== undefined && {
        explorationRate: config.explorationRate,
      }),
      ...(config.circuitRecoveryWeightPercent !== undefined && {
        circuitRecoveryWeightPercent: config.circuitRecoveryWeightPercent,
      }),
      ...(config.circuitRecoveryObservationCount !== undefined && {
        circuitRecoveryObservationCount: config.circuitRecoveryObservationCount,
      }),
      ...(config.maxWeightAdjustmentPercent !== undefined && {
        maxWeightAdjustmentPercent: config.maxWeightAdjustmentPercent,
      }),
      ...(config.shortTermWindowMinutes !== undefined && {
        shortTermWindowMinutes: config.shortTermWindowMinutes,
      }),
      ...(config.mediumTermWindowMinutes !== undefined && {
        mediumTermWindowMinutes: config.mediumTermWindowMinutes,
      }),
      ...(config.longTermWindowMinutes !== undefined && {
        longTermWindowMinutes: config.longTermWindowMinutes,
      }),
    });

    // 如果调度器正在运行，重启以应用新配置
    const status = backgroundScheduler.getStatus();
    if (status.isRunning) {
      await backgroundScheduler.restart();
    }

    return {
      ok: true,
      message: "配置已更新",
    };
  } catch (error) {
    logger.error("[RealtimeScheduleAPI] Failed to update config", { error });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update config",
    };
  }
}

/**
 * 手动触发一次调度（用于测试）
 */
export async function triggerManualSchedule(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    logger.info("[RealtimeScheduleAPI] Manual trigger requested");

    const { RealtimeDecisionEngine } = await import("@/lib/scheduler/realtime-decision-engine");
    const settings = await getSystemSettings();

    const result = await RealtimeDecisionEngine.execute(
      {
        explorationRate: settings.explorationRate ?? 15,
        minSampleSize: settings.minSampleSize ?? 10,
        circuitRecoveryWeightPercent: settings.circuitRecoveryWeightPercent ?? 30,
        maxWeightAdjustmentPercent: settings.maxWeightAdjustmentPercent ?? 10,
      },
      false
    );

    if (result.ok) {
      return {
        ok: true,
        message: `调度成功，影响 ${result.affectedProviders} 个供应商`,
      };
    } else {
      return {
        ok: false,
        error: result.error ?? "调度失败",
      };
    }
  } catch (error) {
    logger.error("[RealtimeScheduleAPI] Manual trigger failed", { error });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Manual trigger failed",
    };
  }
}
