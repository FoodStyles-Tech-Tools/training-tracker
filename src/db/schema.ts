import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const moduleNameEnum = pgEnum("module_name", ["roles", "users", "activity_log", "competencies", "training_batch"]);
export const userStatusEnum = pgEnum("user_status", ["active", "inactive"]);
export const userDepartmentEnum = pgEnum("user_department", ["curator", "scraping"]);

export const rolesList = pgTable(
  "roles_list",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleName: text("role_name").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (roles) => ({
    roleNameIdx: uniqueIndex("roles_list_role_name_idx").on(roles.roleName),
  }),
);

export const rolePermissions = pgTable(
  "roles_permission",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => rolesList.id, { onDelete: "cascade" }),
    module: moduleNameEnum("module").notNull(),
    canList: boolean("can_list").notNull().default(false),
    canAdd: boolean("can_add").notNull().default(false),
    canEdit: boolean("can_edit").notNull().default(false),
    canDelete: boolean("can_delete").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (permissions) => ({
    moduleUniq: uniqueIndex("roles_permission_role_module_idx").on(
      permissions.roleId,
      permissions.module,
    ),
  }),
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    discordId: text("discord_id"),
    status: userStatusEnum("status").notNull().default("active"),
    department: userDepartmentEnum("department").notNull(),
    googleCalendarTag: text("google_calendar_tag"),
    roleId: uuid("role_id").references(() => rolesList.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_date", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_date", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
  },
  (users) => ({
    emailIdx: uniqueIndex("users_email_idx").on(users.email),
    statusIdx: index("users_status_idx").on(users.status),
    departmentIdx: index("users_department_idx").on(users.department),
  }),
);

export const accounts = pgTable("auth_accounts", {
  id: text("id")
    .default(sql<string>`gen_random_uuid()::text`)
    .primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  scope: text("scope"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
    mode: "date",
  }),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const sessions = pgTable("auth_sessions", {
  id: text("id")
    .default(sql<string>`gen_random_uuid()::text`)
    .primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const verifications = pgTable(
  "auth_verification_tokens",
  {
    id: text("id")
      .default(sql<string>`gen_random_uuid()::text`)
      .primaryKey(),
    identifier: text("identifier").notNull(),
    token: text("token")
      .default(sql<string>`gen_random_uuid()::text`)
      .notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (verificationTokens) => ({
    tokenIdx: uniqueIndex("auth_verification_token_idx").on(
      verificationTokens.identifier,
      verificationTokens.token,
    ),
  }),
);

export const actionEnum = pgEnum("action", ["add", "edit", "delete"]);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: moduleNameEnum("module").notNull(),
    action: actionEnum("action").notNull(),
    timestamp: timestamp("timestamp", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    data: text("data"), // Store data as JSON string
  }
);

export const rolesListRelations = relations(rolesList, ({ many }) => ({
  users: many(users),
  permissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(rolesList, {
      fields: [rolePermissions.roleId],
      references: [rolesList.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many, one }) => ({
  role: one(rolesList, {
    fields: [users.roleId],
    references: [rolesList.id],
  }),
  accounts: many(accounts),
  sessions: many(sessions),
  trainerCompetencies: many(competenciesTrainer),
  competencyProgress: many(userCompetencyProgress),
  trainingBatchesAsTrainer: many(trainingBatch),
  trainingBatchesAsLearner: many(trainingBatchLearners),
  attendance: many(trainingBatchAttendanceSessions),
  homework: many(trainingBatchHomeworkSessions),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const verificationsRelations = relations(verifications, ({}) => ({}));

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  user: one(users, {
    fields: [activityLog.userId],
    references: [users.id],
  }),
}));

export type Role = typeof rolesList.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type User = typeof users.$inferSelect;
export const MODULES = moduleNameEnum.enumValues;
export type ModuleName = (typeof MODULES)[number];

// Better Auth expects singular model keys; provide aliases alongside plural tables.
export const user = users;
export const account = accounts;
export const session = sessions;
export const verification = verifications;

export type ActivityLog = typeof activityLog.$inferSelect;

// Competencies tables
export const competencies = pgTable("competencies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"), // Competency description
  status: integer("status").notNull().default(0), // 0=draft, 1=published
  relevantLinks: text("relevant_links"), // Rich text field for relevant links and resources
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const competencyLevels = pgTable(
  "competency_levels",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competencyId: uuid("competency_id")
      .notNull()
      .references(() => competencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // "Basic", "Competent", "Advanced"
    trainingPlanDocument: text("training_plan_document").notNull(),
    teamKnowledge: text("team_knowledge").notNull(), // Rich text
    eligibilityCriteria: text("eligibility_criteria").notNull(), // Rich text
    verification: text("verification").notNull(), // Rich text
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (levels) => ({
    competencyNameIdx: uniqueIndex("competency_levels_competency_name_idx").on(
      levels.competencyId,
      levels.name,
    ),
  }),
);

export const competenciesTrainer = pgTable(
  "competencies_trainer",
  {
    competencyId: uuid("competency_id")
      .notNull()
      .references(() => competencies.id, { onDelete: "cascade" }),
    trainerUserId: uuid("trainer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (trainers) => ({
    pk: primaryKey({ columns: [trainers.competencyId, trainers.trainerUserId] }),
    trainerIdx: index("competencies_trainer_trainer_idx").on(trainers.trainerUserId),
  }),
);

export const competencyRequirements = pgTable(
  "competency_requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competencyId: uuid("competency_id")
      .notNull()
      .references(() => competencies.id, { onDelete: "cascade" }),
    requiredCompetencyLevelId: uuid("required_competency_level_id")
      .notNull()
      .references(() => competencyLevels.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (requirements) => ({
    competencyLevelIdx: uniqueIndex("competency_requirements_competency_level_idx").on(
      requirements.competencyId,
      requirements.requiredCompetencyLevelId,
    ),
    competencyIdx: index("competency_requirements_competency_idx").on(requirements.competencyId),
    levelIdx: index("competency_requirements_level_idx").on(requirements.requiredCompetencyLevelId),
  }),
);

// Competencies relations
export const competenciesRelations = relations(competencies, ({ many }) => ({
  levels: many(competencyLevels),
  trainers: many(competenciesTrainer),
  requirements: many(competencyRequirements),
}));

export const competencyLevelsRelations = relations(competencyLevels, ({ one, many }) => ({
  competency: one(competencies, {
    fields: [competencyLevels.competencyId],
    references: [competencies.id],
  }),
  requirements: many(competencyRequirements),
  userProgress: many(userCompetencyProgress),
  trainingBatches: many(trainingBatch),
}));

export const competenciesTrainerRelations = relations(competenciesTrainer, ({ one }) => ({
  competency: one(competencies, {
    fields: [competenciesTrainer.competencyId],
    references: [competencies.id],
  }),
  trainer: one(users, {
    fields: [competenciesTrainer.trainerUserId],
    references: [users.id],
  }),
}));

export const competencyRequirementsRelations = relations(competencyRequirements, ({ one }) => ({
  competency: one(competencies, {
    fields: [competencyRequirements.competencyId],
    references: [competencies.id],
  }),
  requiredLevel: one(competencyLevels, {
    fields: [competencyRequirements.requiredCompetencyLevelId],
    references: [competencyLevels.id],
  }),
}));

// User competency progress table - tracks which users have achieved which competency levels
export const userCompetencyProgress = pgTable(
  "user_competency_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    competencyLevelId: uuid("competency_level_id")
      .notNull()
      .references(() => competencyLevels.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("in_progress"), // "in_progress", "completed", "verified"
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (progress) => ({
    userLevelIdx: uniqueIndex("user_competency_progress_user_level_idx").on(
      progress.userId,
      progress.competencyLevelId,
    ),
    userIdIdx: index("user_competency_progress_user_idx").on(progress.userId),
    levelIdIdx: index("user_competency_progress_level_idx").on(progress.competencyLevelId),
  }),
);

export const userCompetencyProgressRelations = relations(userCompetencyProgress, ({ one }) => ({
  user: one(users, {
    fields: [userCompetencyProgress.userId],
    references: [users.id],
  }),
  competencyLevel: one(competencyLevels, {
    fields: [userCompetencyProgress.competencyLevelId],
    references: [competencyLevels.id],
  }),
  verifier: one(users, {
    fields: [userCompetencyProgress.verifiedBy],
    references: [users.id],
  }),
}));

export const customNumbering = pgTable("custom_numbering", {
  module: text("module").primaryKey(),
  runningNumber: integer("running_number").notNull(),
});

export const trainingRequest = pgTable(
  "training_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trId: text("tr_id").notNull(),
    requestedDate: timestamp("requested_date", { mode: "date" }).notNull(),
    learnerUserId: uuid("learner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    competencyLevelId: uuid("competency_level_id")
      .notNull()
      .references(() => competencyLevels.id, { onDelete: "cascade" }),
    trainingBatchId: uuid("training_batch_id"), // Will reference training_batch table when it's added
    status: integer("status").notNull().default(0), // 0=Not Started, 1=Looking for trainer, 2=In Queue, 3=No batch match, 4=In Progress, 5=Sessions Completed, 6=On Hold, 7=Drop Off
    onHoldBy: integer("on_hold_by"), // 0=Learner, 1=Trainer
    onHoldReason: text("on_hold_reason"),
    dropOffReason: text("drop_off_reason"),
    isBlocked: boolean("is_blocked").notNull().default(false),
    blockedReason: text("blocked_reason"),
    expectedUnblockedDate: timestamp("expected_unblocked_date", { mode: "date" }),
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    responseDue: timestamp("response_due", { mode: "date" }),
    responseDate: timestamp("response_date", { mode: "date" }),
    definiteAnswer: boolean("definite_answer"),
    noFollowUpDate: timestamp("no_follow_up_date", { mode: "date" }),
    followUpDate: timestamp("follow_up_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (tr) => ({
    trIdIdx: uniqueIndex("training_request_tr_id_idx").on(tr.trId),
    learnerUserIdIdx: index("training_request_learner_user_id_idx").on(tr.learnerUserId),
    competencyLevelIdIdx: index("training_request_competency_level_id_idx").on(
      tr.competencyLevelId,
    ),
    trainingBatchIdIdx: index("training_request_training_batch_id_idx").on(tr.trainingBatchId),
    assignedToIdx: index("training_request_assigned_to_idx").on(tr.assignedTo),
  }),
);

export const trainingRequestRelations = relations(trainingRequest, ({ one }) => ({
  learner: one(users, {
    fields: [trainingRequest.learnerUserId],
    references: [users.id],
  }),
  competencyLevel: one(competencyLevels, {
    fields: [trainingRequest.competencyLevelId],
    references: [competencyLevels.id],
  }),
  assignedUser: one(users, {
    fields: [trainingRequest.assignedTo],
    references: [users.id],
  }),
}));

// Add trainingBatch relation to trainingRequest after trainingBatch is defined
export const trainingRequestRelationsWithBatch = relations(trainingRequest, ({ one }) => ({
  trainingBatch: one(trainingBatch, {
    fields: [trainingRequest.trainingBatchId],
    references: [trainingBatch.id],
  }),
}));

// Training Batch tables
export const trainingBatch = pgTable(
  "training_batch",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    competencyLevelId: uuid("competency_level_id")
      .notNull()
      .references(() => competencyLevels.id, { onDelete: "cascade" }),
    trainerUserId: uuid("trainer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchName: text("batch_name").notNull(),
    sessionCount: integer("session_count").notNull().default(0),
    durationHrs: numeric("duration_hrs"),
    estimatedStart: timestamp("estimated_start", { mode: "date" }),
    batchStartDate: timestamp("batch_start_date", { mode: "date" }),
    capacity: integer("capacity").notNull().default(0),
    currentParticipant: integer("current_participant").notNull().default(0),
    spotLeft: integer("spot_left").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (tb) => ({
    competencyLevelIdIdx: index("training_batch_competency_level_id_idx").on(tb.competencyLevelId),
    trainerUserIdIdx: index("training_batch_trainer_user_id_idx").on(tb.trainerUserId),
  }),
);

export const trainingBatchSessions = pgTable(
  "training_batch_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    trainingBatchId: uuid("training_batch_id")
      .notNull()
      .references(() => trainingBatch.id, { onDelete: "cascade" }),
    sessionNumber: integer("session_number").notNull(),
    sessionDate: timestamp("session_date", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (sessions) => ({
    batchSessionIdx: uniqueIndex("training_batch_sessions_batch_session_idx").on(
      sessions.trainingBatchId,
      sessions.sessionNumber,
    ),
    trainingBatchIdIdx: index("training_batch_sessions_training_batch_id_idx").on(
      sessions.trainingBatchId,
    ),
  }),
);

export const trainingBatchLearners = pgTable(
  "training_batch_learners",
  {
    trainingBatchId: uuid("training_batch_id")
      .notNull()
      .references(() => trainingBatch.id, { onDelete: "cascade" }),
    learnerUserId: uuid("learner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    trainingRequestId: uuid("training_request_id")
      .notNull()
      .references(() => trainingRequest.id, { onDelete: "cascade" }),
  },
  (learners) => ({
    pk: primaryKey({ columns: [learners.trainingBatchId, learners.learnerUserId] }),
    trainingRequestIdIdx: index("training_batch_learners_training_request_id_idx").on(
      learners.trainingRequestId,
    ),
    learnerUserIdIdx: index("training_batch_learners_learner_user_id_idx").on(learners.learnerUserId),
  }),
);

export const trainingBatchAttendanceSessions = pgTable(
  "training_batch_attendance_sessions",
  {
    trainingBatchId: uuid("training_batch_id")
      .notNull()
      .references(() => trainingBatch.id, { onDelete: "cascade" }),
    learnerUserId: uuid("learner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => trainingBatchSessions.id, { onDelete: "cascade" }),
    attended: boolean("attended").notNull().default(false),
  },
  (attendance) => ({
    pk: primaryKey({
      columns: [attendance.trainingBatchId, attendance.learnerUserId, attendance.sessionId],
    }),
    learnerUserIdIdx: index("training_batch_attendance_learner_user_id_idx").on(
      attendance.learnerUserId,
    ),
    sessionIdIdx: index("training_batch_attendance_session_id_idx").on(attendance.sessionId),
  }),
);

export const trainingBatchHomeworkSessions = pgTable(
  "training_batch_homework_sessions",
  {
    trainingBatchId: uuid("training_batch_id")
      .notNull()
      .references(() => trainingBatch.id, { onDelete: "cascade" }),
    learnerUserId: uuid("learner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => trainingBatchSessions.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    homeworkUrl: text("homework_url"),
  },
  (homework) => ({
    pk: primaryKey({
      columns: [homework.trainingBatchId, homework.learnerUserId, homework.sessionId],
    }),
    learnerUserIdIdx: index("training_batch_homework_learner_user_id_idx").on(homework.learnerUserId),
    sessionIdIdx: index("training_batch_homework_session_id_idx").on(homework.sessionId),
  }),
);

// Training Batch relations
export const trainingBatchRelations = relations(trainingBatch, ({ one, many }) => ({
  competencyLevel: one(competencyLevels, {
    fields: [trainingBatch.competencyLevelId],
    references: [competencyLevels.id],
  }),
  trainer: one(users, {
    fields: [trainingBatch.trainerUserId],
    references: [users.id],
  }),
  sessions: many(trainingBatchSessions),
  learners: many(trainingBatchLearners),
  attendance: many(trainingBatchAttendanceSessions),
  homework: many(trainingBatchHomeworkSessions),
}));

export const trainingBatchSessionsRelations = relations(trainingBatchSessions, ({ one, many }) => ({
  trainingBatch: one(trainingBatch, {
    fields: [trainingBatchSessions.trainingBatchId],
    references: [trainingBatch.id],
  }),
  attendance: many(trainingBatchAttendanceSessions),
  homework: many(trainingBatchHomeworkSessions),
}));

export const trainingBatchLearnersRelations = relations(trainingBatchLearners, ({ one }) => ({
  trainingBatch: one(trainingBatch, {
    fields: [trainingBatchLearners.trainingBatchId],
    references: [trainingBatch.id],
  }),
  learner: one(users, {
    fields: [trainingBatchLearners.learnerUserId],
    references: [users.id],
  }),
  trainingRequest: one(trainingRequest, {
    fields: [trainingBatchLearners.trainingRequestId],
    references: [trainingRequest.id],
  }),
}));

export const trainingBatchAttendanceSessionsRelations = relations(
  trainingBatchAttendanceSessions,
  ({ one }) => ({
    trainingBatch: one(trainingBatch, {
      fields: [trainingBatchAttendanceSessions.trainingBatchId],
      references: [trainingBatch.id],
    }),
    learner: one(users, {
      fields: [trainingBatchAttendanceSessions.learnerUserId],
      references: [users.id],
    }),
    session: one(trainingBatchSessions, {
      fields: [trainingBatchAttendanceSessions.sessionId],
      references: [trainingBatchSessions.id],
    }),
  }),
);

export const trainingBatchHomeworkSessionsRelations = relations(
  trainingBatchHomeworkSessions,
  ({ one }) => ({
    trainingBatch: one(trainingBatch, {
      fields: [trainingBatchHomeworkSessions.trainingBatchId],
      references: [trainingBatch.id],
    }),
    learner: one(users, {
      fields: [trainingBatchHomeworkSessions.learnerUserId],
      references: [users.id],
    }),
    session: one(trainingBatchSessions, {
      fields: [trainingBatchHomeworkSessions.sessionId],
      references: [trainingBatchSessions.id],
    }),
  }),
);


export type Competency = typeof competencies.$inferSelect;
export type CompetencyLevel = typeof competencyLevels.$inferSelect;
export type CompetencyTrainer = typeof competenciesTrainer.$inferSelect;
export type CompetencyRequirement = typeof competencyRequirements.$inferSelect;
export type UserCompetencyProgress = typeof userCompetencyProgress.$inferSelect;
export type TrainingRequest = typeof trainingRequest.$inferSelect;
export type TrainingBatch = typeof trainingBatch.$inferSelect;
export type TrainingBatchSession = typeof trainingBatchSessions.$inferSelect;
export type TrainingBatchLearner = typeof trainingBatchLearners.$inferSelect;
export type TrainingBatchAttendanceSession = typeof trainingBatchAttendanceSessions.$inferSelect;
export type TrainingBatchHomeworkSession = typeof trainingBatchHomeworkSessions.$inferSelect;
