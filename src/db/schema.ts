import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const moduleNameEnum = pgEnum("module_name", ["roles", "users", "activity_log", "competencies"]);
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

export type Competency = typeof competencies.$inferSelect;
export type CompetencyLevel = typeof competencyLevels.$inferSelect;
export type CompetencyTrainer = typeof competenciesTrainer.$inferSelect;
export type CompetencyRequirement = typeof competencyRequirements.$inferSelect;
export type UserCompetencyProgress = typeof userCompetencyProgress.$inferSelect;
