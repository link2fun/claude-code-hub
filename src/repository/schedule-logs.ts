"use server";

import { db } from "@/drizzle/db";
import { providerScheduleLogs } from "@/drizzle/schema";
import { desc, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import type { ScheduleLog, ScheduleDecision, ScheduleSummary } from "@/types/schedule";

/**
 * 创建调度日志
 */
export async function createScheduleLog(data: {
  execution_time: Date;
  executed_by: string;
  dry_run: boolean;
  total_providers: number;
  analyzed_providers: number;
  affected_providers: number;
  decisions: ScheduleDecision[];
  summary: ScheduleSummary;
}): Promise<number> {
  try {
    const [log] = await db
      .insert(providerScheduleLogs)
      .values({
        executionTime: data.execution_time,
        executedBy: data.executed_by,
        dryRun: data.dry_run,
        totalProviders: data.total_providers,
        analyzedProviders: data.analyzed_providers,
        affectedProviders: data.affected_providers,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        decisions: data.decisions as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        summary: data.summary as any,
      })
      .returning({ id: providerScheduleLogs.id });

    logger.info("调度日志已创建", {
      logId: log.id,
      executedBy: data.executed_by,
      affectedProviders: data.affected_providers,
    });

    return log.id;
  } catch (error) {
    logger.error("创建调度日志失败:", error);
    throw error;
  }
}

/**
 * 获取调度日志列表
 */
export async function getScheduleLogs(
  limit: number = 10,
  offset: number = 0
): Promise<ScheduleLog[]> {
  try {
    const logs = await db
      .select()
      .from(providerScheduleLogs)
      .orderBy(desc(providerScheduleLogs.executionTime))
      .limit(limit)
      .offset(offset);

    return logs.map((log) => ({
      id: log.id,
      executionTime: log.executionTime,
      executedBy: log.executedBy,
      dryRun: log.dryRun,
      totalProviders: log.totalProviders,
      analyzedProviders: log.analyzedProviders,
      affectedProviders: log.affectedProviders,
      decisions: log.decisions as unknown as ScheduleDecision[],
      summary: log.summary as unknown as ScheduleSummary,
      createdAt: log.createdAt!,
    }));
  } catch (error) {
    logger.error("获取调度日志列表失败:", error);
    throw error;
  }
}

/**
 * 获取单条调度日志详情
 */
export async function getScheduleLogById(
  id: number
): Promise<ScheduleLog | null> {
  try {
    const [log] = await db
      .select()
      .from(providerScheduleLogs)
      .where(eq(providerScheduleLogs.id, id));

    if (!log) {
      return null;
    }

    return {
      id: log.id,
      executionTime: log.executionTime,
      executedBy: log.executedBy,
      dryRun: log.dryRun,
      totalProviders: log.totalProviders,
      analyzedProviders: log.analyzedProviders,
      affectedProviders: log.affectedProviders,
      decisions: log.decisions as unknown as ScheduleDecision[],
      summary: log.summary as unknown as ScheduleSummary,
      createdAt: log.createdAt!,
    };
  } catch (error) {
    logger.error("获取调度日志详情失败:", error);
    throw error;
  }
}

/**
 * 统计调度日志总数
 */
export async function countScheduleLogs(): Promise<number> {
  try {
    const result = await db
      .select({ count: providerScheduleLogs.id })
      .from(providerScheduleLogs);

    return result.length;
  } catch (error) {
    logger.error("统计调度日志总数失败:", error);
    return 0;
  }
}
