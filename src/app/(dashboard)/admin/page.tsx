import { count } from "drizzle-orm";

import { db, schema } from "@/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";

export default async function AdminDashboardPage() {
  await requireSession();

  const [userCount] = await db
    .select({ value: count() })
    .from(schema.users);
  const [roleCount] = await db
    .select({ value: count() })
    .from(schema.rolesList);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-400">
          Overview of your workspace at a glance.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Users</CardTitle>
            <CardDescription>Members who can sign in to the panel.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{userCount?.value ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
            <CardDescription>Available role definitions with permissions.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{roleCount?.value ?? 0}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

