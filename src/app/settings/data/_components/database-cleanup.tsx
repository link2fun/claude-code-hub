"use client";

import { useState, useEffect } from "react";
import { Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { CleanupResult } from "@/types/database-backup";

type DaysAgo = 7 | 30 | 90;

const CLEANUP_OPTIONS: Array<{ value: DaysAgo; label: string; description: string }> = [
  { value: 7, label: "一周前", description: "清理 7 天前的日志" },
  { value: 30, label: "一月前", description: "清理 30 天前的日志" },
  { value: 90, label: "三月前", description: "清理 90 天前的日志" },
];

export function DatabaseCleanup() {
  const [daysAgo, setDaysAgo] = useState<DaysAgo>(30);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 查询预估的记录数
  const fetchEstimate = async (days: DaysAgo) => {
    setIsEstimating(true);
    try {
      const response = await fetch(`/api/admin/database/cleanup?daysAgo=${days}`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('获取预估数据失败');
      }

      const data = await response.json();
      setEstimatedCount(data.count);
    } catch (error) {
      console.error('Estimate error:', error);
      setEstimatedCount(null);
    } finally {
      setIsEstimating(false);
    }
  };

  // 当选择变化时更新预估
  useEffect(() => {
    fetchEstimate(daysAgo);
  }, [daysAgo]);

  const handleCleanupClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmCleanup = async () => {
    setShowConfirmDialog(false);
    setIsCleaning(true);

    try {
      const response = await fetch('/api/admin/database/cleanup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ daysAgo }),
      });

      const result: CleanupResult = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || '清理失败');
      }

      toast.success(`成功清理 ${result.deletedCount} 条日志记录！`);

      // 重新获取预估数据
      await fetchEstimate(daysAgo);
    } catch (error) {
      console.error('Cleanup error:', error);
      toast.error(error instanceof Error ? error.message : '清理日志失败');
    } finally {
      setIsCleaning(false);
    }
  };

  const selectedOption = CLEANUP_OPTIONS.find(opt => opt.value === daysAgo);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        清理历史请求日志以释放数据库存储空间。
        此操作会永久删除选定时间范围之前的所有日志记录，包括请求详情、Token 使用统计等。
      </p>

      {/* 时间范围选择 */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="cleanup-range">清理时间范围</Label>
        <Select
          value={daysAgo.toString()}
          onValueChange={(value) => setDaysAgo(parseInt(value) as DaysAgo)}
          disabled={isCleaning}
        >
          <SelectTrigger id="cleanup-range" className="w-full sm:w-[280px]">
            <SelectValue placeholder="选择时间范围" />
          </SelectTrigger>
          <SelectContent>
            {CLEANUP_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value.toString()}>
                {option.label} - {option.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 预估记录数 */}
        {isEstimating ? (
          <p className="text-xs text-muted-foreground">
            正在查询...
          </p>
        ) : estimatedCount !== null ? (
          <p className="text-xs text-muted-foreground">
            预计清理 <span className="font-semibold text-foreground">{estimatedCount.toLocaleString()}</span> 条日志记录
            {estimatedCount === 0 && " - 没有符合条件的日志"}
          </p>
        ) : null}
      </div>

      {/* 警告提示 */}
      <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm dark:border-orange-800 dark:bg-orange-950">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-orange-800 dark:text-orange-200">
              ⚠️ 此操作不可逆！
            </p>
            <ul className="list-disc list-inside text-orange-700 dark:text-orange-300 space-y-0.5">
              <li>被删除的日志将无法恢复</li>
              <li>历史统计数据会受到影响（对应时间段的数据将丢失）</li>
              <li>建议在执行前先导出数据库备份</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 清理按钮 */}
      <Button
        onClick={handleCleanupClick}
        disabled={isCleaning || estimatedCount === 0 || estimatedCount === null}
        variant="destructive"
        className="w-full sm:w-auto"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        {isCleaning ? '正在清理...' : '清理日志'}
      </Button>

      {/* 确认对话框 */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              确认清理日志
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                您即将清理 <span className="font-semibold text-foreground">{selectedOption?.label}</span> 的所有日志记录。
              </p>
              <p className="font-semibold text-foreground">
                ⚠️ 警告：此操作将永久删除约 {estimatedCount?.toLocaleString()} 条记录，且无法恢复！
              </p>
              <p className="text-xs text-muted-foreground">
                删除后，对应时间段的统计数据将不再可用。建议在执行前先导出数据库备份。
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCleanup}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              确认清理
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
