import { NextRequest, NextResponse } from "next/server";
import { eq, and, gte, lte, desc, count } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "activity_log", "list");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    throw error;
  }

  const url = new URL(req.url ?? "");
  const page = Number(url.searchParams.get("page")) || 1;
  const pageSize = Number(url.searchParams.get("pageSize")) || 20;
  const userId = url.searchParams.get("userId") ?? undefined;
  const moduleNameParam = url.searchParams.get("module") ?? undefined;
  const actionParam = url.searchParams.get("action") ?? undefined;
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : undefined;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : undefined;

  // Validate enum values
  const moduleName: typeof schema.moduleNameEnum.enumValues[number] | undefined = 
    moduleNameParam && (schema.moduleNameEnum.enumValues as readonly string[]).includes(moduleNameParam)
      ? (moduleNameParam as typeof schema.moduleNameEnum.enumValues[number])
      : undefined;
  const action: typeof schema.actionEnum.enumValues[number] | undefined = 
    actionParam && (schema.actionEnum.enumValues as readonly string[]).includes(actionParam)
      ? (actionParam as typeof schema.actionEnum.enumValues[number])
      : undefined;

  const filters = [];
  if (userId) {
    filters.push(eq(schema.activityLog.userId, userId));
  }
  if (moduleName) {
    filters.push(eq(schema.activityLog.module, moduleName));
  }
  if (action) {
    filters.push(eq(schema.activityLog.action, action));
  }
  if (from) {
    filters.push(gte(schema.activityLog.timestamp, from));
  }
  if (to) {
    filters.push(lte(schema.activityLog.timestamp, to));
  }

  const predicate = filters.length ? and(...filters) : undefined;

  const [results, [{ value: countVal } = { value: 0 }]] = await Promise.all([
    db
      .select({
        ...getTableColumns(schema.activityLog),
        userName: schema.users.name,
        userEmail: schema.users.email,
      })
      .from(schema.activityLog)
      .leftJoin(schema.users, eq(schema.activityLog.userId, schema.users.id))
      .where(predicate)
      .orderBy(desc(schema.activityLog.timestamp))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(schema.activityLog)
      .where(predicate),
  ]);

  return NextResponse.json({ logs: results, count: countVal });
}
