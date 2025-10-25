"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function DatabaseExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [excludeMessageRequest, setExcludeMessageRequest] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // 调用导出 API（自动携带 cookie）
      const exportUrl = new URL('/api/admin/database/export', window.location.origin);
      if (excludeMessageRequest) {
        exportUrl.searchParams.set('excludeMessageRequest', 'true');
      }

      const response = await fetch(exportUrl.toString(), {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || '导出失败');
      }

      // 获取文件名（从 Content-Disposition header）
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `backup_${new Date().toISOString()}.dump`;

      // 下载文件
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('数据库导出成功！');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(error instanceof Error ? error.message : '导出数据库失败');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        导出完整的数据库备份文件（.dump 格式），可用于数据迁移或恢复。
        备份文件使用 PostgreSQL custom format，自动压缩且兼容不同版本的数据库结构。
      </p>

      {/* 导出选项 */}
      <div className="flex items-start gap-2">
        <Checkbox
          id="exclude-message-request"
          checked={excludeMessageRequest}
          onCheckedChange={(checked: boolean) => setExcludeMessageRequest(checked === true)}
          disabled={isExporting}
        />
        <div className="grid gap-1.5 leading-none">
          <Label
            htmlFor="exclude-message-request"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            排除日志数据（仅导出配置）
          </Label>
          <p className="text-xs text-muted-foreground">
            仅导出用户、密钥、供应商等配置数据，不包含历史请求日志。
            备份文件将大幅减小，适合配置迁移场景。
          </p>
        </div>
      </div>

      <Button
        onClick={handleExport}
        disabled={isExporting}
        className="w-full sm:w-auto"
      >
        <Download className="mr-2 h-4 w-4" />
        {isExporting ? '正在导出...' : '导出数据库'}
      </Button>
    </div>
  );
}
