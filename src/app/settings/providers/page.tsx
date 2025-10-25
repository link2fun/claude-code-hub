import { getProviders, getProvidersHealthStatus } from "@/actions/providers";
import { getProvidersAnalytics } from "@/actions/provider-analytics";
import { Section } from "@/components/section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProviderManager } from "./_components/provider-manager";
import { AddProviderDialog } from "./_components/add-provider-dialog";
import { SchedulingRulesDialog } from "./_components/scheduling-rules-dialog";
import { ProviderAnalyticsView } from "./_components/provider-analytics";
import { RealtimeScheduleTab } from "./_components/realtime-schedule-tab";
import { SettingsPageHeader } from "../_components/settings-page-header";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsProvidersPage() {
  const [providers, session, healthStatus, analyticsResult] = await Promise.all([
    getProviders(),
    getSession(),
    getProvidersHealthStatus(),
    getProvidersAnalytics(),
  ]);

  const analytics = analyticsResult.ok ? analyticsResult.data.analytics : [];
  const summary = analyticsResult.ok ? analyticsResult.data.summary : undefined;

  return (
    <>
      <SettingsPageHeader
        title="供应商管理"
        description="配置 API 服务商、查看性能分析并管理自动调度策略。"
      />

      <Tabs defaultValue="management" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="management">供应商管理</TabsTrigger>
          <TabsTrigger value="analytics">统计分析</TabsTrigger>
          <TabsTrigger value="realtime-schedule">实时调度</TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="mt-6">
          <Section
            title="服务商管理"
            description="配置上游服务商的金额限流和并发限制，留空表示无限制。"
            actions={
              <div className="flex gap-2">
                <SchedulingRulesDialog />
                <AddProviderDialog />
              </div>
            }
          >
            <ProviderManager
              providers={providers}
              currentUser={session?.user}
              healthStatus={healthStatus}
            />
          </Section>
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <ProviderAnalyticsView
            initialAnalytics={analytics}
            initialSummary={summary}
          />
        </TabsContent>

        <TabsContent value="realtime-schedule" className="mt-6">
          <RealtimeScheduleTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
