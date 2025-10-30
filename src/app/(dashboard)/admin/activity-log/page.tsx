import { desc } from "drizzle-orm";

import { db, schema } from "@/db";
import { ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { ActivityLogManager } from "./activity-log-manager";

export default async function ActivityLogPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "activity_log", "list");

  const logs = await db.query.activityLog.findMany({
    orderBy: desc(schema.activityLog.timestamp),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity Log</h1>
        <p className="text-sm text-slate-400">
          Review all recorded add, edit, and delete actions across modules.
        </p>
      </div>

      <ActivityLogManager logs={logs} />
    </div>
  );
}

