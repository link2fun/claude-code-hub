"use server";

import { db } from "@/drizzle/db";
import { logger } from "@/lib/logger";
import { systemSettings } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import type { SystemSettings, UpdateSystemSettingsInput } from "@/types/system-config";
import { toSystemSettings } from "./_shared/transformers";

const DEFAULT_SITE_TITLE = "Claude Code Hub";

function isTableMissingError(error: unknown, depth = 0): boolean {
  if (!error || depth > 5) {
    return false;
  }

  if (typeof error === "string") {
    const normalized = error.toLowerCase();
    return (
      normalized.includes("42p01") ||
      (normalized.includes("system_settings") &&
        (normalized.includes("does not exist") ||
          normalized.includes("doesn't exist") ||
          normalized.includes("找不到")))
    );
  }

  if (typeof error === "object") {
    const err = error as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
      errors?: unknown;
      originalError?: unknown;
    };

    if (typeof err.code === "string" && err.code.toUpperCase() === "42P01") {
      return true;
    }

    if (typeof err.message === "string" && isTableMissingError(err.message, depth + 1)) {
      return true;
    }

    if ("cause" in err && err.cause && isTableMissingError(err.cause, depth + 1)) {
      return true;
    }

    if (Array.isArray(err.errors)) {
      return err.errors.some((item) => isTableMissingError(item, depth + 1));
    }

    if (err.originalError && isTableMissingError(err.originalError, depth + 1)) {
      return true;
    }

    // 最后尝试字符串化整个对象
    const stringified = (() => {
      try {
        return String(error);
      } catch {
        return undefined;
      }
    })();

    if (stringified) {
      return isTableMissingError(stringified, depth + 1);
    }
  }

  return false;
}

function createFallbackSettings(): SystemSettings {
  const now = new Date();
  return {
    id: 0,
    siteTitle: DEFAULT_SITE_TITLE,
    allowGlobalUsageView: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 获取系统设置，如果不存在则创建默认记录
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);

    if (settings) {
      return toSystemSettings(settings);
    }

    const [created] = await db
      .insert(systemSettings)
      .values({
        siteTitle: DEFAULT_SITE_TITLE,
        allowGlobalUsageView: false,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      return toSystemSettings(created);
    }

    // 如果并发导致没有返回，重新查询一次
    const [fallback] = await db.select().from(systemSettings).limit(1);

    if (!fallback) {
      throw new Error("Failed to initialize system settings");
    }

    return toSystemSettings(fallback);
  } catch (error) {
    if (isTableMissingError(error)) {
      logger.warn("system_settings 表不存在，返回默认配置。请运行数据库迁移。", { error });
      return createFallbackSettings();
    }
    throw error;
  }
}

/**
 * 更新系统设置
 */
export async function updateSystemSettings(
  payload: UpdateSystemSettingsInput
): Promise<SystemSettings> {
  const current = await getSystemSettings();

  try {
    // 构建更新对象（只包含传入的字段）
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    // 基础配置
    if (payload.siteTitle !== undefined) {
      updateData.siteTitle = payload.siteTitle;
    }
    if (payload.allowGlobalUsageView !== undefined) {
      updateData.allowGlobalUsageView = payload.allowGlobalUsageView;
    }

    // 实时调度配置
    if (payload.enableRealtimeSchedule !== undefined) {
      updateData.enableRealtimeSchedule = payload.enableRealtimeSchedule;
    }
    if (payload.scheduleIntervalSeconds !== undefined) {
      updateData.scheduleIntervalSeconds = payload.scheduleIntervalSeconds;
    }
    if (payload.explorationRate !== undefined) {
      updateData.explorationRate = payload.explorationRate;
    }
    if (payload.circuitRecoveryWeightPercent !== undefined) {
      updateData.circuitRecoveryWeightPercent = payload.circuitRecoveryWeightPercent;
    }
    if (payload.circuitRecoveryObservationCount !== undefined) {
      updateData.circuitRecoveryObservationCount = payload.circuitRecoveryObservationCount;
    }
    if (payload.maxWeightAdjustmentPercent !== undefined) {
      updateData.maxWeightAdjustmentPercent = payload.maxWeightAdjustmentPercent;
    }
    if (payload.shortTermWindowMinutes !== undefined) {
      updateData.shortTermWindowMinutes = payload.shortTermWindowMinutes;
    }
    if (payload.mediumTermWindowMinutes !== undefined) {
      updateData.mediumTermWindowMinutes = payload.mediumTermWindowMinutes;
    }
    if (payload.longTermWindowMinutes !== undefined) {
      updateData.longTermWindowMinutes = payload.longTermWindowMinutes;
    }

    const [updated] = await db
      .update(systemSettings)
      .set(updateData)
      .where(eq(systemSettings.id, current.id))
      .returning();

    if (!updated) {
      throw new Error("更新系统设置失败");
    }

    return toSystemSettings(updated);
  } catch (error) {
    if (isTableMissingError(error)) {
      throw new Error("系统设置数据表不存在，请先执行数据库迁移。");
    }
    throw error;
  }
}
