import { relations, sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const moduleNameEnum = pgEnum("module_name", ["roles", "users", "activity_log"]);

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
  }),
);

export const accounts = pgTable("auth_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
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
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
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
