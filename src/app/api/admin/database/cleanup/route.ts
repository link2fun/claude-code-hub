import { db } from "@/drizzle/db";
import { messageRequest } from "@/drizzle/schema";
import { sql, lt, and, isNull } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getSession } from "@/lib/auth";
import type { CleanupResult } from "@/types/database-backup";

/**
 * 清理历史日志数据
 *
 * POST /api/admin/database/cleanup
 *
 * Body: { daysAgo: 7 | 30 | 90 }
 *
 * 响应: CleanupResult
 */
export async function POST(request: Request) {
  try {
    // 1. 验证管理员权限
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      logger.warn({ action: "database_cleanup_unauthorized" });
      return Response.json({ error: "未授权访问" }, { status: 401 });
    }

    // 2. 解析请求参数
    const body = await request.json();
    const { daysAgo } = body;

    if (![7, 30, 90].includes(daysAgo)) {
      return Response.json(
        { error: "无效的清理范围，请选择 7、30 或 90 天" },
        { status: 400 }
      );
    }

    // 3. 计算时间阈值
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysAgo);

    logger.info({
      action: "database_cleanup_initiated",
      daysAgo,
      threshold: threshold.toISOString(),
      user: session.user.name,
    });

    // 4. 先查询将要删除的记录数
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageRequest)
      .where(
        and(
          lt(messageRequest.createdAt, threshold),
          isNull(messageRequest.deletedAt)
        )
      );

    const estimatedCount = countResult?.count ?? 0;

    if (estimatedCount === 0) {
      logger.info({
        action: "database_cleanup_no_records",
        daysAgo,
        threshold: threshold.toISOString(),
      });

      return Response.json({
        success: true,
        deletedCount: 0,
        message: "没有符合条件的日志需要清理",
        threshold: threshold.toISOString(),
      });
    }

    // 5. 执行软删除（设置 deleted_at）
    const result = await db
      .update(messageRequest)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          lt(messageRequest.createdAt, threshold),
          isNull(messageRequest.deletedAt)
        )
      )
      .returning({ id: messageRequest.id });

    const deletedCount = result.length;

    logger.info({
      action: "database_cleanup_completed",
      daysAgo,
      threshold: threshold.toISOString(),
      deletedCount,
      estimatedCount,
      user: session.user.name,
    });

    return Response.json({
      success: true,
      deletedCount,
      message: `成功清理 ${deletedCount} 条日志记录`,
      threshold: threshold.toISOString(),
    });
  } catch (error) {
    logger.error({
      action: "database_cleanup_error",
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      {
        success: false,
        deletedCount: 0,
        message: "清理日志失败",
        threshold: "",
      },
      { status: 500 }
    );
  }
}

/**
 * 预估将要删除的记录数
 *
 * GET /api/admin/database/cleanup?daysAgo=7
 *
 * 响应: { count: number }
 */
export async function GET(request: Request) {
  try {
    // 1. 验证管理员权限
    const session = await getSession();
    if (!session || session.user.role !== "admin") {
      logger.warn({ action: "database_cleanup_estimate_unauthorized" });
      return Response.json({ error: "未授权访问" }, { status: 401 });
    }

    // 2. 解析查询参数
    const url = new URL(request.url);
    const daysAgo = parseInt(url.searchParams.get("daysAgo") || "7", 10);

    if (![7, 30, 90].includes(daysAgo)) {
      return Response.json(
        { error: "无效的清理范围，请选择 7、30 或 90 天" },
        { status: 400 }
      );
    }

    // 3. 计算时间阈值并查询
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - daysAgo);

    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageRequest)
      .where(
        and(
          lt(messageRequest.createdAt, threshold),
          isNull(messageRequest.deletedAt)
        )
      );

    return Response.json({
      count: result?.count ?? 0,
      threshold: threshold.toISOString(),
    });
  } catch (error) {
    logger.error({
      action: "database_cleanup_estimate_error",
      error: error instanceof Error ? error.message : String(error),
    });

    return Response.json(
      { error: "查询失败", count: 0 },
      { status: 500 }
    );
  }
}
