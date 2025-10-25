"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  getRealtimeScheduleStatus,
  toggleRealtimeSchedule,
  updateRealtimeScheduleConfig,
} from "@/actions/realtime-schedule";
import type { RealtimeScheduleConfig } from "@/types/system-config";

const DEFAULT_CONFIG: RealtimeScheduleConfig = {
  enableRealtimeSchedule: false,
  scheduleIntervalSeconds: 30,
  explorationRate: 15,
  circuitRecoveryWeightPercent: 30,
  circuitRecoveryObservationCount: 10,
  maxWeightAdjustmentPercent: 10,
  shortTermWindowMinutes: 60,
  mediumTermWindowMinutes: 360,
  longTermWindowMinutes: 1440,
};

export function RealtimeScheduleConfig() {
  const [config, setConfig] = useState<RealtimeScheduleConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingEnabled, setPendingEnabled] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const result = await getRealtimeScheduleStatus();
      if (result.ok && result.data) {
        setConfig({
          enableRealtimeSchedule: result.data.config.enabled,
          scheduleIntervalSeconds: result.data.config.intervalSeconds,
          explorationRate: result.data.config.explorationRate,
          circuitRecoveryWeightPercent: 30, // 从系统设置读取
          circuitRecoveryObservationCount: 10,
          maxWeightAdjustmentPercent: 10,
          shortTermWindowMinutes: 60,
          mediumTermWindowMinutes: 360,
          longTermWindowMinutes: 1440,
        });
      }
    } catch (error) {
      console.error("加载配置失败:", error);
      toast.error("加载配置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSwitch = (checked: boolean) => {
    if (checked) {
      // 开启时显示确认对话框
      setPendingEnabled(true);
      setShowConfirmDialog(true);
    } else {
      // 关闭时直接执行
      handleToggle(false);
    }
  };

  const handleConfirmEnable = () => {
    setShowConfirmDialog(false);
    handleToggle(true);
  };

  const handleToggle = async (enabled: boolean) => {
    try {
      setSaving(true);
      const result = await toggleRealtimeSchedule(enabled);

      if (result.ok) {
        setConfig((prev) => ({ ...prev, enableRealtimeSchedule: enabled }));
        toast.success(result.message || (enabled ? "实时调度已开启" : "实时调度已关闭"));
        await loadConfig(); // 重新加载状态
      } else {
        toast.error(result.error || "操作失败");
      }
    } catch (error) {
      console.error("切换失败:", error);
      toast.error("操作失败");
    } finally {
      setSaving(false);
      setPendingEnabled(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      const result = await updateRealtimeScheduleConfig({
        scheduleIntervalSeconds: config.scheduleIntervalSeconds,
        explorationRate: config.explorationRate,
        circuitRecoveryWeightPercent: config.circuitRecoveryWeightPercent,
        circuitRecoveryObservationCount: config.circuitRecoveryObservationCount,
        maxWeightAdjustmentPercent: config.maxWeightAdjustmentPercent,
        shortTermWindowMinutes: config.shortTermWindowMinutes,
        mediumTermWindowMinutes: config.mediumTermWindowMinutes,
        longTermWindowMinutes: config.longTermWindowMinutes,
      });

      if (result.ok) {
        toast.success(result.message || "配置已保存");
      } else {
        toast.error(result.error || "保存失败");
      }
    } catch (error) {
      console.error("保存配置失败:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setConfig(DEFAULT_CONFIG);
    toast.info("已恢复默认配置");
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>实时调度配置</CardTitle>
          <CardDescription>
            配置 Multi-Armed Bandit 算法参数，控制自动调度行为
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 实验性功能警告 */}
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>⚠️ 实验性功能</AlertTitle>
            <AlertDescription className="space-y-2 text-sm">
              <p>
                实时调度是<strong>实验性功能</strong>，将每 {config.scheduleIntervalSeconds} 秒自动调整供应商权重和优先级。
              </p>
              <p>
                • 开启后将<strong>重置所有供应商到基准配置</strong>，然后完全自动化运行
              </p>
              <p>
                • 使用 Multi-Armed Bandit 算法平衡探索与利用
              </p>
              <p>
                • 您可以随时关闭此功能，但建议先在测试环境验证
              </p>
            </AlertDescription>
          </Alert>

          {/* 主开关 */}
          <div className="flex items-start justify-between gap-4 rounded-lg border-2 border-dashed border-primary/30 px-4 py-4 bg-primary/5">
            <div className="flex-1">
              <Label htmlFor="enable-realtime" className="text-base font-semibold">
                启用实时调度
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                开启后将每 {config.scheduleIntervalSeconds} 秒自动执行一次调度，无需人工干预
              </p>
            </div>
            <Switch
              id="enable-realtime"
              checked={config.enableRealtimeSchedule}
              onCheckedChange={handleToggleSwitch}
              disabled={saving}
            />
          </div>

          {/* 核心参数配置 */}
          <div className="space-y-6 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Info className="h-4 w-4" />
              核心参数配置
            </div>

            {/* 调度间隔 */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="interval">调度间隔（秒）</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {config.scheduleIntervalSeconds}s
                </span>
              </div>
              <Input
                id="interval"
                type="number"
                min={30}
                max={300}
                value={config.scheduleIntervalSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    scheduleIntervalSeconds: parseInt(e.target.value) || 30,
                  }))
                }
                disabled={!config.enableRealtimeSchedule || saving}
              />
              <p className="text-xs text-muted-foreground">
                每隔 N 秒自动执行一次调度（范围：30-300秒）
              </p>
            </div>

            {/* 探索率 */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="exploration">探索率（%）</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {config.explorationRate}%
                </span>
              </div>
              <Slider
                id="exploration"
                min={0}
                max={100}
                step={5}
                value={[config.explorationRate]}
                onValueChange={([value]) =>
                  setConfig((prev) => ({ ...prev, explorationRate: value }))
                }
                disabled={!config.enableRealtimeSchedule || saving}
                className="py-4"
              />
              <p className="text-xs text-muted-foreground">
                {config.explorationRate}% 探索（尝试低流量供应商），
                {100 - config.explorationRate}% 利用（选择最优供应商）
              </p>
            </div>

            {/* 最大权重调整 */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="max-adjustment">最大权重调整（%）</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  ±{config.maxWeightAdjustmentPercent}%
                </span>
              </div>
              <Slider
                id="max-adjustment"
                min={1}
                max={50}
                step={1}
                value={[config.maxWeightAdjustmentPercent]}
                onValueChange={([value]) =>
                  setConfig((prev) => ({ ...prev, maxWeightAdjustmentPercent: value }))
                }
                disabled={!config.enableRealtimeSchedule || saving}
                className="py-4"
              />
              <p className="text-xs text-muted-foreground">
                单次调度最多调整 ±{config.maxWeightAdjustmentPercent}% 权重，避免剧烈波动
              </p>
            </div>
          </div>

          {/* 熔断器恢复策略 */}
          <div className="space-y-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Info className="h-4 w-4" />
              熔断器恢复策略
            </div>

            {/* 恢复权重 */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="recovery-weight">恢复权重（%）</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {config.circuitRecoveryWeightPercent}%
                </span>
              </div>
              <Slider
                id="recovery-weight"
                min={0}
                max={100}
                step={5}
                value={[config.circuitRecoveryWeightPercent]}
                onValueChange={([value]) =>
                  setConfig((prev) => ({ ...prev, circuitRecoveryWeightPercent: value }))
                }
                disabled={!config.enableRealtimeSchedule || saving}
                className="py-4"
              />
              <p className="text-xs text-muted-foreground">
                熔断器半开时，给予基准权重的 {config.circuitRecoveryWeightPercent}%
              </p>
            </div>

            {/* 观察请求数 */}
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label htmlFor="observation-count">观察请求数</Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {config.circuitRecoveryObservationCount} 个
                </span>
              </div>
              <Input
                id="observation-count"
                type="number"
                min={5}
                max={50}
                value={config.circuitRecoveryObservationCount}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    circuitRecoveryObservationCount: parseInt(e.target.value) || 10,
                  }))
                }
                disabled={!config.enableRealtimeSchedule || saving}
              />
              <p className="text-xs text-muted-foreground">
                观察 {config.circuitRecoveryObservationCount} 个请求后决定是否完全恢复（范围：5-50）
              </p>
            </div>
          </div>

          {/* 时间窗口配置 */}
          <div className="space-y-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Info className="h-4 w-4" />
              时间窗口配置
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 短期窗口 */}
              <div className="space-y-2">
                <Label htmlFor="short-term">短期窗口（分钟）</Label>
                <Input
                  id="short-term"
                  type="number"
                  min={15}
                  max={180}
                  value={config.shortTermWindowMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      shortTermWindowMinutes: parseInt(e.target.value) || 60,
                    }))
                  }
                  disabled={!config.enableRealtimeSchedule || saving}
                />
                <p className="text-xs text-muted-foreground">权重: 60%</p>
              </div>

              {/* 中期窗口 */}
              <div className="space-y-2">
                <Label htmlFor="medium-term">中期窗口（分钟）</Label>
                <Input
                  id="medium-term"
                  type="number"
                  min={180}
                  max={720}
                  value={config.mediumTermWindowMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      mediumTermWindowMinutes: parseInt(e.target.value) || 360,
                    }))
                  }
                  disabled={!config.enableRealtimeSchedule || saving}
                />
                <p className="text-xs text-muted-foreground">权重: 30%</p>
              </div>

              {/* 长期窗口 */}
              <div className="space-y-2">
                <Label htmlFor="long-term">长期窗口（分钟）</Label>
                <Input
                  id="long-term"
                  type="number"
                  min={720}
                  max={2880}
                  value={config.longTermWindowMinutes}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      longTermWindowMinutes: parseInt(e.target.value) || 1440,
                    }))
                  }
                  disabled={!config.enableRealtimeSchedule || saving}
                />
                <p className="text-xs text-muted-foreground">权重: 10%</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              短期窗口响应最快，长期窗口提供稳定基准。三个窗口的数据会按权重加权平均。
            </p>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={handleResetToDefault}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              恢复默认值
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={!config.enableRealtimeSchedule || saving}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存配置
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 确认对话框 */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              确认开启实时调度？
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-4">
              <p>开启后将：</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>
                  <strong>重置所有启用的供应商到基准配置</strong>
                </li>
                <li>每 {config.scheduleIntervalSeconds} 秒自动调整权重和优先级</li>
                <li>完全自动化运行，无需人工干预</li>
                <li>使用 Multi-Armed Bandit 算法智能分配流量</li>
              </ul>
              <p className="text-sm text-muted-foreground pt-2">
                您可以随时关闭此功能。建议先在测试环境验证效果。
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowConfirmDialog(false);
                setPendingEnabled(false);
              }}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleConfirmEnable} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认开启
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
