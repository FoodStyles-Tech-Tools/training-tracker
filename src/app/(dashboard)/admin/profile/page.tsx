import { eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/session";

export default async function ProfilePage() {
  const session = await requireSession();

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, session.user.id),
    with: {
      role: true,
    },
  });

  if (!user) {
    return null;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-slate-400">
          Personal details associated with your admin account.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <p className="text-slate-400">Name</p>
            <p className="font-medium text-slate-100">{user.name}</p>
          </div>
          <div>
            <p className="text-slate-400">Email</p>
            <p className="font-medium text-slate-100">{user.email}</p>
          </div>
          <div>
            <p className="text-slate-400">Role</p>
            <p className="font-medium text-slate-100">{user.role?.roleName ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-400">Discord ID</p>
            <p className="font-medium text-slate-100">{user.discordId ?? "-"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
