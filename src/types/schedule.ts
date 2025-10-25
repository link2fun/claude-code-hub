/**
 * 供应商调度相关类型定义
 */

// 调度决策行动类型
export type ScheduleAction = 'promote' | 'demote' | 'maintain' | 'recover' | 'circuit_penalty' | 'explore';

// 熔断器状态
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * 供应商性能指标
 */
export interface ProviderMetrics {
  // 今日数据
  todayRequests: number;
  todayCostUsd: string;
  todayAvgResponseTime: number;
  todayErrorRate: number; // 0-1 之间的小数

  // 昨日数据
  yesterdayRequests: number;
  yesterdayCostUsd: string;
  yesterdayAvgResponseTime: number;
  yesterdayErrorRate: number; // 0-1 之间的小数
}

/**
 * 调度决策（完整的决策链条目）
 */
export interface ScheduleDecision {
  // 供应商信息
  providerId: number;
  providerName: string;

  // 调度前状态
  beforeState: {
    weight: number;
    priority: number;
    performanceScore: number;
    circuitState: CircuitState;
  };

  // 调度后状态
  afterState: {
    weight: number;
    priority: number;
    performanceScore: number;
    adjustmentReason: string;
  };

  // 性能指标（决策依据）
  metrics: ProviderMetrics;

  // 决策信息
  action: ScheduleAction;
  reason: string; // 详细的决策理由
  confidence: number; // 0-100，基于样本量

  // 基准值（用于恢复）
  baseline: {
    weight: number;
    priority: number;
  };
}

/**
 * 调度汇总信息
 */
export interface ScheduleSummary {
  promoted: number; // 提升的供应商数
  demoted: number; // 降级的供应商数
  maintained: number; // 保持不变的供应商数
  recovered: number; // 恢复的供应商数
  circuitOpen: number; // 熔断中的供应商数
}

/**
 * 调度结果
 */
export interface ScheduleResult {
  ok: boolean;
  logId?: number;
  totalProviders: number;
  analyzedProviders: number;
  affectedProviders: number;
  decisions: ScheduleDecision[];
  summary: ScheduleSummary;
  error?: string;
}

/**
 * 调度日志
 */
export interface ScheduleLog {
  id: number;
  executionTime: Date;
  executedBy: string;
  dryRun: boolean;
  totalProviders: number;
  analyzedProviders: number;
  affectedProviders: number;
  decisions: ScheduleDecision[];
  summary: ScheduleSummary;
  createdAt: Date;
}

/**
 * 调度配置
 */
export interface ScheduleConfig {
  enableAutoSchedule: boolean;
  scheduleTime: string; // HH:mm 格式
  minSampleSize: number;
  scheduleWindowHours: number;
}

/**
 * 供应商分析数据
 */
export interface ProviderAnalytics {
  // 基本信息
  id: number;
  name: string;
  weight: number;
  priority: number;
  baseWeight: number | null;
  basePriority: number | null;

  // 性能指标
  todayRequests: number;
  todayCostUsd: string;
  todayAvgResponseTime: number;
  todayErrorRate: number;

  yesterdayRequests: number;
  yesterdayCostUsd: string;
  yesterdayAvgResponseTime: number;
  yesterdayErrorRate: number;

  // 计算得分
  performanceScore: number;
  confidence: number;

  // 熔断器状态
  circuitState: CircuitState;

  // 是否被调整过
  isAdjusted: boolean;
}

/**
 * 分析摘要
 */
export interface AnalyticsSummary {
  totalRequests: number;
  avgErrorRate: number;
  avgResponseTime: number;
  avgPerformanceScore: number;
}

/**
 * 多时间窗口性能指标
 */
export interface MultiWindowMetrics {
  // 短期窗口（最近 1 小时）
  shortTerm: {
    requests: number;
    errorRate: number;
    avgResponseTime: number;
    costUsd: string;
  };
  // 中期窗口（最近 6 小时）
  mediumTerm: {
    requests: number;
    errorRate: number;
    avgResponseTime: number;
    costUsd: string;
  };
  // 长期窗口（最近 24 小时）
  longTerm: {
    requests: number;
    errorRate: number;
    avgResponseTime: number;
    costUsd: string;
  };
  // 加权平均
  weighted: {
    requests: number;
    errorRate: number;
    avgResponseTime: number;
    performanceScore: number;
  };
}

/**
 * Multi-Armed Bandit 决策
 */
export interface MABDecision {
  providerId: number;
  providerName: string;

  // UCB 值（Upper Confidence Bound）
  ucbValue: number;

  // 是否为探索模式
  isExploration: boolean;

  // 当前状态
  currentWeight: number;
  currentPriority: number;

  // 建议的新状态
  suggestedWeight: number;
  suggestedPriority: number;

  // 性能指标
  metrics: MultiWindowMetrics;

  // 决策理由
  reason: string;

  // 置信度
  confidence: number;
}

/**
 * 实时调度状态
 */
export interface RealtimeScheduleStatus {
  isRunning: boolean;
  lastExecutionTime: Date | null;
  nextExecutionTime: Date | null;
  totalExecutions: number;
  lastError: string | null;
  config: {
    intervalSeconds: number;
    explorationRate: number;
    enabled: boolean;
  };
}
