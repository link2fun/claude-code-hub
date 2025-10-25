export interface SystemSettings {
  id: number;
  siteTitle: string;
  allowGlobalUsageView: boolean;

  // 定时调度配置（已废弃但保留兼容）
  enableAutoSchedule?: boolean;
  scheduleTime?: string;
  minSampleSize?: number;
  scheduleWindowHours?: number;

  // 实时调度配置
  enableRealtimeSchedule?: boolean;
  scheduleIntervalSeconds?: number;
  explorationRate?: number;
  circuitRecoveryWeightPercent?: number;
  circuitRecoveryObservationCount?: number;
  maxWeightAdjustmentPercent?: number;
  shortTermWindowMinutes?: number;
  mediumTermWindowMinutes?: number;
  longTermWindowMinutes?: number;

  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSystemSettingsInput {
  siteTitle?: string;
  allowGlobalUsageView?: boolean;
  // 实时调度配置
  enableRealtimeSchedule?: boolean;
  scheduleIntervalSeconds?: number;
  explorationRate?: number;
  circuitRecoveryWeightPercent?: number;
  circuitRecoveryObservationCount?: number;
  maxWeightAdjustmentPercent?: number;
  shortTermWindowMinutes?: number;
  mediumTermWindowMinutes?: number;
  longTermWindowMinutes?: number;
}

/**
 * 实时调度配置
 */
export interface RealtimeScheduleConfig {
  enableRealtimeSchedule: boolean;
  scheduleIntervalSeconds: number;
  explorationRate: number; // 0-100
  circuitRecoveryWeightPercent: number; // 0-100
  circuitRecoveryObservationCount: number;
  maxWeightAdjustmentPercent: number; // 0-100
  shortTermWindowMinutes: number;
  mediumTermWindowMinutes: number;
  longTermWindowMinutes: number;
}

/**
 * 实时调度配置更新输入
 */
export interface UpdateRealtimeScheduleConfigInput {
  enableRealtimeSchedule?: boolean;
  scheduleIntervalSeconds?: number;
  explorationRate?: number;
  circuitRecoveryWeightPercent?: number;
  circuitRecoveryObservationCount?: number;
  maxWeightAdjustmentPercent?: number;
  shortTermWindowMinutes?: number;
  mediumTermWindowMinutes?: number;
  longTermWindowMinutes?: number;
}
