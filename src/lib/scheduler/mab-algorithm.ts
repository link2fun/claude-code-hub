/**
 * Multi-Armed Bandit 算法实现
 *
 * 核心策略：
 * 1. Epsilon-Greedy: 85% 利用（选择最优），15% 探索（尝试其他）
 * 2. UCB1 (Upper Confidence Bound): 平衡探索和利用，优先选择不确定性高的供应商
 */

import { logger } from "@/lib/logger";
import type { ProviderMultiWindowAnalytics } from "@/repository/provider-analytics-multiwindow";
import type { MABDecision } from "@/types/schedule";

export interface MABConfig {
  explorationRate: number; // 探索率（0-100）
  minSampleSize: number; // 最小样本数
  circuitRecoveryWeightPercent: number; // 熔断恢复权重百分比
  maxWeightAdjustmentPercent: number; // 最大权重调整百分比
}

/**
 * Multi-Armed Bandit 调度器
 */
export class MABScheduler {
  /**
   * 计算 UCB1 值（Upper Confidence Bound）
   *
   * UCB1 = 平均奖励 + sqrt(2 * ln(总次数) / 该臂次数)
   *
   * @param performanceScore 性能得分（0-100）
   * @param providerRequests 该供应商的请求数
   * @param totalRequests 所有供应商的总请求数
   */
  static calculateUCB(
    performanceScore: number,
    providerRequests: number,
    totalRequests: number
  ): number {
    if (providerRequests === 0) {
      // 未使用过的供应商，给予最高优先级
      return Infinity;
    }

    if (totalRequests === 0) {
      return performanceScore;
    }

    // 归一化性能得分到 0-1
    const normalizedScore = performanceScore / 100;

    // 探索项：鼓励尝试样本少的供应商
    const explorationBonus = Math.sqrt((2 * Math.log(totalRequests)) / providerRequests);

    return normalizedScore + explorationBonus;
  }

  /**
   * Epsilon-Greedy 策略选择
   *
   * @param providers 供应商列表
   * @param explorationRate 探索率（0-100）
   * @param totalRequests 总请求数
   */
  static selectProvider(
    providers: ProviderMultiWindowAnalytics[],
    explorationRate: number,
    totalRequests: number
  ): { provider: ProviderMultiWindowAnalytics; isExploration: boolean; ucbValue: number } {
    if (providers.length === 0) {
      throw new Error("No providers available for selection");
    }

    if (providers.length === 1) {
      const provider = providers[0];
      const ucbValue = this.calculateUCB(
        provider.metrics.weighted.performanceScore,
        provider.metrics.weighted.requests,
        totalRequests
      );
      return { provider, isExploration: false, ucbValue };
    }

    // 计算所有供应商的 UCB 值
    const providersWithUCB = providers.map((p) => ({
      provider: p,
      ucbValue: this.calculateUCB(
        p.metrics.weighted.performanceScore,
        p.metrics.weighted.requests,
        totalRequests
      ),
      performanceScore: p.metrics.weighted.performanceScore,
    }));

    // 随机数决定是探索还是利用
    const random = Math.random() * 100;
    const isExploration = random < explorationRate;

    if (isExploration) {
      // 探索模式：选择 UCB 值最高的（优先选择不确定性高的）
      const sorted = providersWithUCB.sort((a, b) => b.ucbValue - a.ucbValue);
      const selected = sorted[0];

      logger.debug("[MAB] Exploration mode: selected provider with highest UCB", {
        providerId: selected.provider.id,
        providerName: selected.provider.name,
        ucbValue: selected.ucbValue,
        performanceScore: selected.performanceScore,
        requests: selected.provider.metrics.weighted.requests,
      });

      return {
        provider: selected.provider,
        isExploration: true,
        ucbValue: selected.ucbValue,
      };
    } else {
      // 利用模式：选择性能得分最高的
      const sorted = providersWithUCB.sort((a, b) => b.performanceScore - a.performanceScore);
      const selected = sorted[0];

      logger.debug("[MAB] Exploitation mode: selected provider with highest score", {
        providerId: selected.provider.id,
        providerName: selected.provider.name,
        performanceScore: selected.performanceScore,
        ucbValue: selected.ucbValue,
        requests: selected.provider.metrics.weighted.requests,
      });

      return {
        provider: selected.provider,
        isExploration: false,
        ucbValue: selected.ucbValue,
      };
    }
  }

  /**
   * 生成调度决策
   *
   * @param providers 供应商列表
   * @param config MAB 配置
   */
  static generateDecisions(
    providers: ProviderMultiWindowAnalytics[],
    config: MABConfig
  ): MABDecision[] {
    const totalRequests = providers.reduce((sum, p) => sum + p.metrics.weighted.requests, 0);

    logger.info("[MAB] Generating decisions", {
      totalProviders: providers.length,
      totalRequests,
      explorationRate: config.explorationRate,
    });

    const decisions: MABDecision[] = [];

    for (const provider of providers) {
      const ucbValue = this.calculateUCB(
        provider.metrics.weighted.performanceScore,
        provider.metrics.weighted.requests,
        totalRequests
      );

      // 确定基准值
      const baseWeight = provider.baseWeight ?? provider.weight;
      const basePriority = provider.basePriority ?? provider.priority;

      // 计算建议的新权重和优先级
      const { suggestedWeight, suggestedPriority, reason } = this.calculateAdjustment(
        provider,
        ucbValue,
        baseWeight,
        basePriority,
        config
      );

      // 计算置信度（基于样本数）
      const confidence = this.calculateConfidence(
        provider.metrics.weighted.requests,
        config.minSampleSize
      );

      // 判断是否为探索模式（低流量供应商）
      const isExploration = provider.metrics.weighted.requests < config.minSampleSize;

      decisions.push({
        providerId: provider.id,
        providerName: provider.name,
        ucbValue,
        isExploration,
        currentWeight: provider.weight,
        currentPriority: provider.priority,
        suggestedWeight,
        suggestedPriority,
        metrics: provider.metrics,
        reason,
        confidence,
      });
    }

    return decisions;
  }

  /**
   * 计算权重和优先级调整
   */
  private static calculateAdjustment(
    provider: ProviderMultiWindowAnalytics,
    ucbValue: number,
    baseWeight: number,
    basePriority: number,
    config: MABConfig
  ): { suggestedWeight: number; suggestedPriority: number; reason: string } {
    const performanceScore = provider.metrics.weighted.performanceScore;
    const requests = provider.metrics.weighted.requests;
    const errorRate = provider.metrics.weighted.errorRate;
    const circuitState = provider.circuitState;

    // 熔断器处理
    if (circuitState === "open") {
      return {
        suggestedWeight: 0,
        suggestedPriority: 999,
        reason: `熔断器打开，暂停流量分配（错误率: ${(errorRate * 100).toFixed(2)}%）`,
      };
    }

    if (circuitState === "half-open") {
      // 谨慎恢复：给予基准权重的 30%
      const recoveryWeight = Math.floor(baseWeight * (config.circuitRecoveryWeightPercent / 100));
      return {
        suggestedWeight: Math.max(1, recoveryWeight),
        suggestedPriority: basePriority + 1, // 稍微降低优先级
        reason: `熔断器半开，谨慎恢复（${config.circuitRecoveryWeightPercent}% 基准权重，观察中）`,
      };
    }

    // 样本不足，探索模式
    if (requests < config.minSampleSize) {
      // 给予适度的探索流量
      const explorationWeight = Math.max(1, Math.floor(baseWeight * 0.5));
      return {
        suggestedWeight: explorationWeight,
        suggestedPriority: basePriority,
        reason: `样本不足 (${requests}/${config.minSampleSize})，分配探索流量（50% 基准权重）`,
      };
    }

    // 基于性能得分调整
    const currentWeight = provider.weight;
    let targetWeight: number;
    let targetPriority = provider.priority;
    let reason: string;

    if (performanceScore >= 85) {
      // 优秀：增加权重
      const increase = Math.floor(baseWeight * (config.maxWeightAdjustmentPercent / 100));
      targetWeight = Math.min(100, currentWeight + increase);
      targetPriority = Math.max(0, basePriority - 1);
      reason = `性能优秀 (得分: ${performanceScore.toFixed(1)})，增加权重 +${increase}`;
    } else if (performanceScore >= 70) {
      // 良好：保持或微调
      targetWeight = baseWeight;
      targetPriority = basePriority;
      reason = `性能良好 (得分: ${performanceScore.toFixed(1)})，保持基准配置`;
    } else if (performanceScore >= 50) {
      // 一般：轻微降级
      const decrease = Math.floor(baseWeight * (config.maxWeightAdjustmentPercent / 200)); // 减半
      targetWeight = Math.max(1, currentWeight - decrease);
      targetPriority = basePriority + 1;
      reason = `性能一般 (得分: ${performanceScore.toFixed(1)})，轻微降低权重 -${decrease}`;
    } else {
      // 差劲：明显降级
      const decrease = Math.floor(baseWeight * (config.maxWeightAdjustmentPercent / 100));
      targetWeight = Math.max(1, currentWeight - decrease);
      targetPriority = basePriority + 2;
      reason = `性能不佳 (得分: ${performanceScore.toFixed(1)}, 错误率: ${(errorRate * 100).toFixed(2)}%)，降低权重 -${decrease}`;
    }

    // 渐进式调整：限制单次变化幅度
    const maxChange = Math.floor(currentWeight * (config.maxWeightAdjustmentPercent / 100));
    const weightDelta = targetWeight - currentWeight;

    let suggestedWeight: number;
    if (Math.abs(weightDelta) > maxChange) {
      suggestedWeight = currentWeight + Math.sign(weightDelta) * maxChange;
      reason += ` (渐进调整，单次限制 ±${config.maxWeightAdjustmentPercent}%)`;
    } else {
      suggestedWeight = targetWeight;
    }

    return {
      suggestedWeight: Math.max(1, Math.min(100, suggestedWeight)),
      suggestedPriority: Math.max(0, targetPriority),
      reason,
    };
  }

  /**
   * 计算置信度（基于样本数）
   */
  private static calculateConfidence(requests: number, minSampleSize: number): number {
    if (requests === 0) return 0;
    if (requests >= minSampleSize * 2) return 100;

    // 线性插值
    return Math.min(100, Math.floor((requests / (minSampleSize * 2)) * 100));
  }
}
