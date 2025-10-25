import type { ProviderMetrics } from '@/types/schedule';

/**
 * 供应商性能评分器
 *
 * 用于计算供应商的性能得分和置信度，作为自动调度的决策依据
 */
export class PerformanceScorer {
  /**
   * 计算性能得分 (0-100)
   *
   * 算法：
   * - 成功率权重 60%：(1 - 错误率) * 60
   * - 响应速度权重 40%：(1 - 标准化响应时间) * 40
   *
   * 标准化响应时间：min(avgResponseTime / 10000ms, 1)
   *
   * @param metrics 供应商性能指标
   * @returns 性能得分 (0-100)
   */
  static calculateScore(metrics: ProviderMetrics): number {
    // 成功率得分 (0-60分)
    const successRate = 1 - metrics.todayErrorRate;
    const successScore = Math.max(0, Math.min(60, successRate * 60));

    // 响应速度得分 (0-40分)
    // 假设 10s 为最差响应时间，超过则得 0 分
    const normalizedTime = Math.min(metrics.todayAvgResponseTime / 10000, 1);
    const speedScore = Math.max(0, Math.min(40, (1 - normalizedTime) * 40));

    // 总分
    const totalScore = successScore + speedScore;

    return Math.round(totalScore * 10) / 10; // 保留一位小数
  }

  /**
   * 计算置信度 (0-100)
   *
   * 基于样本量计算置信度：
   * - 样本数 >= minSize * 5: 100%
   * - 样本数 >= minSize * 2: 80%
   * - 样本数 >= minSize: 50%
   * - 样本数 < minSize: 线性递减到 0%
   *
   * @param sampleSize 样本数量
   * @param minSize 最小样本数要求
   * @returns 置信度 (0-100)
   */
  static calculateConfidence(sampleSize: number, minSize: number): number {
    if (sampleSize >= minSize * 5) {
      return 100;
    } else if (sampleSize >= minSize * 2) {
      return 80;
    } else if (sampleSize >= minSize) {
      return 50;
    } else if (sampleSize > 0) {
      // 线性递减
      return Math.round((sampleSize / minSize) * 50);
    } else {
      return 0;
    }
  }

  /**
   * 计算环比变化百分比
   *
   * @param current 当前值
   * @param previous 前一周期值
   * @returns 变化百分比 (如 0.15 表示增长 15%)
   */
  static calculateTrend(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 1 : 0; // 从 0 增长到任何值都算 100% 增长
    }
    return (current - previous) / previous;
  }

  /**
   * 格式化趋势为可读文本
   *
   * @param trend 趋势百分比
   * @param reverse 是否反转趋势（如错误率，越低越好）
   * @returns 趋势文本（如 "+15%" 或 "-20%"）
   */
  static formatTrend(trend: number, reverse: boolean = false): string {
    const actualTrend = reverse ? -trend : trend;
    const percentage = Math.round(actualTrend * 100);

    if (percentage > 0) {
      return `+${percentage}%`;
    } else if (percentage < 0) {
      return `${percentage}%`;
    } else {
      return '0%';
    }
  }

  /**
   * 判断趋势是否为改善
   *
   * @param trend 趋势百分比
   * @param reverse 是否反转判断（如错误率，下降为改善）
   * @returns true 表示改善，false 表示恶化
   */
  static isImprovement(trend: number, reverse: boolean = false): boolean {
    const actualTrend = reverse ? -trend : trend;
    return actualTrend > 0;
  }
}
