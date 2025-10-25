/**
 * 实时调度决策引擎
 *
 * 职责：
 * 1. 获取多时间窗口性能数据
 * 2. 使用 MAB 算法生成调度决策
 * 3. 更新数据库中的 weight 和 priority
 * 4. 记录完整的决策日志
 *
 * 重要：不侵入现有的 ProxyProviderResolver，仅通过修改数据库来影响流量分配
 */

import { logger } from "@/lib/logger";
import { MABScheduler, type MABConfig } from "./mab-algorithm";
import { getProviderMultiWindowAnalytics } from "@/repository/provider-analytics-multiwindow";
import { updateProvider } from "@/repository/provider";
import { createScheduleLog } from "@/repository/schedule-logs";
import { getSystemSettings } from "@/repository/system-config";
import type { MABDecision } from "@/types/schedule";
import type { ScheduleDecision, ScheduleSummary } from "@/types/schedule";

export interface RealtimeScheduleResult {
  ok: boolean;
  executionTime: Date;
  totalProviders: number;
  affectedProviders: number;
  decisions: ScheduleDecision[];
  summary: ScheduleSummary;
  error?: string;
}

/**
 * 实时调度决策引擎
 */
export class RealtimeDecisionEngine {
  /**
   * 执行实时调度
   *
   * @param config MAB 配置
   * @param dryRun 是否为预演模式（不实际修改数据库）
   */
  static async execute(config: MABConfig, dryRun: boolean = false): Promise<RealtimeScheduleResult> {
    const executionTime = new Date();

    try {
      logger.info("[RealtimeScheduler] Starting execution", {
        dryRun,
        config,
      });

      // 1. 获取系统配置（读取时间窗口参数）
      const settings = await getSystemSettings();

      // 2. 获取多时间窗口性能数据（✅ 修复：从配置读取，不再硬编码）
      const providers = await getProviderMultiWindowAnalytics(
        settings.shortTermWindowMinutes ?? 60,  // 短期窗口
        settings.mediumTermWindowMinutes ?? 360, // 中期窗口
        settings.longTermWindowMinutes ?? 1440  // 长期窗口
      );

      if (providers.length === 0) {
        logger.warn("[RealtimeScheduler] No enabled providers found");
        return {
          ok: true,
          executionTime,
          totalProviders: 0,
          affectedProviders: 0,
          decisions: [],
          summary: {
            promoted: 0,
            demoted: 0,
            maintained: 0,
            recovered: 0,
            circuitOpen: 0,
          },
        };
      }

      // 3. 使用 MAB 算法生成决策
      const mabDecisions = MABScheduler.generateDecisions(providers, config);

      // 4. 转换为标准调度决策格式
      const decisions = this.convertToScheduleDecisions(mabDecisions);

      // 5. 计算汇总信息
      const summary = this.calculateSummary(decisions);

      // 6. 应用决策（更新数据库）
      if (!dryRun) {
        await this.applyDecisions(decisions);
      }

      // 7. 记录日志
      await this.logExecution(decisions, summary, executionTime, dryRun);

      logger.info("[RealtimeScheduler] Execution completed", {
        dryRun,
        totalProviders: providers.length,
        affectedProviders: summary.promoted + summary.demoted + summary.recovered,
        summary,
      });

      return {
        ok: true,
        executionTime,
        totalProviders: providers.length,
        affectedProviders: summary.promoted + summary.demoted + summary.recovered,
        decisions,
        summary,
      };
    } catch (error) {
      logger.error("[RealtimeScheduler] Execution failed", { error });
      return {
        ok: false,
        executionTime,
        totalProviders: 0,
        affectedProviders: 0,
        decisions: [],
        summary: {
          promoted: 0,
          demoted: 0,
          maintained: 0,
          recovered: 0,
          circuitOpen: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 转换 MAB 决策为标准调度决策格式
   */
  private static convertToScheduleDecisions(mabDecisions: MABDecision[]): ScheduleDecision[] {
    return mabDecisions.map((mab) => {
      // 确定动作类型
      let action: ScheduleDecision["action"];
      const weightChange = mab.suggestedWeight - mab.currentWeight;

      if (mab.metrics.weighted.requests === 0 || mab.isExploration) {
        action = "explore";
      } else if (weightChange > 0) {
        action = "promote";
      } else if (weightChange < 0) {
        action = "demote";
      } else if (mab.currentWeight < (mab.metrics.weighted.requests > 0 ? mab.currentWeight : 1)) {
        action = "recover";
      } else {
        action = "maintain";
      }

      // 构建决策对象
      const decision: ScheduleDecision = {
        providerId: mab.providerId,
        providerName: mab.providerName,
        beforeState: {
          weight: mab.currentWeight,
          priority: mab.currentPriority,
          performanceScore: mab.metrics.weighted.performanceScore,
          circuitState: "closed", // 从 metrics 中获取
        },
        afterState: {
          weight: mab.suggestedWeight,
          priority: mab.suggestedPriority,
          performanceScore: mab.metrics.weighted.performanceScore,
          adjustmentReason: mab.reason,
        },
        metrics: {
          todayRequests: mab.metrics.weighted.requests,
          todayCostUsd: "0", // 暂不使用
          todayAvgResponseTime: mab.metrics.weighted.avgResponseTime,
          todayErrorRate: mab.metrics.weighted.errorRate,
          yesterdayRequests: 0, // 多窗口模式不使用昨日数据
          yesterdayCostUsd: "0",
          yesterdayAvgResponseTime: 0,
          yesterdayErrorRate: 0,
        },
        action,
        reason: mab.reason,
        confidence: mab.confidence,
        baseline: {
          weight: mab.currentWeight, // 当前值即为基准
          priority: mab.currentPriority,
        },
      };

      return decision;
    });
  }

  /**
   * 应用决策（更新数据库）
   */
  private static async applyDecisions(decisions: ScheduleDecision[]): Promise<void> {
    // 只更新有变化的供应商
    const updates = decisions.filter(
      (d) =>
        d.afterState.weight !== d.beforeState.weight ||
        d.afterState.priority !== d.beforeState.priority
    );

    logger.info("[RealtimeScheduler] Applying decisions", {
      totalDecisions: decisions.length,
      updates: updates.length,
    });

    for (const decision of updates) {
      try {
        await updateProvider(decision.providerId, {
          weight: decision.afterState.weight,
          priority: decision.afterState.priority,
          last_schedule_time: new Date(),
          // 首次调度时保存基准值
          ...(decision.baseline.weight === decision.beforeState.weight
            ? { base_weight: decision.beforeState.weight }
            : {}),
          ...(decision.baseline.priority === decision.beforeState.priority
            ? { base_priority: decision.beforeState.priority }
            : {}),
        });

        logger.debug("[RealtimeScheduler] Provider updated", {
          providerId: decision.providerId,
          providerName: decision.providerName,
          action: decision.action,
          weightChange: `${decision.beforeState.weight} → ${decision.afterState.weight}`,
          priorityChange: `${decision.beforeState.priority} → ${decision.afterState.priority}`,
        });
      } catch (error) {
        logger.error("[RealtimeScheduler] Failed to update provider", {
          providerId: decision.providerId,
          error,
        });
        // 继续处理其他供应商，不中断整个流程
      }
    }
  }

  /**
   * 计算汇总信息
   */
  private static calculateSummary(decisions: ScheduleDecision[]): ScheduleSummary {
    const summary: ScheduleSummary = {
      promoted: 0,
      demoted: 0,
      maintained: 0,
      recovered: 0,
      circuitOpen: 0,
    };

    for (const decision of decisions) {
      switch (decision.action) {
        case "promote":
          summary.promoted++;
          break;
        case "demote":
          summary.demoted++;
          break;
        case "maintain":
          summary.maintained++;
          break;
        case "recover":
          summary.recovered++;
          break;
        case "circuit_penalty":
          summary.circuitOpen++;
          break;
        case "explore":
          // 探索模式计入 maintained
          summary.maintained++;
          break;
      }
    }

    return summary;
  }

  /**
   * 记录执行日志
   */
  private static async logExecution(
    decisions: ScheduleDecision[],
    summary: ScheduleSummary,
    executionTime: Date,
    dryRun: boolean
  ): Promise<void> {
    try {
      await createScheduleLog({
        execution_time: executionTime,
        executed_by: "realtime-auto",
        dry_run: dryRun,
        total_providers: decisions.length,
        analyzed_providers: decisions.filter((d) => d.confidence >= 50).length,
        affected_providers: summary.promoted + summary.demoted + summary.recovered,
        decisions,
        summary,
      });
    } catch (error) {
      logger.error("[RealtimeScheduler] Failed to log execution", { error });
      // 日志失败不影响调度执行
    }
  }
}
