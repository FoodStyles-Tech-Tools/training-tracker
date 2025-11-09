import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, like, desc, asc } from "drizzle-orm";

import { db, schema } from "@/db";
import { PermissionError, ensurePermission } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await ensurePermission(session.user.id, "competencies", "list");
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const searchParams = req.nextUrl.searchParams;
  const name = searchParams.get("name");
  const trainer = searchParams.get("trainer");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") || "1");
  const pageSize = parseInt(searchParams.get("pageSize") || "50");

  // Build where conditions
  const conditions = [eq(schema.competencies.isDeleted, false)];

  if (name) {
    conditions.push(like(schema.competencies.name, `%${name}%`));
  }

  if (status) {
    const statusNum = status === "published" ? 1 : status === "draft" ? 0 : null;
    if (statusNum !== null) {
      conditions.push(eq(schema.competencies.status, statusNum));
    }
  }

  // Get competencies with trainers
  const competencies = await db
    .select({
      id: schema.competencies.id,
      name: schema.competencies.name,
      status: schema.competencies.status,
      updatedAt: schema.competencies.updatedAt,
      trainer: {
        id: schema.users.id,
        name: schema.users.name,
      },
    })
    .from(schema.competencies)
    .leftJoin(
      schema.competenciesTrainer,
      eq(schema.competenciesTrainer.competencyId, schema.competencies.id),
    )
    .leftJoin(schema.users, eq(schema.users.id, schema.competenciesTrainer.trainerUserId))
    .where(and(...conditions))
    .orderBy(desc(schema.competencies.updatedAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  // Get total count
  const totalCount = await db
    .select({ count: schema.competencies.id })
    .from(schema.competencies)
    .where(and(...conditions));

  // Group by competency and collect trainers
  const competencyMap = new Map<
    string,
    {
      id: string;
      name: string;
      status: number;
      updatedAt: Date;
      trainers: Array<{ id: string; name: string }>;
    }
  >();

  for (const row of competencies) {
    if (!row.id) continue;
    if (!competencyMap.has(row.id)) {
      competencyMap.set(row.id, {
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updatedAt,
        trainers: [],
      });
    }
    const comp = competencyMap.get(row.id)!;
    if (row.trainer?.id && row.trainer?.name) {
      // Avoid duplicates
      if (!comp.trainers.some((t) => t.id === row.trainer!.id)) {
        comp.trainers.push({ id: row.trainer.id, name: row.trainer.name });
      }
    }
  }

  // Filter by trainer name if specified
  let filteredCompetencies = Array.from(competencyMap.values());
  if (trainer) {
    filteredCompetencies = filteredCompetencies.filter((comp) =>
      comp.trainers.some((t) => t.name.toLowerCase().includes(trainer.toLowerCase())),
    );
  }

  return NextResponse.json({
    competencies: filteredCompetencies,
    total: totalCount.length,
    page,
    pageSize,
  });
}

