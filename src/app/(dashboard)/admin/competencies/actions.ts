"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/db";
import { ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/utils-server";

const competencyLevelSchema = z
  .object({
    name: z.enum(["Basic", "Competent", "Advanced"]),
    trainingPlanDocument: z.string(),
    teamKnowledge: z.string(),
    eligibilityCriteria: z.string(),
    verification: z.string(),
  })
  .refine(
    (data) => {
      // Basic level requires all fields
      if (data.name === "Basic") {
        return (
          data.trainingPlanDocument.trim().length > 0 &&
          data.teamKnowledge.trim().length > 0 &&
          data.eligibilityCriteria.trim().length > 0 &&
          data.verification.trim().length > 0
        );
      }
      // Competent and Advanced are optional
      return true;
    },
    {
      message: "Basic level requires all fields to be filled",
      path: ["name"],
    },
  );

const competencySchema = z.object({
  name: z.string().min(1, "Competency name is required"),
  description: z.string().optional(),
  status: z.enum(["draft", "published"]).default("draft"),
  relevantLinks: z.string().optional(),
  levels: z
    .array(competencyLevelSchema)
    .min(1, "At least one level is required")
    .refine(
      (levels) => {
        // Must have Basic level
        const hasBasic = levels.some((level) => level.name === "Basic");
        if (!hasBasic) {
          return false;
        }
        // Basic level must have all required fields
        const basicLevel = levels.find((level) => level.name === "Basic");
        if (basicLevel) {
          return (
            basicLevel.trainingPlanDocument.trim().length > 0 &&
            basicLevel.teamKnowledge.trim().length > 0 &&
            basicLevel.eligibilityCriteria.trim().length > 0 &&
            basicLevel.verification.trim().length > 0
          );
        }
        return true;
      },
      {
        message: "Basic level is required and all its fields must be filled",
      },
    ),
  trainerIds: z.array(z.string().uuid()).min(1, "At least one trainer is required"),
  requirementLevelIds: z.array(z.string().uuid()).optional().default([]),
});

export type CompetencyFormInput = z.infer<typeof competencySchema>;

// Helper function to clean empty HTML content from Quill editor
function cleanHtmlContent(html: string | undefined | null): string | null {
  if (!html) return null;
  const trimmed = html.trim();
  // Check if it's empty HTML tags like <p></p>, <p><br></p>, etc.
  if (
    trimmed === "" ||
    trimmed === "<p></p>" ||
    trimmed === "<p><br></p>" ||
    trimmed === "<p><br/></p>" ||
    trimmed === "<br>" ||
    trimmed === "<br/>" ||
    trimmed === "<br />"
  ) {
    return null;
  }
  // Return trimmed content if it has actual content
  return trimmed.length > 0 ? trimmed : null;
}

// Helper function to strip HTML and trim competency name - only save plain text
function cleanCompetencyName(name: string): string {
  if (!name) return "";
  
  // Strip HTML tags using regex
  const stripped = name.replace(/<[^>]*>/g, "");
  
  // Decode HTML entities (basic ones)
  const decoded = stripped
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Trim whitespace
  return decoded.trim();
}

export async function createCompetencyAction(input: CompetencyFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "competencies", "add");

  const parsed = competencySchema.parse(input);

  try {
    // Prepare values with proper null handling
    const description = cleanHtmlContent(parsed.description);
    const relevantLinks = cleanHtmlContent(parsed.relevantLinks);
    
    // Build values object - use undefined to omit fields, null for explicit null values
    const values: {
      name: string;
      description?: string | null;
      status: number;
      relevantLinks?: string | null;
    } = {
      name: cleanCompetencyName(parsed.name),
      status: parsed.status === "published" ? 1 : 0,
    };

    // Set description - use null for empty content (Drizzle will handle null for nullable fields)
    values.description = description;

    // Set relevantLinks - use null for empty content (Drizzle will handle null for nullable fields)
    values.relevantLinks = relevantLinks;

    // Create competency
    const [competency] = await db
      .insert(schema.competencies)
      .values(values)
      .returning();

    if (!competency) {
      throw new Error("Failed to create competency");
    }

  // Create competency levels
  const levelIds: string[] = [];
  for (const level of parsed.levels) {
    const [levelRecord] = await db
      .insert(schema.competencyLevels)
      .values({
        competencyId: competency.id,
        name: level.name,
        trainingPlanDocument: level.trainingPlanDocument.trim(),
        teamKnowledge: cleanHtmlContent(level.teamKnowledge) || "",
        eligibilityCriteria: cleanHtmlContent(level.eligibilityCriteria) || "",
        verification: cleanHtmlContent(level.verification) || "",
      })
      .returning();
    if (levelRecord) {
      levelIds.push(levelRecord.id);
    }
  }

  // Create trainer associations
  if (parsed.trainerIds.length > 0) {
    await db.insert(schema.competenciesTrainer).values(
      parsed.trainerIds.map((trainerId) => ({
        competencyId: competency.id,
        trainerUserId: trainerId,
      })),
    );
  }

  // Create requirement associations
  if (parsed.requirementLevelIds && parsed.requirementLevelIds.length > 0) {
    await db.insert(schema.competencyRequirements).values(
      parsed.requirementLevelIds.map((levelId) => ({
        competencyId: competency.id,
        requiredCompetencyLevelId: levelId,
      })),
    );
  }

    // Log activity
    const cleanedName = cleanCompetencyName(parsed.name);
    await logActivity({
      userId: session.user.id,
      module: "competencies",
      action: "add",
      data: {
        createdId: competency.id,
        name: cleanedName,
        status: parsed.status,
      },
    });

    revalidatePath("/admin/competencies");
    return competency.id;
  } catch (error) {
    // Log the actual error for debugging
    console.error("Database error creating competency:", error);
    // Re-throw with more context
    if (error instanceof Error) {
      throw new Error(`Failed to create competency: ${error.message}`);
    }
    throw error;
  }
}

export async function updateCompetencyAction(id: string, input: CompetencyFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "competencies", "edit");

  const parsed = competencySchema.parse(input);

  // Update competency
  await db
    .update(schema.competencies)
    .set({
      name: cleanCompetencyName(parsed.name),
      description: cleanHtmlContent(parsed.description),
      status: parsed.status === "published" ? 1 : 0,
      relevantLinks: cleanHtmlContent(parsed.relevantLinks),
      updatedAt: new Date(),
    })
    .where(eq(schema.competencies.id, id));

  // Delete existing levels
  await db.delete(schema.competencyLevels).where(eq(schema.competencyLevels.competencyId, id));

  // Create new levels
  for (const level of parsed.levels) {
    await db.insert(schema.competencyLevels).values({
      competencyId: id,
      name: level.name,
      trainingPlanDocument: level.trainingPlanDocument.trim(),
      teamKnowledge: cleanHtmlContent(level.teamKnowledge) || "",
      eligibilityCriteria: cleanHtmlContent(level.eligibilityCriteria) || "",
      verification: cleanHtmlContent(level.verification) || "",
    });
  }

  // Delete existing trainer associations
  await db.delete(schema.competenciesTrainer).where(eq(schema.competenciesTrainer.competencyId, id));

  // Create new trainer associations
  if (parsed.trainerIds.length > 0) {
    await db.insert(schema.competenciesTrainer).values(
      parsed.trainerIds.map((trainerId) => ({
        competencyId: id,
        trainerUserId: trainerId,
      })),
    );
  }

  // Delete existing requirement associations
  await db
    .delete(schema.competencyRequirements)
    .where(eq(schema.competencyRequirements.competencyId, id));

  // Create new requirement associations
  if (parsed.requirementLevelIds && parsed.requirementLevelIds.length > 0) {
    await db.insert(schema.competencyRequirements).values(
      parsed.requirementLevelIds.map((levelId) => ({
        competencyId: id,
        requiredCompetencyLevelId: levelId,
      })),
    );
  }

  // Log activity
  const cleanedName = cleanCompetencyName(parsed.name);
  await logActivity({
    userId: session.user.id,
    module: "competencies",
    action: "edit",
    data: {
      updatedId: id,
      name: cleanedName,
      status: parsed.status,
    },
  });

  revalidatePath("/admin/competencies");
  revalidatePath(`/admin/competencies/${id}`);
}

export async function deleteCompetencyAction(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "competencies", "delete");

  // Fetch competency before deletion for log
  const competency = await db.query.competencies.findFirst({
    where: eq(schema.competencies.id, id),
  });

  // Soft delete competency
  await db
    .update(schema.competencies)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(schema.competencies.id, id));

  // Soft delete associated competency levels
  await db
    .update(schema.competencyLevels)
    .set({ isDeleted: true, updatedAt: new Date() })
    .where(eq(schema.competencyLevels.competencyId, id));

  // Log activity
  await logActivity({
    userId: session.user.id,
    module: "competencies",
    action: "delete",
    data: {
      deletedId: id,
      name: competency?.name,
    },
  });

  revalidatePath("/admin/competencies");
}

