"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Eye, TrendingUp, TrendingDown } from "lucide-react";
import { previewAutoSchedule, executeAutoSchedule } from "@/actions/provider-analytics";
import { toast } from "sonner";
import type { ScheduleDecision } from "@/types/schedule";

interface AutoScheduleDialogProps {
  mode: "preview" | "execute";
  onComplete?: () => void;
}

export function AutoScheduleDialog({ mode, onComplete }: AutoScheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState<ScheduleDecision[]>([]);

  const handleOpen = async () => {
    setOpen(true);
    if (mode === "preview") {
      await loadPreview();
    }
  };

  const loadPreview = async () => {
    setLoading(true);
    try {
      const result = await previewAutoSchedule();
      if (result.ok) {
        setDecisions(result.data.decisions);
      } else {
        toast.error(result.error || "加载预览失败");
      }
    } catch (error) {
      console.error("加载预览失败:", error);
      toast.error("加载预览失败");
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    setLoading(true);
    try {
      const result = await executeAutoSchedule();
      if (result.ok) {
        toast.success(`调度成功，影响 ${result.data.affectedCount} 个供应商`);
        setOpen(false);
        onComplete?.();
      } else {
        toast.error(result.error || "执行调度失败");
      }
    } catch (error) {
      console.error("执行调度失败:", error);
      toast.error("执行调度失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={mode === "preview" ? "outline" : "default"}
          onClick={handleOpen}
          disabled={loading}
        >
          {mode === "preview" ? (
            <>
              <Eye className="mr-2 h-4 w-4" />
              预览方案
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              立即执行
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "preview" ? "调度方案预览" : "确认执行调度"}
          </DialogTitle>
          <DialogDescription>
            {mode === "preview"
              ? "以下是基于性能分析生成的调度建议，不会实际修改配置"
              : "确认后将立即执行以下调度方案，修改供应商权重和优先级"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {decisions
              .filter((d) => d.action !== "maintain" || d.confidence >= 50)
              .map((decision) => (
                <DecisionCard key={decision.providerId} decision={decision} />
              ))}
            {decisions.filter((d) => d.action !== "maintain" && d.confidence >= 50).length ===
              0 && (
              <div className="text-center text-muted-foreground py-8">
                当前无需调整，所有供应商运行正常
              </div>
            )}
          </div>
        )}

        {mode === "execute" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              取消
            </Button>
            <Button onClick={handleExecute} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认执行
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// 决策卡片组件
function DecisionCard({ decision }: { decision: ScheduleDecision }) {
  const getActionBadge = (action: string) => {
    const variants = {
      promote: { label: "提升", variant: "default" as const },
      demote: { label: "降级", variant: "destructive" as const },
      maintain: { label: "保持", variant: "secondary" as const },
      recover: { label: "恢复", variant: "secondary" as const },
      circuit_penalty: { label: "惩罚", variant: "destructive" as const },
    };
    const config = variants[action as keyof typeof variants] || variants.maintain;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return <Badge variant="default">置信度: {confidence}%</Badge>;
    if (confidence >= 50) return <Badge variant="secondary">置信度: {confidence}%</Badge>;
    return <Badge variant="destructive">置信度: {confidence}%</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold">{decision.providerName}</h4>
            {getActionBadge(decision.action)}
          </div>
          {getConfidenceBadge(decision.confidence)}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* 调整前后对比 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">调整前</p>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline">权重: {decision.beforeState.weight}</Badge>
                <Badge variant="outline">优先级: {decision.beforeState.priority}</Badge>
                <Badge variant="secondary">
                  得分: {decision.beforeState.performanceScore.toFixed(1)}
                </Badge>
              </div>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">调整后</p>
              <div className="flex gap-2 mt-1">
                <Badge
                  variant={
                    decision.afterState.weight > decision.beforeState.weight
                      ? "default"
                      : decision.afterState.weight < decision.beforeState.weight
                      ? "destructive"
                      : "outline"
                  }
                >
                  权重: {decision.afterState.weight}
                  {decision.afterState.weight !== decision.beforeState.weight && (
                    <span className="ml-1">
                      ({decision.afterState.weight > decision.beforeState.weight ? "+" : ""}
                      {decision.afterState.weight - decision.beforeState.weight})
                    </span>
                  )}
                </Badge>
                <Badge variant="outline">
                  优先级: {decision.afterState.priority}
                  {decision.afterState.priority !== decision.beforeState.priority && (
                    <span className="ml-1">
                      ({decision.afterState.priority > decision.beforeState.priority ? "+" : ""}
                      {decision.afterState.priority - decision.beforeState.priority})
                    </span>
                  )}
                </Badge>
              </div>
            </div>
          </div>

          {/* 性能指标 */}
          <div className="border-t" />
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">请求数</p>
              <p className="font-mono flex items-center gap-1">
                {decision.metrics.todayRequests}
                {decision.metrics.yesterdayRequests > 0 && (
                  <TrendIcon
                    current={decision.metrics.todayRequests}
                    previous={decision.metrics.yesterdayRequests}
                  />
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">错误率</p>
              <p className="font-mono flex items-center gap-1">
                {(decision.metrics.todayErrorRate * 100).toFixed(2)}%
                {decision.metrics.yesterdayErrorRate > 0 && (
                  <TrendIcon
                    current={decision.metrics.todayErrorRate}
                    previous={decision.metrics.yesterdayErrorRate}
                    reverse
                  />
                )}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">平均响应</p>
              <p className="font-mono flex items-center gap-1">
                {decision.metrics.todayAvgResponseTime.toFixed(0)}ms
                {decision.metrics.yesterdayAvgResponseTime > 0 && (
                  <TrendIcon
                    current={decision.metrics.todayAvgResponseTime}
                    previous={decision.metrics.yesterdayAvgResponseTime}
                    reverse
                  />
                )}
              </p>
            </div>
          </div>

          {/* 决策理由 */}
          <div className="border-t" />
          <div className="bg-muted rounded-md p-3">
            <p className="text-sm font-medium mb-1">决策依据</p>
            <p className="text-sm text-muted-foreground">{decision.reason}</p>
            {decision.beforeState.circuitState !== "closed" && (
              <p className="text-sm text-destructive mt-2">
                ⚠️ 熔断器状态: {decision.beforeState.circuitState} - 应用额外惩罚
              </p>
            )}
          </div>

          {/* 基准值信息 */}
          {(decision.baseline.weight !== decision.beforeState.weight ||
            decision.baseline.priority !== decision.beforeState.priority) && (
            <div className="text-xs text-muted-foreground">
              基准配置: 权重 {decision.baseline.weight} / 优先级 {decision.baseline.priority}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendIcon({
  current,
  previous,
  reverse = false,
}: {
  current: number;
  previous: number;
  reverse?: boolean;
}) {
  const change = current - previous;
  const isImprovement = reverse ? change < 0 : change > 0;

  if (Math.abs(change) < previous * 0.01) return null;

  return isImprovement ? (
    <TrendingUp className="h-3 w-3 text-green-500" />
  ) : (
    <TrendingDown className="h-3 w-3 text-red-500" />
  );
}
