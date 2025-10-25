"use server";

import { db } from "@/drizzle/db";
import { sql } from "drizzle-orm";
import { getEnvConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { PerformanceScorer } from "@/lib/scheduler/performance-scorer";
import type { ProviderAnalytics, AnalyticsSummary } from "@/types/schedule";
import { getCircuitState } from "@/lib/circuit-breaker";

/**
 * 获取供应商性能分析数据（昨日 vs 今日）
 */
export async function getProviderAnalytics(): Promise<ProviderAnalytics[]> {
  const timezone = getEnvConfig().TZ;

  try {
    const query = sql`
      WITH today_stats AS (
        SELECT
          provider_id,
          COUNT(*) as request_count,
          COALESCE(SUM(cost_usd), 0) as total_cost,
          COALESCE(AVG(duration_ms), 0) as avg_response_time,
          SUM(
            CASE WHEN status_code >= 400 OR error_message IS NOT NULL
            THEN 1 ELSE 0 END
          ) as error_count
        FROM message_request
        WHERE created_at >= CURRENT_DATE AT TIME ZONE ${timezone}
          AND deleted_at IS NULL
        GROUP BY provider_id
      ),
      yesterday_stats AS (
        SELECT
          provider_id,
          COUNT(*) as request_count,
          COALESCE(SUM(cost_usd), 0) as total_cost,
          COALESCE(AVG(duration_ms), 0) as avg_response_time,
          SUM(
            CASE WHEN status_code >= 400 OR error_message IS NOT NULL
            THEN 1 ELSE 0 END
          ) as error_count
        FROM message_request
        WHERE created_at >= (CURRENT_DATE - INTERVAL '1 day') AT TIME ZONE ${timezone}
          AND created_at < CURRENT_DATE AT TIME ZONE ${timezone}
          AND deleted_at IS NULL
        GROUP BY provider_id
      )
      SELECT
        p.id,
        p.name,
        p.weight,
        p.priority,
        p.base_weight,
        p.base_priority,
        -- 今日数据
        COALESCE(t.request_count, 0)::integer as today_requests,
        COALESCE(t.total_cost, 0)::numeric as today_cost,
        COALESCE(t.avg_response_time, 0)::integer as today_avg_response,
        CASE
          WHEN COALESCE(t.request_count, 0) > 0
          THEN COALESCE(t.error_count::float / t.request_count, 0)
          ELSE 0
        END as today_error_rate,
        -- 昨日数据
        COALESCE(y.request_count, 0)::integer as yesterday_requests,
        COALESCE(y.total_cost, 0)::numeric as yesterday_cost,
        COALESCE(y.avg_response_time, 0)::integer as yesterday_avg_response,
        CASE
          WHEN COALESCE(y.request_count, 0) > 0
          THEN COALESCE(y.error_count::float / y.request_count, 0)
          ELSE 0
        END as yesterday_error_rate
      FROM providers p
      LEFT JOIN today_stats t ON p.id = t.provider_id
      LEFT JOIN yesterday_stats y ON p.id = y.provider_id
      WHERE p.deleted_at IS NULL
        AND p.is_enabled = true
      ORDER BY p.priority ASC, p.weight DESC
    `;

    logger.trace("getProviderAnalytics: executing query");
    const result = await db.execute(query);
    logger.trace("getProviderAnalytics: query completed", {
      count: Array.isArray(result) ? result.length : 0,
    });

    // 计算性能得分和置信度
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analytics: ProviderAnalytics[] = (result as any[]).map((row: any) => {
      const metrics = {
        todayRequests: row.today_requests,
        todayCostUsd: row.today_cost.toString(),
        todayAvgResponseTime: row.today_avg_response,
        todayErrorRate: parseFloat(row.today_error_rate) || 0,
        yesterdayRequests: row.yesterday_requests,
        yesterdayCostUsd: row.yesterday_cost.toString(),
        yesterdayAvgResponseTime: row.yesterday_avg_response,
        yesterdayErrorRate: parseFloat(row.yesterday_error_rate) || 0,
      };

      const performanceScore = PerformanceScorer.calculateScore(metrics);
      const confidence = PerformanceScorer.calculateConfidence(
        row.today_requests,
        10 // 默认最小样本数
      );

      return {
        id: row.id,
        name: row.name,
        weight: row.weight,
        priority: row.priority,
        baseWeight: row.base_weight,
        basePriority: row.base_priority,
        ...metrics,
        performanceScore,
        confidence,
        circuitState: getCircuitState(row.id),
        isAdjusted:
          (row.base_weight !== null && row.weight !== row.base_weight) ||
          (row.base_priority !== null && row.priority !== row.base_priority),
      };
    });

    return analytics;
  } catch (error) {
    logger.trace("getProviderAnalytics: error", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    logger.error("获取供应商分析数据失败:", error);
    throw error;
  }
}

/**
 * 获取分析摘要
 */
export async function getAnalyticsSummary(
  analytics: ProviderAnalytics[]
): Promise<AnalyticsSummary> {
  if (analytics.length === 0) {
    return {
      totalRequests: 0,
      avgErrorRate: 0,
      avgResponseTime: 0,
      avgPerformanceScore: 0,
    };
  }

  const totalRequests = analytics.reduce(
    (sum, a) => sum + a.todayRequests,
    0
  );
  const avgErrorRate =
    analytics.reduce((sum, a) => sum + a.todayErrorRate, 0) /
    analytics.length;
  const avgResponseTime =
    analytics.reduce((sum, a) => sum + a.todayAvgResponseTime, 0) /
    analytics.length;
  const avgPerformanceScore =
    analytics.reduce((sum, a) => sum + a.performanceScore, 0) /
    analytics.length;

  return {
    totalRequests,
    avgErrorRate,
    avgResponseTime,
    avgPerformanceScore,
  };
}
