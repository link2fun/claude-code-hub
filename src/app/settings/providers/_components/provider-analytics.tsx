"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, TrendingDown, Minus, Activity, AlertCircle } from "lucide-react";
import { getProvidersAnalytics, getScheduleHistory } from "@/actions/provider-analytics";
import { AutoScheduleDialog } from "./auto-schedule-dialog";
import { ScheduleHistoryTable } from "./schedule-history-table";
import type { ProviderAnalytics, AnalyticsSummary, ScheduleLog } from "@/types/schedule";

interface ProviderAnalyticsProps {
  initialAnalytics?: ProviderAnalytics[];
  initialSummary?: AnalyticsSummary;
}

export function ProviderAnalyticsView({ initialAnalytics, initialSummary }: ProviderAnalyticsProps) {
  const [analytics, setAnalytics] = useState<ProviderAnalytics[]>(initialAnalytics || []);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(initialSummary || null);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleLog[]>([]);
  const [loading, setLoading] = useState(!initialAnalytics);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analyticsResult, historyResult] = await Promise.all([
        getProvidersAnalytics(),
        getScheduleHistory(1, 10),
      ]);

      if (analyticsResult.ok) {
        setAnalytics(analyticsResult.data.analytics);
        setSummary(analyticsResult.data.summary);
      } else {
        setError(analyticsResult.error || "加载数据失败");
      }

      if (historyResult.ok) {
        setScheduleHistory(historyResult.data.logs);
      }

      setError(null);
    } catch (err) {
      console.error("加载分析数据失败:", err);
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  const handleScheduleComplete = () => {
    loadData();
  };

  if (loading && !analytics.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 概览卡片 */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            title="总请求数"
            value={summary.totalRequests}
            description="今日总计"
            icon={Activity}
          />
          <MetricCard
            title="平均错误率"
            value={`${(summary.avgErrorRate * 100).toFixed(2)}%`}
            description="所有供应商"
            icon={AlertCircle}
            variant={summary.avgErrorRate > 0.05 ? "destructive" : "default"}
          />
          <MetricCard
            title="平均响应"
            value={`${summary.avgResponseTime.toFixed(0)}ms`}
            description="响应时间"
            icon={Activity}
          />
          <MetricCard
            title="平均得分"
            value={summary.avgPerformanceScore.toFixed(1)}
            description="性能评分"
            icon={TrendingUp}
            variant={summary.avgPerformanceScore > 60 ? "default" : "destructive"}
          />
        </div>
      )}

      {/* 自动调度控制 */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>自动调度</CardTitle>
              <CardDescription>根据性能数据自动优化供应商权重和优先级</CardDescription>
            </div>
            <div className="flex gap-2">
              <AutoScheduleDialog mode="preview" />
              <AutoScheduleDialog mode="execute" onComplete={handleScheduleComplete} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* 供应商性能表格 */}
      <Card>
        <CardHeader>
          <CardTitle>供应商性能分析</CardTitle>
          <CardDescription>昨日 vs 今日性能对比</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>供应商</TableHead>
                <TableHead>权重/优先级</TableHead>
                <TableHead>今日请求</TableHead>
                <TableHead>错误率</TableHead>
                <TableHead>平均响应</TableHead>
                <TableHead>性能得分</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analytics.map((provider) => (
                <TableRow key={provider.id}>
                  <TableCell className="font-medium">{provider.name}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Badge variant="outline">W: {provider.weight}</Badge>
                      <Badge variant="secondary">P: {provider.priority}</Badge>
                      {provider.isAdjusted && (
                        <Badge variant="default" className="text-xs">已调整</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>{provider.todayRequests}</span>
                      <TrendIndicator
                        current={provider.todayRequests}
                        previous={provider.yesterdayRequests}
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>{(provider.todayErrorRate * 100).toFixed(2)}%</span>
                      <TrendIndicator
                        current={provider.todayErrorRate}
                        previous={provider.yesterdayErrorRate}
                        reverse
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span>{provider.todayAvgResponseTime.toFixed(0)}ms</span>
                      <TrendIndicator
                        current={provider.todayAvgResponseTime}
                        previous={provider.yesterdayAvgResponseTime}
                        reverse
                      />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={provider.performanceScore > 60 ? "default" : "destructive"}
                    >
                      {provider.performanceScore.toFixed(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <CircuitStateBadge state={provider.circuitState} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 调度历史 */}
      <Card>
        <CardHeader>
          <CardTitle>调度历史</CardTitle>
          <CardDescription>最近 10 次调度记录</CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleHistoryTable logs={scheduleHistory} />
        </CardContent>
      </Card>
    </div>
  );
}

// 辅助组件
function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "destructive";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${variant === "destructive" ? "text-destructive" : ""}`}>
          {value}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function TrendIndicator({
  current,
  previous,
  reverse = false,
}: {
  current: number;
  previous: number;
  reverse?: boolean;
}) {
  if (previous === 0) return null;

  const change = ((current - previous) / previous) * 100;
  const isImprovement = reverse ? change < 0 : change > 0;

  if (Math.abs(change) < 1) {
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  }

  return isImprovement ? (
    <TrendingUp className="h-3 w-3 text-green-500" />
  ) : (
    <TrendingDown className="h-3 w-3 text-red-500" />
  );
}

function CircuitStateBadge({ state }: { state: string }) {
  const variants = {
    closed: { label: "正常", variant: "default" as const },
    open: { label: "熔断", variant: "destructive" as const },
    "half-open": { label: "半开", variant: "secondary" as const },
  };

  const config = variants[state as keyof typeof variants] || variants.closed;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
