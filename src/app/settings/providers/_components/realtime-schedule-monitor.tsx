"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Loader2,
  Play,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  CheckCircle2,
  History,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { getRealtimeScheduleStatus, triggerManualSchedule } from "@/actions/realtime-schedule";
import { getScheduleHistory } from "@/actions/provider-analytics";
import { getProviders } from "@/actions/providers";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { RealtimeScheduleStatus } from "@/types/schedule";
import type { ProviderDisplay } from "@/types/provider";
import type { ScheduleLog } from "@/types/schedule";
import { ResetProviderDialog } from "./reset-provider-dialog";

export function RealtimeScheduleMonitor() {
  const [status, setStatus] = useState<RealtimeScheduleStatus | null>(null);
  const [providers, setProviders] = useState<ProviderDisplay[]>([]);
  const [recentLogs, setRecentLogs] = useState<ScheduleLog[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000); // 每5秒刷新
    return () => clearInterval(interval);
  }, []);

  // 倒计时
  useEffect(() => {
    if (!status?.isRunning || !status.nextExecutionTime) {
      setCountdown(0);
      return;
    }

    const updateCountdown = () => {
      const next = new Date(status.nextExecutionTime!).getTime();
      const now = Date.now();
      const seconds = Math.max(0, Math.floor((next - now) / 1000));
      setCountdown(seconds);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const loadData = async () => {
    try {
      const [statusResult, providersData, logsResult] = await Promise.all([
        getRealtimeScheduleStatus(),
        getProviders(),
        getScheduleHistory(1, 10),
      ]);

      if (statusResult.ok && statusResult.data) {
        setStatus(statusResult.data);
      }

      setProviders(providersData);

      if (logsResult.ok) {
        // 只显示实时调度的日志
        const realtimeLogs = logsResult.data.logs.filter(
          (log) => log.executedBy === "realtime-auto"
        );
        setRecentLogs(realtimeLogs);
      }
    } catch (error) {
      console.error("加载监控数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualTrigger = async () => {
    try {
      setTriggering(true);
      const result = await triggerManualSchedule();

      if (result.ok) {
        toast.success(result.message || "调度成功");
        await loadData();
      } else {
        toast.error(result.error || "调度失败");
      }
    } catch (error) {
      console.error("手动触发失败:", error);
      toast.error("操作失败");
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">无法加载调度器状态</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 调度器状态卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>调度器状态</CardTitle>
          <CardDescription>实时监控自动调度器运行状态</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 状态指示器 */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {status.isRunning ? (
                  <>
                    <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-semibold text-green-600">运行中</span>
                  </>
                ) : (
                  <>
                    <div className="h-3 w-3 rounded-full bg-gray-400" />
                    <span className="font-semibold text-muted-foreground">已停止</span>
                  </>
                )}
              </div>

              {status.isRunning && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      下次执行: <span className="font-mono font-semibold">{countdown}秒</span>后
                    </span>
                  </div>
                </>
              )}

              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  已执行: <span className="font-mono font-semibold">{status.totalExecutions}</span> 次
                </span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleManualTrigger}
              disabled={triggering || !status.config.enableRealtimeSchedule}
            >
              {triggering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              手动触发
            </Button>
          </div>

          {/* 最后执行信息 */}
          {status.lastExecutionTime && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">最后执行时间</p>
                <p className="font-mono text-sm">
                  {new Date(status.lastExecutionTime).toLocaleString("zh-CN")}
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(status.lastExecutionTime), { locale: zhCN, addSuffix: true })})
                  </span>
                </p>
              </div>

              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">执行结果</p>
                <div className="flex items-center gap-2">
                  {status.lastError ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm text-destructive">{status.lastError}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-600">成功</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 配置信息 */}
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline">间隔: {status.config.scheduleIntervalSeconds}s</Badge>
            <Badge variant="outline">探索率: {status.config.explorationRate}%</Badge>
          </div>
        </CardContent>
      </Card>

      {/* 供应商实时状态表格 */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>供应商实时状态</CardTitle>
              <CardDescription>显示所有供应商的当前权重、基准值和最后调度时间</CardDescription>
            </div>
            <ResetProviderDialog mode="all" onSuccess={loadData} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>当前权重</TableHead>
                <TableHead>基准权重</TableHead>
                <TableHead>当前优先级</TableHead>
                <TableHead>基准优先级</TableHead>
                <TableHead>调整状态</TableHead>
                <TableHead>最后调度时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers
                .filter((p) => p.isEnabled)
                .map((provider) => {
                  const weightChange = provider.baseWeight
                    ? provider.weight - provider.baseWeight
                    : 0;
                  const priorityChange = provider.basePriority
                    ? provider.priority - provider.basePriority
                    : 0;

                  return (
                    <TableRow key={provider.id}>
                      <TableCell className="font-medium">{provider.name}</TableCell>

                      {/* 当前权重 */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{provider.weight}</span>
                          {weightChange !== 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {weightChange > 0 ? (
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {weightChange > 0 ? "+" : ""}
                                    {weightChange} (相对基准)
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {weightChange === 0 && provider.baseWeight && (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>

                      {/* 基准权重 */}
                      <TableCell>
                        <span className="font-mono text-muted-foreground">
                          {provider.baseWeight ?? "-"}
                        </span>
                      </TableCell>

                      {/* 当前优先级 */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{provider.priority}</span>
                          {priorityChange !== 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  {priorityChange > 0 ? (
                                    <TrendingDown className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <TrendingUp className="h-4 w-4 text-green-500" />
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {priorityChange > 0 ? "+" : ""}
                                    {priorityChange} (优先级数值越小越高)
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>

                      {/* 基准优先级 */}
                      <TableCell>
                        <span className="font-mono text-muted-foreground">
                          {provider.basePriority ?? "-"}
                        </span>
                      </TableCell>

                      {/* 调整状态 */}
                      <TableCell>
                        {weightChange === 0 && priorityChange === 0 ? (
                          <Badge variant="secondary">未调整</Badge>
                        ) : weightChange > 0 || priorityChange < 0 ? (
                          <Badge variant="default">已提升</Badge>
                        ) : (
                          <Badge variant="destructive">已降级</Badge>
                        )}
                      </TableCell>

                      {/* 最后调度时间 */}
                      <TableCell>
                        {provider.lastScheduleTime ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm text-muted-foreground cursor-help">
                                  {formatDistanceToNow(new Date(provider.lastScheduleTime), {
                                    locale: zhCN,
                                    addSuffix: true,
                                  })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{new Date(provider.lastScheduleTime).toLocaleString("zh-CN")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm text-muted-foreground">从未调度</span>
                        )}
                      </TableCell>

                      {/* 操作列 */}
                      <TableCell>
                        <ResetProviderDialog
                          mode="single"
                          providerId={provider.id}
                          providerName={provider.name}
                          onSuccess={loadData}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>

          {providers.filter((p) => p.isEnabled).length === 0 && (
            <div className="text-center text-muted-foreground py-8">暂无启用的供应商</div>
          )}
        </CardContent>
      </Card>

      {/* 最近调度记录 */}
      <Card>
        <CardHeader>
          <CardTitle>最近调度记录</CardTitle>
          <CardDescription>最近 10 次实时调度执行记录</CardDescription>
        </CardHeader>
        <CardContent>
          {recentLogs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>执行时间</TableHead>
                  <TableHead>影响供应商</TableHead>
                  <TableHead>汇总</TableHead>
                  <TableHead>预演</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="text-sm">
                          {new Date(log.executionTime).toLocaleString("zh-CN")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.executionTime), {
                            locale: zhCN,
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono">
                        {log.affectedProviders} / {log.totalProviders}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {log.summary.promoted > 0 && (
                          <Badge variant="default" className="text-xs">
                            ↑ {log.summary.promoted}
                          </Badge>
                        )}
                        {log.summary.demoted > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            ↓ {log.summary.demoted}
                          </Badge>
                        )}
                        {log.summary.recovered > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            ⟲ {log.summary.recovered}
                          </Badge>
                        )}
                        {log.summary.circuitOpen > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            🔴 {log.summary.circuitOpen}
                          </Badge>
                        )}
                        {log.summary.promoted === 0 &&
                          log.summary.demoted === 0 &&
                          log.summary.recovered === 0 && (
                            <Badge variant="outline" className="text-xs">
                              无变化
                            </Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {log.dryRun && <Badge variant="outline">预演</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {status.isRunning ? "等待首次执行..." : "暂无调度记录"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 说明信息 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>字段说明</AlertTitle>
        <AlertDescription className="space-y-1 text-sm">
          <p>
            • <strong>当前权重/优先级</strong>: 实时调度器动态调整的值，影响流量分配
          </p>
          <p>
            • <strong>基准权重/优先级</strong>: 初始配置值，用于恢复和参考
          </p>
          <p>
            • <strong>调整状态</strong>: 相对基准值的变化（提升/降级/未调整）
          </p>
          <p>
            • <strong>最后调度时间</strong>: 该供应商最后一次被调度的时间
          </p>
          <p>
            • <strong>图标说明</strong>: ↑提升 ↓降级 →保持 ⟲恢复 🔴熔断
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
