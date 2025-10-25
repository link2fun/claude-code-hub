"use server";

import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import {
  getProviderAnalytics as getProviderAnalyticsFromDB,
  getAnalyticsSummary,
} from "@/repository/provider-analytics";
import {
  getScheduleLogs,
  getScheduleLogById,
  countScheduleLogs,
} from "@/repository/schedule-logs";
import { AutoScheduler } from "@/lib/scheduler/auto-scheduler";
import { updateProvider } from "@/repository/provider";
import type { ActionResult } from "./types";
import type {
  ProviderAnalytics,
  AnalyticsSummary,
  ScheduleDecision,
  ScheduleSummary,
  ScheduleLog,
} from "@/types/schedule";

/**
 * 获取供应商性能分析数据
 */
export async function getProvidersAnalytics(): Promise<
  ActionResult<{
    analytics: ProviderAnalytics[];
    summary: AnalyticsSummary;
  }>
> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const analytics = await getProviderAnalyticsFromDB();
    const summary = await getAnalyticsSummary(analytics);

    return {
      ok: true,
      data: { analytics, summary },
    };
  } catch (error) {
    logger.error("获取供应商分析数据失败:", error);
    const message =
      error instanceof Error ? error.message : "获取供应商分析数据失败";
    return { ok: false, error: message };
  }
}

/**
 * 预览自动调度方案（dry-run 模式）
 */
export async function previewAutoSchedule(): Promise<
  ActionResult<{
    decisions: ScheduleDecision[];
    summary: ScheduleSummary;
  }>
> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const result = await AutoScheduler.execute(
      true, // dry-run
      session.user.name
    );

    if (!result.ok) {
      return { ok: false, error: result.error || "生成调度方案失败" };
    }

    return {
      ok: true,
      data: {
        decisions: result.decisions,
        summary: result.summary,
      },
    };
  } catch (error) {
    logger.error("预览调度方案失败:", error);
    const message =
      error instanceof Error ? error.message : "预览调度方案失败";
    return { ok: false, error: message };
  }
}

/**
 * 执行自动调度
 */
export async function executeAutoSchedule(): Promise<
  ActionResult<{
    logId: number;
    affectedCount: number;
  }>
> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const result = await AutoScheduler.execute(
      false, // 实际执行
      session.user.name
    );

    if (!result.ok) {
      return { ok: false, error: result.error || "执行调度失败" };
    }

    // 刷新供应商页面缓存
    revalidatePath("/settings/providers");

    return {
      ok: true,
      data: {
        logId: result.logId!,
        affectedCount: result.affectedProviders,
      },
    };
  } catch (error) {
    logger.error("执行调度失败:", error);
    const message = error instanceof Error ? error.message : "执行调度失败";
    return { ok: false, error: message };
  }
}

/**
 * 获取调度历史记录
 */
export async function getScheduleHistory(
  page: number = 1,
  pageSize: number = 10
): Promise<
  ActionResult<{
    logs: ScheduleLog[];
    total: number;
    page: number;
    pageSize: number;
  }>
> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const offset = (page - 1) * pageSize;
    const [logs, total] = await Promise.all([
      getScheduleLogs(pageSize, offset),
      countScheduleLogs(),
    ]);

    return {
      ok: true,
      data: {
        logs,
        total,
        page,
        pageSize,
      },
    };
  } catch (error) {
    logger.error("获取调度历史失败:", error);
    const message =
      error instanceof Error ? error.message : "获取调度历史失败";
    return { ok: false, error: message };
  }
}

/**
 * 获取调度日志详情
 */
export async function getScheduleLogDetail(
  logId: number
): Promise<ActionResult<ScheduleLog>> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    const log = await getScheduleLogById(logId);
    if (!log) {
      return { ok: false, error: "调度日志不存在" };
    }

    return {
      ok: true,
      data: log,
    };
  } catch (error) {
    logger.error("获取调度日志详情失败:", error);
    const message =
      error instanceof Error ? error.message : "获取调度日志详情失败";
    return { ok: false, error: message };
  }
}

/**
 * 手动重置供应商到基准值
 */
export async function resetProviderToBaseline(
  providerId: number
): Promise<ActionResult> {
  try {
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      return { ok: false, error: "无权限执行此操作" };
    }

    // 先获取供应商当前数据（包含基准值）
    const analytics = await getProviderAnalyticsFromDB();
    const provider = analytics.find((a) => a.id === providerId);

    if (!provider) {
      return { ok: false, error: "供应商不存在" };
    }

    if (
      provider.baseWeight === null ||
      provider.basePriority === null
    ) {
      return { ok: false, error: "供应商没有设置基准值" };
    }

    // 重置到基准值
    await updateProvider(providerId, {
      weight: provider.baseWeight,
      priority: provider.basePriority,
    });

    revalidatePath("/settings/providers");

    return { ok: true };
  } catch (error) {
    logger.error("重置供应商失败:", error);
    const message = error instanceof Error ? error.message : "重置供应商失败";
    return { ok: false, error: message };
  }
}
