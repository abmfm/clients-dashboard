"use client";

import { PageHeading } from "@/components/PageHeading";
import { RequestSessionButton } from "@/components/RequestSessionButton";
import { Card } from "@/components/ui/Card";
import { RequestsTable } from "@/components/tables/RequestsTable";
import { useI18n } from "@/lib/i18n/provider";
import type { ClientStats, SessionRequest } from "@/lib/types";

export function RequestsView({
  clientId,
  requests,
  stats,
}: {
  clientId: string;
  requests: SessionRequest[];
  stats: ClientStats | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <PageHeading
        title={t.client.bookingsTitle}
        subtitle={t.client.bookingsSubtitle}
        action={
          <div className="flex flex-wrap gap-2">
            <RequestSessionButton
              clientId={clientId}
              mode="package"
              sessionsLeft={stats?.sessions_left ?? 0}
            />
            <RequestSessionButton clientId={clientId} variant="ghost" />
          </div>
        }
      />
      <Card className="pt-5">
        <RequestsTable requests={requests} />
      </Card>
    </>
  );
}
