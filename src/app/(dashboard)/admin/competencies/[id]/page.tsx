import { db, schema } from "@/db";
import { ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { eq, and } from "drizzle-orm";
import { notFound } from "next/navigation";

import { CompetencyForm } from "../competency-form";

export default async function EditCompetencyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "competencies", "edit");

  const { id } = await params;

  // Get competency with levels, trainers, and requirements
  const competency = await db.query.competencies.findFirst({
    where: and(eq(schema.competencies.id, id), eq(schema.competencies.isDeleted, false)),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
        orderBy: schema.competencyLevels.name,
      },
      trainers: {
        with: {
          trainer: true,
        },
      },
      requirements: {
        with: {
          requiredLevel: {
            with: {
              competency: true,
            },
          },
        },
      },
    },
  });

  if (!competency) {
    notFound();
  }

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

  return (
    <CompetencyForm
      users={users}
      competencyLevels={allCompetencyLevels}
      competency={competency}
    />
  );
}

