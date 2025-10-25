"use server";

import { db } from "@/drizzle/db";
import { sql } from "drizzle-orm";
import { getEnvConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import { PerformanceScorer } from "@/lib/scheduler/performance-scorer";
import type { MultiWindowMetrics } from "@/types/schedule";
import { getCircuitState } from "@/lib/circuit-breaker";

/**
 * 多时间窗口供应商分析数据
 */
export interface ProviderMultiWindowAnalytics {
  id: number;
  name: string;
  weight: number;
  priority: number;
  baseWeight: number | null;
  basePriority: number | null;
  metrics: MultiWindowMetrics;
  circuitState: "closed" | "open" | "half-open";
}

/**
 * 获取供应商多时间窗口性能分析数据
 *
 * @param shortTermMinutes 短期窗口（分钟）
 * @param mediumTermMinutes 中期窗口（分钟）
 * @param longTermMinutes 长期窗口（分钟）
 */
export async function getProviderMultiWindowAnalytics(
  shortTermMinutes: number = 60,
  mediumTermMinutes: number = 360,
  longTermMinutes: number = 1440
): Promise<ProviderMultiWindowAnalytics[]> {
  const timezone = getEnvConfig().TZ;

  try {
    const query = sql`
      WITH short_term_stats AS (
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
        WHERE created_at >= (NOW() AT TIME ZONE ${timezone} - ${shortTermMinutes}::integer * INTERVAL '1 minute')
          AND deleted_at IS NULL
        GROUP BY provider_id
      ),
      medium_term_stats AS (
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
        WHERE created_at >= (NOW() AT TIME ZONE ${timezone} - ${mediumTermMinutes}::integer * INTERVAL '1 minute')
          AND deleted_at IS NULL
        GROUP BY provider_id
      ),
      long_term_stats AS (
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
        WHERE created_at >= (NOW() AT TIME ZONE ${timezone} - ${longTermMinutes}::integer * INTERVAL '1 minute')
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
        -- 短期数据
        COALESCE(st.request_count, 0)::integer as short_requests,
        COALESCE(st.total_cost, 0)::numeric as short_cost,
        COALESCE(st.avg_response_time, 0)::integer as short_avg_response,
        CASE
          WHEN COALESCE(st.request_count, 0) > 0
          THEN COALESCE(st.error_count::float / st.request_count, 0)
          ELSE 0
        END as short_error_rate,
        -- 中期数据
        COALESCE(mt.request_count, 0)::integer as medium_requests,
        COALESCE(mt.total_cost, 0)::numeric as medium_cost,
        COALESCE(mt.avg_response_time, 0)::integer as medium_avg_response,
        CASE
          WHEN COALESCE(mt.request_count, 0) > 0
          THEN COALESCE(mt.error_count::float / mt.request_count, 0)
          ELSE 0
        END as medium_error_rate,
        -- 长期数据
        COALESCE(lt.request_count, 0)::integer as long_requests,
        COALESCE(lt.total_cost, 0)::numeric as long_cost,
        COALESCE(lt.avg_response_time, 0)::integer as long_avg_response,
        CASE
          WHEN COALESCE(lt.request_count, 0) > 0
          THEN COALESCE(lt.error_count::float / lt.request_count, 0)
          ELSE 0
        END as long_error_rate
      FROM providers p
      LEFT JOIN short_term_stats st ON p.id = st.provider_id
      LEFT JOIN medium_term_stats mt ON p.id = mt.provider_id
      LEFT JOIN long_term_stats lt ON p.id = lt.provider_id
      WHERE p.deleted_at IS NULL
        AND p.is_enabled = true
      ORDER BY p.priority ASC, p.weight DESC
    `;

    logger.trace("getProviderMultiWindowAnalytics: executing query", {
      shortTermMinutes,
      mediumTermMinutes,
      longTermMinutes,
    });

    const result = await db.execute(query);

    logger.trace("getProviderMultiWindowAnalytics: query completed", {
      count: Array.isArray(result) ? result.length : 0,
    });

    // 处理结果并计算加权平均
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analytics: ProviderMultiWindowAnalytics[] = (result as any[]).map((row: any) => {
      // 短期窗口数据
      const shortTerm = {
        requests: row.short_requests,
        errorRate: parseFloat(row.short_error_rate) || 0,
        avgResponseTime: row.short_avg_response,
        costUsd: row.short_cost.toString(),
      };

      // 中期窗口数据
      const mediumTerm = {
        requests: row.medium_requests,
        errorRate: parseFloat(row.medium_error_rate) || 0,
        avgResponseTime: row.medium_avg_response,
        costUsd: row.medium_cost.toString(),
      };

      // 长期窗口数据
      const longTerm = {
        requests: row.long_requests,
        errorRate: parseFloat(row.long_error_rate) || 0,
        avgResponseTime: row.long_avg_response,
        costUsd: row.long_cost.toString(),
      };

      // 计算加权平均（短期 60%，中期 30%，长期 10%）
      const totalRequests = shortTerm.requests + mediumTerm.requests + longTerm.requests;

      // 如果总请求数为 0，使用简单平均
      let weightedErrorRate: number;
      let weightedAvgResponseTime: number;

      if (totalRequests === 0) {
        weightedErrorRate = 0;
        weightedAvgResponseTime = 0;
      } else {
        // 基于请求数的动态权重
        const shortWeight = shortTerm.requests / totalRequests;
        const mediumWeight = mediumTerm.requests / totalRequests;
        const longWeight = longTerm.requests / totalRequests;

        // 应用时间衰减（短期更重要）
        const decayShort = 0.6;
        const decayMedium = 0.3;
        const decayLong = 0.1;

        const normalizedShort = shortWeight * decayShort;
        const normalizedMedium = mediumWeight * decayMedium;
        const normalizedLong = longWeight * decayLong;
        const totalWeight = normalizedShort + normalizedMedium + normalizedLong;

        if (totalWeight > 0) {
          weightedErrorRate =
            (shortTerm.errorRate * normalizedShort +
              mediumTerm.errorRate * normalizedMedium +
              longTerm.errorRate * normalizedLong) /
            totalWeight;

          weightedAvgResponseTime =
            (shortTerm.avgResponseTime * normalizedShort +
              mediumTerm.avgResponseTime * normalizedMedium +
              longTerm.avgResponseTime * normalizedLong) /
            totalWeight;
        } else {
          weightedErrorRate = 0;
          weightedAvgResponseTime = 0;
        }
      }

      // 计算性能得分
      const performanceScore = PerformanceScorer.calculateScore({
        todayRequests: totalRequests,
        todayErrorRate: weightedErrorRate,
        todayAvgResponseTime: weightedAvgResponseTime,
        todayCostUsd: "0",
        yesterdayRequests: 0,
        yesterdayErrorRate: 0,
        yesterdayAvgResponseTime: 0,
        yesterdayCostUsd: "0",
      });

      const metrics: MultiWindowMetrics = {
        shortTerm,
        mediumTerm,
        longTerm,
        weighted: {
          requests: totalRequests,
          errorRate: weightedErrorRate,
          avgResponseTime: weightedAvgResponseTime,
          performanceScore,
        },
      };

      return {
        id: row.id,
        name: row.name,
        weight: row.weight,
        priority: row.priority,
        baseWeight: row.base_weight,
        basePriority: row.base_priority,
        metrics,
        circuitState: getCircuitState(row.id),
      };
    });

    return analytics;
  } catch (error) {
    logger.error("获取供应商多时间窗口分析数据失败:", error);
    throw error;
  }
}

/**
 * 获取单个供应商的多时间窗口分析数据
 */
export async function getProviderMultiWindowAnalyticsById(
  providerId: number,
  shortTermMinutes: number = 60,
  mediumTermMinutes: number = 360,
  longTermMinutes: number = 1440
): Promise<ProviderMultiWindowAnalytics | null> {
  const allAnalytics = await getProviderMultiWindowAnalytics(
    shortTermMinutes,
    mediumTermMinutes,
    longTermMinutes
  );

  return allAnalytics.find((a) => a.id === providerId) || null;
}
