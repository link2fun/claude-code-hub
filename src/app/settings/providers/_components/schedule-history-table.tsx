"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Eye } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { ScheduleLog } from "@/types/schedule";

interface ScheduleHistoryTableProps {
  logs: ScheduleLog[];
}

export function ScheduleHistoryTable({ logs }: ScheduleHistoryTableProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        暂无调度记录
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>执行时间</TableHead>
          <TableHead>执行者</TableHead>
          <TableHead>影响供应商</TableHead>
          <TableHead>汇总</TableHead>
          <TableHead>操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>
              {format(new Date(log.executionTime), "yyyy-MM-dd HH:mm:ss", {
                locale: zhCN,
              })}
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Badge variant={log.executedBy === "auto" ? "default" : "secondary"}>
                  {log.executedBy}
                </Badge>
                {log.dryRun && <Badge variant="outline">预演</Badge>}
              </div>
            </TableCell>
            <TableCell>
              {log.affectedProviders} / {log.totalProviders}
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
              </div>
            </TableCell>
            <TableCell>
              <ScheduleLogDetailDialog log={log} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// 日志详情对话框
function ScheduleLogDetailDialog({ log }: { log: ScheduleLog }) {
  const [filter, setFilter] = React.useState<"all" | "changed" | "promote" | "demote" | "recover">("changed");

  const filteredDecisions = React.useMemo(() => {
    if (filter === "all") return log.decisions;
    if (filter === "changed") return log.decisions.filter((d) => d.action !== "maintain");
    if (filter === "promote") return log.decisions.filter((d) => d.action === "promote");
    if (filter === "demote") return log.decisions.filter((d) => d.action === "demote");
    if (filter === "recover") return log.decisions.filter((d) => d.action === "recover");
    return log.decisions;
  }, [log.decisions, filter]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Eye className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>调度日志详情</DialogTitle>
          <DialogDescription>
            执行时间: {format(new Date(log.executionTime), "yyyy年MM月dd日 HH:mm:ss", { locale: zhCN })}
            {log.dryRun && " (预演模式)"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 汇总信息 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricBadge label="总供应商" value={log.totalProviders} />
            <MetricBadge label="提升" value={log.summary.promoted} variant="default" />
            <MetricBadge label="降级" value={log.summary.demoted} variant="destructive" />
            <MetricBadge label="恢复" value={log.summary.recovered} variant="secondary" />
            <MetricBadge label="熔断" value={log.summary.circuitOpen} variant="destructive" />
          </div>

          {/* 过滤按钮 */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              全部 ({log.decisions.length})
            </Button>
            <Button
              variant={filter === "changed" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("changed")}
            >
              有变化 ({log.decisions.filter((d) => d.action !== "maintain").length})
            </Button>
            <Button
              variant={filter === "promote" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("promote")}
            >
              提升 ({log.summary.promoted})
            </Button>
            <Button
              variant={filter === "demote" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("demote")}
            >
              降级 ({log.summary.demoted})
            </Button>
            <Button
              variant={filter === "recover" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("recover")}
            >
              恢复 ({log.summary.recovered})
            </Button>
          </div>

          {/* 决策列表 */}
          <div className="space-y-4">
            <h4 className="font-semibold text-base">
              详细决策 ({filteredDecisions.length} 条)
            </h4>
            {filteredDecisions.map((decision) => (
              <div
                key={decision.providerId}
                className="border rounded-lg p-4 space-y-4 bg-card"
              >
                {/* 供应商信息和操作 */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{decision.providerName}</span>
                    <ActionBadge action={decision.action} />
                    <Badge variant="outline" className="text-xs">
                      ID: {decision.providerId}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline">
                      性能得分: {decision.beforeState.performanceScore.toFixed(2)}
                    </Badge>
                    {decision.confidence !== undefined && (
                      <Badge variant="secondary">
                        置信度: {(decision.confidence * 100).toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                </div>

                {/* 状态对比 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 调整前状态 */}
                  <div className="border rounded-lg p-3 bg-muted/50">
                    <h5 className="font-medium text-sm mb-2 text-muted-foreground">调整前状态</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">权重:</span>
                        <span className="font-mono">{decision.beforeState.weight}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">优先级:</span>
                        <span className="font-mono">{decision.beforeState.priority}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">性能得分:</span>
                        <span className="font-mono">{decision.beforeState.performanceScore.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">熔断器:</span>
                        <Badge variant={decision.beforeState.circuitState === "closed" ? "default" : "destructive"} className="text-xs">
                          {decision.beforeState.circuitState}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* 调整后状态 */}
                  <div className="border rounded-lg p-3 bg-primary/5">
                    <h5 className="font-medium text-sm mb-2 text-muted-foreground">调整后状态</h5>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">权重:</span>
                        <span className="font-mono font-semibold">
                          {decision.afterState.weight}
                          {decision.afterState.weight !== decision.beforeState.weight && (
                            <span className={decision.afterState.weight > decision.beforeState.weight ? "text-green-600" : "text-red-600"}>
                              {" "}({decision.afterState.weight > decision.beforeState.weight ? "+" : ""}
                              {decision.afterState.weight - decision.beforeState.weight})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">优先级:</span>
                        <span className="font-mono font-semibold">
                          {decision.afterState.priority}
                          {decision.afterState.priority !== decision.beforeState.priority && (
                            <span className={decision.afterState.priority > decision.beforeState.priority ? "text-green-600" : "text-red-600"}>
                              {" "}({decision.afterState.priority > decision.beforeState.priority ? "+" : ""}
                              {decision.afterState.priority - decision.beforeState.priority})
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">性能得分:</span>
                        <span className="font-mono">{decision.afterState.performanceScore.toFixed(2)}</span>
                      </div>
                      {decision.afterState.adjustmentReason && (
                        <div className="pt-1">
                          <span className="text-xs text-muted-foreground">调整原因:</span>
                          <p className="text-xs mt-1">{decision.afterState.adjustmentReason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 性能指标 */}
                {decision.metrics && (
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <h5 className="font-medium text-sm mb-2">性能指标</h5>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">今日请求数:</span>
                        <p className="font-mono font-semibold">{decision.metrics.todayRequests}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">今日错误率:</span>
                        <p className="font-mono font-semibold">
                          {(decision.metrics.todayErrorRate * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">平均响应时间:</span>
                        <p className="font-mono font-semibold">
                          {decision.metrics.todayAvgResponseTime.toFixed(0)}ms
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 决策理由 */}
                <div className="border-l-4 border-primary pl-3 py-2 bg-primary/5">
                  <h5 className="font-medium text-sm mb-1">决策理由</h5>
                  <p className="text-sm">{decision.reason}</p>
                </div>

                {/* 基准配置 */}
                {decision.baseline && (
                  <div className="border rounded-lg p-3 bg-secondary/10">
                    <h5 className="font-medium text-sm mb-2">基准配置</h5>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">基准权重:</span>
                        <span className="font-mono">{decision.baseline.weight}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">基准优先级:</span>
                        <span className="font-mono">{decision.baseline.priority}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {filteredDecisions.length === 0 && (
              <div className="text-center text-muted-foreground py-8 border rounded-lg">
                当前过滤条件下无决策记录
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricBadge({
  label,
  value,
  variant = "secondary",
}: {
  label: string;
  value: number;
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <Badge variant={variant} className="w-full justify-center">
        {value}
      </Badge>
    </div>
  );
}

function ActionBadge({ action }: { action: string }) {
  const variants = {
    promote: { label: "提升", variant: "default" as const },
    demote: { label: "降级", variant: "destructive" as const },
    recover: { label: "恢复", variant: "secondary" as const },
    circuit_penalty: { label: "惩罚", variant: "destructive" as const },
  };
  const config = variants[action as keyof typeof variants];
  if (!config) return null;
  return <Badge variant={config.variant} className="ml-2">{config.label}</Badge>;
}
