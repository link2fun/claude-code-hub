// 数据库备份相关类型定义

/**
 * 数据库状态信息
 */
export interface DatabaseStatus {
  isAvailable: boolean;
  containerName: string;
  databaseName: string;
  databaseSize: string;
  tableCount: number;
  postgresVersion: string;
  error?: string;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  /** 导入前是否清除现有数据（覆盖模式） */
  cleanFirst: boolean;
  /** 是否排除日志数据（仅导入配置） */
  excludeMessageRequest?: boolean;
}

/**
 * 导出选项
 */
export interface ExportOptions {
  /** 是否排除日志数据（仅导出配置） */
  excludeMessageRequest?: boolean;
}

/**
 * 清理日志选项
 */
export interface CleanupOptions {
  /** 清理时间范围（天数）：7 = 一周前，30 = 一月前，90 = 三月前 */
  daysAgo: 7 | 30 | 90;
}

/**
 * 清理日志结果
 */
export interface CleanupResult {
  /** 是否成功 */
  success: boolean;
  /** 删除的记录数 */
  deletedCount: number;
  /** 提示信息 */
  message: string;
  /** 清理的时间阈值 */
  threshold: string;
}

/**
 * 导入进度事件
 */
export interface ImportProgressEvent {
  type: "progress" | "complete" | "error";
  message: string;
  exitCode?: number;
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  success: boolean;
  message: string;
  exitCode?: number;
  error?: string;
}
