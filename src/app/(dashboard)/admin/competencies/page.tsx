import { Suspense } from "react";
import { desc, eq, and, or, like } from "drizzle-orm";

import { db, schema } from "@/db";
import { getUserPermissions, ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";

import { CompetencyManager } from "./competency-manager";

export default async function CompetenciesPage() {
  const session = await requireSession();
  await ensurePermission(session.user.id, "competencies", "list");

  // Get all competencies with their trainers
  const competenciesData = await db
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
    .where(eq(schema.competencies.isDeleted, false))
    .orderBy(desc(schema.competencies.updatedAt));

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

  for (const row of competenciesData) {
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

  const competencies = Array.from(competencyMap.values());

  // Get users with "Trainer" role for trainer selection
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
    })
    .from(schema.users)
    .innerJoin(schema.rolesList, eq(schema.users.roleId, schema.rolesList.id))
    .where(eq(schema.rolesList.roleName, "Trainer"))
    .orderBy(schema.users.name);

  // Get all competency levels for requirements (only from published competencies)
  const allCompetencyLevels = await db
    .select({
      id: schema.competencyLevels.id,
      competencyId: schema.competencyLevels.competencyId,
      name: schema.competencyLevels.name,
      competencyName: schema.competencies.name,
    })
    .from(schema.competencyLevels)
    .innerJoin(
      schema.competencies,
      eq(schema.competencies.id, schema.competencyLevels.competencyId),
    )
    .where(and(eq(schema.competencies.isDeleted, false), eq(schema.competencies.status, 1)))
    .orderBy(schema.competencies.name, schema.competencyLevels.name);

  const permissions = await getUserPermissions(session.user.id);
  const ability =
    permissions.get("competencies") ?? {
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    };

  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading...</div>}>
      <CompetencyManager
        competencies={competencies}
        users={users}
        competencyLevels={allCompetencyLevels}
        ability={ability}
      />
    </Suspense>
  );
}

