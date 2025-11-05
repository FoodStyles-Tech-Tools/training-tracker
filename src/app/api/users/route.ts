import { NextResponse } from "next/server";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function GET() {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "users", "list");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    throw error;
  }

  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .orderBy(schema.users.name);
  return NextResponse.json({ users });
}
