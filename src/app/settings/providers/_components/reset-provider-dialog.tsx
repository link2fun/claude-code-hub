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
import { RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resetProvider, resetAllProviders } from "@/actions/providers";

interface ResetProviderDialogProps {
  providerId?: number;
  providerName?: string;
  mode: "single" | "all";
  onSuccess?: () => void;
}

export function ResetProviderDialog({
  providerId,
  providerName,
  mode,
  onSuccess,
}: ResetProviderDialogProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      if (mode === "single" && providerId) {
        const result = await resetProvider(providerId);
        if (result.ok) {
          toast.success(`供应商 ${providerName} 已重置到基准配置`);
          setShowConfirm(false);
          onSuccess?.();
        } else {
          toast.error(result.error || "重置失败");
        }
      } else if (mode === "all") {
        const result = await resetAllProviders();
        if (result.ok) {
          toast.success(`已重置 ${result.data?.affectedCount || 0} 个供应商到基准配置`);
          setShowConfirm(false);
          onSuccess?.();
        } else {
          toast.error(result.error || "批量重置失败");
        }
      }
    } catch (error) {
      console.error("重置失败:", error);
      toast.error("操作失败");
    } finally {
      setLoading(false);
    }
  };

  if (mode === "single") {
    return (
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowConfirm(true)}
          disabled={loading}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认重置供应商？</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                将供应商 <strong>{providerName}</strong> 的权重和优先级重置到基准配置。
              </p>
              <p className="text-sm text-muted-foreground">
                • 如果没有基准值，将使用当前值作为基准值
              </p>
              <p className="text-sm text-muted-foreground">
                • 此操作会立即生效，影响流量分配
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认重置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  // mode === "all"
  return (
    <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
      <Button
        variant="outline"
        onClick={() => setShowConfirm(true)}
        disabled={loading}
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        重置所有供应商
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认批量重置？</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              将<strong>所有启用的供应商</strong>的权重和优先级重置到基准配置。
            </p>
            <p className="text-sm text-muted-foreground">
              • 如果供应商没有基准值，将使用当前值作为基准值
            </p>
            <p className="text-sm text-muted-foreground">
              • 此操作会立即生效，影响所有供应商的流量分配
            </p>
            <p className="text-sm text-muted-foreground">
              • 适用于关闭实时调度后恢复初始配置的场景
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleReset} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            确认批量重置
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
