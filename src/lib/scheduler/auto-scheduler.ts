import { findProviderList, updateProvider } from '@/repository/provider';
import { getProviderAnalytics } from '@/repository/provider-analytics';
import { createScheduleLog } from '@/repository/schedule-logs';
import { getCircuitState, isCircuitOpen } from '@/lib/circuit-breaker';
import { PerformanceScorer } from './performance-scorer';
import { logger } from '@/lib/logger';
import type {
  ScheduleDecision,
  ScheduleResult,
  ScheduleConfig,
  ScheduleSummary,
  CircuitState,
  ProviderAnalytics,
} from '@/types/schedule';
import type { Provider } from '@/types/provider';

/**
 * 自动调度器
 *
 * 根据供应商性能数据自动调整权重和优先级
 */
export class AutoScheduler {
  /**
   * 执行自动调度
   *
   * @param dryRun 是否为预演模式（不实际修改数据）
   * @param executedBy 执行者标识 ('auto' | 'manual' | username)
   * @param config 调度配置（可选，默认从系统配置读取）
   * @returns 调度结果
   */
  static async execute(
    dryRun: boolean = false,
    executedBy: string = 'auto',
    config?: ScheduleConfig
  ): Promise<ScheduleResult> {
    try {
      logger.info('[AutoScheduler] Starting schedule execution', {
        dryRun,
        executedBy,
      });

      // 1. 获取调度配置
      const scheduleConfig = config || (await this.getConfig());

      // 2. 生成调度决策
      const decisions = await this.generateDecisions(scheduleConfig);

      // 3. 计算汇总信息
      const summary = this.calculateSummary(decisions);

      // 4. 执行调度（非预演模式）
      if (!dryRun && decisions.length > 0) {
        await this.applyDecisions(decisions);
      }

      // 5. 记录日志
      const logId = await this.logExecution(
        decisions,
        summary,
        executedBy,
        dryRun
      );

      logger.info('[AutoScheduler] Schedule execution completed', {
        dryRun,
        logId,
        affectedCount: summary.promoted + summary.demoted + summary.recovered,
      });

      return {
        ok: true,
        logId,
        totalProviders: decisions.length,
        analyzedProviders: decisions.filter((d) => d.confidence >= 50).length,
        affectedProviders:
          summary.promoted + summary.demoted + summary.recovered,
        decisions,
        summary,
      };
    } catch (error) {
      logger.error('[AutoScheduler] Execution failed', { error });
      return {
        ok: false,
        totalProviders: 0,
        analyzedProviders: 0,
        affectedProviders: 0,
        decisions: [],
        summary: {
          promoted: 0,
          demoted: 0,
          maintained: 0,
          recovered: 0,
          circuitOpen: 0,
        },
        error: error instanceof Error ? error.message : '调度执行失败',
      };
    }
  }

  /**
   * 生成调度决策
   */
  private static async generateDecisions(
    config: ScheduleConfig
  ): Promise<ScheduleDecision[]> {
    // 1. 获取所有供应商和性能数据
    const [providers, analyticsData] = await Promise.all([
      findProviderList(1000, 0), // 获取所有供应商
      getProviderAnalytics(),
    ]);

    // 2. 创建分析数据映射
    const analyticsMap = new Map(
      analyticsData.map((a) => [a.id, a])
    );

    // 3. 为每个供应商生成决策
    const decisions: ScheduleDecision[] = [];

    for (const provider of providers) {
      if (!provider.isEnabled) {
        continue; // 跳过已禁用的供应商
      }

      const analytics = analyticsMap.get(provider.id);
      if (!analytics) {
        continue; // 没有性能数据
      }

      // 获取熔断器状态
      const circuitState = getCircuitState(provider.id) as CircuitState;

      // 生成决策
      const decision = this.applyStrategy(
        provider,
        analytics,
        circuitState,
        config
      );

      decisions.push(decision);
    }

    return decisions;
  }

  /**
   * 应用调度策略
   *
   * 策略矩阵：
   * - 优秀（得分 > 85）：权重 +20%，优先级 -1
   * - 良好（60-85）：保持不变
   * - 差劲（< 60）：权重 -20%，优先级 +1
   * - 熔断中：额外惩罚，权重 -30%，优先级 +2
   * - 恢复良好：恢复到基准值
   */
  private static applyStrategy(
    provider: Provider,
    analytics: ProviderAnalytics,
    circuitState: CircuitState,
    config: ScheduleConfig
  ): ScheduleDecision {
    const score = analytics.performanceScore;
    const confidence = analytics.confidence;

    // 基准值（用于恢复）
    const baseWeight = provider.baseWeight ?? provider.weight;
    const basePriority = provider.basePriority ?? provider.priority;

    const beforeState = {
      weight: provider.weight,
      priority: provider.priority,
      performanceScore: score,
      circuitState,
    };

    const metrics = {
      todayRequests: analytics.todayRequests,
      yesterdayRequests: analytics.yesterdayRequests,
      todayErrorRate: analytics.todayErrorRate,
      yesterdayErrorRate: analytics.yesterdayErrorRate,
      todayAvgResponseTime: analytics.todayAvgResponseTime,
      yesterdayAvgResponseTime: analytics.yesterdayAvgResponseTime,
      todayCostUsd: analytics.todayCostUsd,
      yesterdayCostUsd: analytics.yesterdayCostUsd,
    };

    // 样本不足，不调度
    if (confidence < 50) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: provider.weight,
          priority: provider.priority,
          performanceScore: score,
          adjustmentReason: '保持不变',
        },
        metrics,
        action: 'maintain',
        reason: `样本不足 (${analytics.todayRequests} 个请求, 置信度: ${confidence}%)，不参与调度`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    }

    // 熔断器打开 - 双重惩罚
    if (circuitState === 'open') {
      const newWeight = Math.max(1, Math.floor(provider.weight * 0.7)); // -30%
      const newPriority = provider.priority + 2;

      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: newWeight,
          priority: newPriority,
          performanceScore: score,
          adjustmentReason: '熔断器打开，双重惩罚',
        },
        metrics,
        action: 'circuit_penalty',
        reason: `熔断器打开，应用双重惩罚 (得分: ${score.toFixed(1)}, 错误率: ${(metrics.todayErrorRate * 100).toFixed(2)}%)`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    }

    // 恢复检查：得分 > 80 且不在熔断中
    if (
      score > 80 &&
      (provider.weight < baseWeight || provider.priority > basePriority)
    ) {
      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: baseWeight,
          priority: basePriority,
          performanceScore: score,
          adjustmentReason: '性能恢复，恢复到基准配置',
        },
        metrics,
        action: 'recover',
        reason: `性能恢复良好 (得分: ${score.toFixed(1)})，立即恢复到基准配置`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    }

    // 性能分级调度
    if (score > 85) {
      // 优秀 - 提升
      const newWeight = Math.min(100, Math.floor(provider.weight * 1.2)); // +20%
      const newPriority = Math.max(0, provider.priority - 1);

      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: newWeight,
          priority: newPriority,
          performanceScore: score,
          adjustmentReason: '性能优秀，提升权重和优先级',
        },
        metrics,
        action: 'promote',
        reason: `性能优秀 (得分: ${score.toFixed(1)}, 错误率: ${(metrics.todayErrorRate * 100).toFixed(2)}%, 响应时间: ${metrics.todayAvgResponseTime.toFixed(0)}ms)，提升配置`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    } else if (score < 60) {
      // 差劲 - 降级
      const newWeight = Math.max(1, Math.floor(provider.weight * 0.8)); // -20%
      const newPriority = provider.priority + 1;

      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: newWeight,
          priority: newPriority,
          performanceScore: score,
          adjustmentReason: '性能不佳，降低权重和优先级',
        },
        metrics,
        action: 'demote',
        reason: `性能不佳 (得分: ${score.toFixed(1)}, 错误率: ${(metrics.todayErrorRate * 100).toFixed(2)}%, 响应时间: ${metrics.todayAvgResponseTime.toFixed(0)}ms)，降低配置`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    } else {
      // 良好 - 保持
      return {
        providerId: provider.id,
        providerName: provider.name,
        beforeState,
        afterState: {
          weight: provider.weight,
          priority: provider.priority,
          performanceScore: score,
          adjustmentReason: '保持不变',
        },
        metrics,
        action: 'maintain',
        reason: `性能良好 (得分: ${score.toFixed(1)})，保持当前配置`,
        confidence,
        baseline: { weight: baseWeight, priority: basePriority },
      };
    }
  }

  /**
   * 执行调度（实际修改数据库）
   */
  private static async applyDecisions(
    decisions: ScheduleDecision[]
  ): Promise<void> {
    const updates = decisions.filter(
      (d) => d.action !== 'maintain' && d.confidence >= 50
    );

    logger.info('[AutoScheduler] Applying decisions', {
      totalDecisions: decisions.length,
      updates: updates.length,
    });

    for (const decision of updates) {
      await updateProvider(decision.providerId, {
        weight: decision.afterState.weight,
        priority: decision.afterState.priority,
        // 更新基准值（首次调度时）
        ...(decision.baseline.weight === decision.beforeState.weight
          ? { base_weight: decision.beforeState.weight }
          : {}),
        ...(decision.baseline.priority === decision.beforeState.priority
          ? { base_priority: decision.beforeState.priority }
          : {}),
      });

      logger.debug('[AutoScheduler] Provider updated', {
        providerId: decision.providerId,
        providerName: decision.providerName,
        action: decision.action,
        weightChange: `${decision.beforeState.weight} → ${decision.afterState.weight}`,
        priorityChange: `${decision.beforeState.priority} → ${decision.afterState.priority}`,
      });
    }
  }

  /**
   * 记录调度日志
   */
  private static async logExecution(
    decisions: ScheduleDecision[],
    summary: ScheduleSummary,
    executedBy: string,
    dryRun: boolean
  ): Promise<number> {
    const logId = await createScheduleLog({
      execution_time: new Date(),
      executed_by: executedBy,
      dry_run: dryRun,
      total_providers: decisions.length,
      analyzed_providers: decisions.filter((d) => d.confidence >= 50).length,
      affected_providers:
        summary.promoted + summary.demoted + summary.recovered,
      decisions,
      summary,
    });

    return logId;
  }

  /**
   * 计算汇总信息
   */
  private static calculateSummary(
    decisions: ScheduleDecision[]
  ): ScheduleSummary {
    const summary: ScheduleSummary = {
      promoted: 0,
      demoted: 0,
      maintained: 0,
      recovered: 0,
      circuitOpen: 0,
    };

    for (const decision of decisions) {
      switch (decision.action) {
        case 'promote':
          summary.promoted++;
          break;
        case 'demote':
          summary.demoted++;
          break;
        case 'maintain':
          summary.maintained++;
          break;
        case 'recover':
          summary.recovered++;
          break;
        case 'circuit_penalty':
          summary.circuitOpen++;
          break;
      }
    }

    return summary;
  }

  /**
   * 获取调度配置
   */
  private static async getConfig(): Promise<ScheduleConfig> {
    // TODO: 从系统配置中读取
    // 暂时使用默认配置
    return {
      enableAutoSchedule: false,
      scheduleTime: '02:00',
      minSampleSize: 10,
      scheduleWindowHours: 24,
    };
  }
}
