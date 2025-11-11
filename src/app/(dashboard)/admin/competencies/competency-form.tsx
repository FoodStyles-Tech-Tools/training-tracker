"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { Competency, CompetencyLevel, CompetencyTrainer, CompetencyRequirement } from "@/db/schema";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QuillEditor } from "@/components/ui/quill-editor";

import { createCompetencyAction, updateCompetencyAction, CompetencyFormInput } from "./actions";

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

const formSchema = z.object({
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
  trainerIds: z.array(z.string()).min(1, "At least one trainer is required"),
  requirementLevelIds: z.array(z.string()).optional().default([]),
});

type FormValues = z.infer<typeof formSchema>;

type CompetencyWithRelations = Competency & {
  levels: CompetencyLevel[];
  trainers: Array<CompetencyTrainer & { trainer: { id: string; name: string } }>;
  requirements: Array<CompetencyRequirement & { requiredLevel: CompetencyLevel & { competency: Competency } }>;
};

interface CompetencyFormProps {
  users: Array<{ id: string; name: string }>;
  competencyLevels: Array<{
    id: string;
    competencyId: string;
    name: string;
    competencyName: string;
  }>;
  competency: CompetencyWithRelations | null;
}

const LEVEL_NAMES = ["Basic", "Competent", "Advanced"] as const;

export function CompetencyForm({ users, competencyLevels, competency }: CompetencyFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);

  const isEditing = Boolean(competency);

  // Initialize form with default values or existing competency data
  const defaultValues: FormValues = competency
    ? {
        name: competency.name,
        description: competency.description || "",
        status: competency.status === 1 ? "published" : "draft",
        relevantLinks: competency.relevantLinks || "",
        levels: LEVEL_NAMES.map((levelName) => {
          const existing = competency.levels.find((l) => l.name === levelName);
          return existing
            ? {
                name: levelName,
                trainingPlanDocument: existing.trainingPlanDocument,
                teamKnowledge: existing.teamKnowledge,
                eligibilityCriteria: existing.eligibilityCriteria,
                verification: existing.verification,
              }
            : {
                name: levelName,
                trainingPlanDocument: "",
                teamKnowledge: "",
                eligibilityCriteria: "",
                verification: "",
              };
        }),
        trainerIds: competency.trainers.map((t) => t.trainerUserId),
        requirementLevelIds: competency.requirements.map((r) => r.requiredCompetencyLevelId),
      }
    : {
        name: "",
        description: "",
        status: "draft",
        relevantLinks: "",
        levels: LEVEL_NAMES.map((name) => ({
          name,
          trainingPlanDocument: "",
          teamKnowledge: "",
          eligibilityCriteria: "",
          verification: "",
        })),
        trainerIds: [],
        requirementLevelIds: [],
      };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const onSubmit = (values: FormValues, publish: boolean = false) => {
    setMessage(null);
    const payload: CompetencyFormInput = {
      name: values.name,
      description: values.description || undefined,
      status: publish ? "published" : "draft",
      relevantLinks: values.relevantLinks || undefined,
      levels: values.levels,
      trainerIds: values.trainerIds,
      requirementLevelIds: values.requirementLevelIds,
    };

    startTransition(async () => {
      try {
        if (isEditing && competency) {
          await updateCompetencyAction(competency.id, payload);
          router.push(`/admin/competencies?action=updated&name=${encodeURIComponent(values.name)}`);
        } else {
          await createCompetencyAction(payload);
          router.push(`/admin/competencies?action=created&name=${encodeURIComponent(values.name)}`);
        }
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to save competency.",
          tone: "error",
        });
      }
    });
  };

  const currentStatus = form.watch("status");
  const isPublished = currentStatus === "published";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {isEditing ? "Edit Competency" : "Create Competency"}
          </h1>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-1 py-1">
          {isPublished ? (
            <span className="inline-block max-w-[140px] rounded-md bg-emerald-500/20 px-2 py-0.5 text-sm font-semibold text-emerald-200">
              Published
            </span>
          ) : (
            <span className="inline-block max-w-[140px] rounded-md bg-amber-500/20 px-2 py-0.5 text-sm font-semibold text-amber-200">
              Draft
            </span>
          )}
        </div>
      </div>

      {message ? <Alert variant={message.tone}>{message.text}</Alert> : null}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <Label htmlFor="competency-name">Competency name</Label>
              <Input
                id="competency-name"
                {...form.register("name")}
                placeholder="e.g. Guest Hospitality Standards"
                disabled={isPending}
              />
              {form.formState.errors.name ? (
                <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="competency-description">Competency Description</Label>
              <Textarea
                id="competency-description"
                {...form.register("description")}
                rows={4}
                placeholder="Enter competency description..."
                disabled={isPending}
              />
              {form.formState.errors.description ? (
                <p className="text-sm text-red-400">{form.formState.errors.description.message}</p>
              ) : null}
            </div>

            <div className="grid gap-5">
              {LEVEL_NAMES.map((levelName, levelIndex) => (
                <Card key={levelName} className="border border-slate-800/80 bg-slate-950/50">
                  <CardContent className="space-y-4 p-6">
                    <h3 className="text-lg font-semibold text-slate-100">{levelName}</h3>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor={`${levelName.toLowerCase()}-plan`}>
                          Training Plan Document
                          {levelName === "Basic" && <span className="text-red-400 ml-1">*</span>}
                        </Label>
                        <Input
                          id={`${levelName.toLowerCase()}-plan`}
                          {...form.register(`levels.${levelIndex}.trainingPlanDocument`)}
                          placeholder="Paste link or reference to the training plan document"
                          disabled={isPending}
                        />
                        {form.formState.errors.levels?.[levelIndex]?.trainingPlanDocument ? (
                          <p className="text-sm text-red-400">
                            {form.formState.errors.levels[levelIndex]?.trainingPlanDocument?.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${levelName.toLowerCase()}-knowledge`}>
                          What team member should know
                          {levelName === "Basic" && <span className="text-red-400 ml-1">*</span>}
                        </Label>
                        <Controller
                          name={`levels.${levelIndex}.teamKnowledge`}
                          control={form.control}
                          render={({ field }) => (
                            <QuillEditor
                              id={`${levelName.toLowerCase()}-knowledge`}
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={
                                levelName === "Basic"
                                  ? "Describe the foundational expectations for a team member."
                                  : levelName === "Competent"
                                    ? "Describe what a competent team member should demonstrate."
                                    : "Describe the level of mastery for advanced team members."
                              }
                              disabled={isPending}
                            />
                          )}
                        />
                        {form.formState.errors.levels?.[levelIndex]?.teamKnowledge ? (
                          <p className="text-sm text-red-400">
                            {form.formState.errors.levels[levelIndex]?.teamKnowledge?.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${levelName.toLowerCase()}-eligibility`}>
                          Eligibility criteria
                          {levelName === "Basic" && <span className="text-red-400 ml-1">*</span>}
                        </Label>
                        <Controller
                          name={`levels.${levelIndex}.eligibilityCriteria`}
                          control={form.control}
                          render={({ field }) => (
                            <QuillEditor
                              id={`${levelName.toLowerCase()}-eligibility`}
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={
                                levelName === "Basic"
                                  ? "Prerequisites to begin Basic level competency."
                                  : levelName === "Competent"
                                    ? "Prerequisites required to attempt Competent level."
                                    : "Prerequisites needed for Advanced level assessment."
                              }
                              disabled={isPending}
                            />
                          )}
                        />
                        {form.formState.errors.levels?.[levelIndex]?.eligibilityCriteria ? (
                          <p className="text-sm text-red-400">
                            {form.formState.errors.levels[levelIndex]?.eligibilityCriteria?.message}
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${levelName.toLowerCase()}-verification`}>
                          Verification
                          {levelName === "Basic" && <span className="text-red-400 ml-1">*</span>}
                        </Label>
                        <Controller
                          name={`levels.${levelIndex}.verification`}
                          control={form.control}
                          render={({ field }) => (
                            <QuillEditor
                              id={`${levelName.toLowerCase()}-verification`}
                              value={field.value}
                              onChange={field.onChange}
                              placeholder={
                                levelName === "Basic"
                                  ? "How trainers validate Basic competency completion."
                                  : levelName === "Competent"
                                    ? "How trainers verify the Competent level."
                                    : "How trainers certify the Advanced level."
                              }
                              disabled={isPending}
                            />
                          )}
                        />
                        {form.formState.errors.levels?.[levelIndex]?.verification ? (
                          <p className="text-sm text-red-400">
                            {form.formState.errors.levels[levelIndex]?.verification?.message}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-100">Trainer</h2>
              <p className="text-sm text-slate-400">
                Assign at least one trainer responsible for coaching and verification.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-900/50 p-3 hover:bg-slate-900/70 cursor-pointer"
                >
                  <Checkbox
                    checked={form.watch("trainerIds").includes(user.id)}
                    onChange={(event) => {
                      const current = form.getValues("trainerIds");
                      if (event.target.checked) {
                        form.setValue("trainerIds", [...current, user.id]);
                      } else {
                        form.setValue(
                          "trainerIds",
                          current.filter((id) => id !== user.id),
                        );
                      }
                    }}
                    disabled={isPending}
                  />
                  <p className="text-sm font-medium text-slate-100">{user.name}</p>
                </label>
              ))}
            </div>
            {form.formState.errors.trainerIds ? (
              <p className="text-sm text-red-400">{form.formState.errors.trainerIds.message}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-100">Relevant Links</h2>
            </div>
            <div className="space-y-2">
              <Controller
                name="relevantLinks"
                control={form.control}
                render={({ field }) => (
                  <QuillEditor
                    value={field.value || ""}
                    onChange={field.onChange}
                    placeholder="Add relevant links and resources."
                    disabled={isPending}
                  />
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-100">Requirements</h2>
              <p className="text-sm text-slate-400">
                Select required competencies and levels for this competency.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80">
                    <th className="px-4 py-3 text-left font-medium text-slate-300">Competency</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">Basic</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">Competent</th>
                    <th className="px-4 py-3 text-center font-medium text-slate-300">Advanced</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {competencyLevels
                    .filter((level) => {
                      // Don't show requirements for the current competency being edited
                      if (isEditing && competency) {
                        return level.competencyId !== competency.id;
                      }
                      return true;
                    })
                    .reduce((acc, level) => {
                      const existing = acc.find((item) => item.competencyId === level.competencyId);
                      if (existing) {
                        existing.levels.push(level);
                      } else {
                        acc.push({
                          competencyId: level.competencyId,
                          competencyName: level.competencyName,
                          levels: [level],
                        });
                      }
                      return acc;
                    }, [] as Array<{ competencyId: string; competencyName: string; levels: typeof competencyLevels }>)
                    .map((item) => (
                      <tr key={item.competencyId} className="hover:bg-slate-900/60">
                        <td className="px-4 py-3 text-slate-100">{item.competencyName}</td>
                        {["Basic", "Competent", "Advanced"].map((levelName) => {
                          const level = item.levels.find((l) => l.name === levelName);
                          if (!level) return <td key={levelName} className="px-4 py-3"></td>;
                          const isChecked = form
                            .watch("requirementLevelIds")
                            .includes(level.id);
                          return (
                            <td key={levelName} className="px-4 py-3 text-center">
                              <Checkbox
                                checked={isChecked}
                                onChange={(event) => {
                                  const current = form.getValues("requirementLevelIds");
                                  if (event.target.checked) {
                                    form.setValue("requirementLevelIds", [...current, level.id]);
                                  } else {
                                    form.setValue(
                                      "requirementLevelIds",
                                      current.filter((id) => id !== level.id),
                                    );
                                  }
                                }}
                                disabled={isPending}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/competencies">
            <Button type="button" variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.handleSubmit((values) => onSubmit(values, false))();
              }}
              disabled={isPending}
            >
              Save draft
            </Button>
            <Button
              type="button"
              onClick={() => {
                form.handleSubmit((values) => onSubmit(values, true))();
              }}
              disabled={isPending}
            >
              {isPending ? "Saving..." : "Publish"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

