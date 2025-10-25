"use client";

import { RealtimeScheduleConfig } from "./realtime-schedule-config";
import { RealtimeScheduleMonitor } from "./realtime-schedule-monitor";

/**
 * 实时调度 Tab 容器
 * 整合配置面板和状态监控
 */
export function RealtimeScheduleTab() {
  return (
    <div className="space-y-6">
      <RealtimeScheduleConfig />
      <RealtimeScheduleMonitor />
    </div>
  );
}
