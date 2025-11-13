import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db, schema } from "../db";
import { env } from "../env";

async function ensureRole(
  name: string,
  permissions: Array<{
    module: (typeof schema.moduleNameEnum.enumValues)[number];
    canList?: boolean;
    canAdd?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
  }>,
) {
  const existing = await db.query.rolesList.findFirst({
    where: eq(schema.rolesList.roleName, name),
  });

  if (existing) {
    for (const perm of permissions) {
      const existingPerm = await db.query.rolePermissions.findFirst({
        where: (fields, { and, eq: eqOp }) =>
          and(
            eqOp(fields.roleId, existing.id),
            eqOp(fields.module, perm.module),
          ),
      });

      if (!existingPerm) {
        await db.insert(schema.rolePermissions).values({
          roleId: existing.id,
          module: perm.module,
          canList: perm.canList ?? false,
          canAdd: perm.canAdd ?? false,
          canEdit: perm.canEdit ?? false,
          canDelete: perm.canDelete ?? false,
        });
      }
    }
    return existing.id;
  }

  const [role] = await db
    .insert(schema.rolesList)
    .values({ roleName: name })
    .returning();

  if (!role) throw new Error("Failed to create role");

  for (const perm of permissions) {
    await db.insert(schema.rolePermissions).values({
      roleId: role.id,
      module: perm.module,
      canList: perm.canList ?? false,
      canAdd: perm.canAdd ?? false,
      canEdit: perm.canEdit ?? false,
      canDelete: perm.canDelete ?? false,
    });
  }

  return role.id;
}

async function ensureUser({
  email,
  password,
  name,
  discordId,
  roleId,
  department = "curator",
}: {
  email: string;
  password: string;
  name: string;
  discordId?: string;
  roleId: string;
  department?: "curator" | "scraping";
}) {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
    with: {
      accounts: true,
    },
  });

  const hashedPassword = await hashPassword(password);

  if (existing) {
    await db
      .update(schema.users)
      .set({
        name,
        discordId,
        roleId,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, existing.id));

    const passwordAccount = existing.accounts?.find(
      (account) =>
        account.providerId === "credential" && account.accountId === existing.id,
    );

    if (passwordAccount) {
      await db
        .update(schema.accounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, passwordAccount.id));
    } else {
      await db
        .insert(schema.accounts)
        .values({
          userId: existing.id,
          providerId: "credential",
          accountId: existing.id,
          password: hashedPassword,
        });
    }

    return existing.id;
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      discordId,
      roleId,
      department,
      emailVerified: true,
    })
    .returning();

  if (!user) throw new Error("Failed to create user");

  await db.insert(schema.accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashedPassword,
  });

  return user.id;
}

async function main() {
  const adminEmail = env.ADMIN_SEED_EMAIL ?? "admin@example.com";
  const adminPassword = env.ADMIN_SEED_PASSWORD ?? "Passw0rd!";

  const adminRoleId = await ensureRole("Admin", [
    {
      module: "roles",
      canList: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
    },
    {
      module: "users",
      canList: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
    },
    {
      module: "activity_log",
      canList: true,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
    {
      module: "competencies",
      canList: true,
      canAdd: true,
      canEdit: true,
      canDelete: true,
    },
  ]);

  await ensureRole("User", [
    {
      module: "roles",
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
    {
      module: "users",
      canList: true,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
    {
      module: "activity_log",
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
  ]);

  await ensureUser({
    email: adminEmail,
    password: adminPassword,
    name: "Admin",
    discordId: "admin#0001",
    roleId: adminRoleId,
  });

  console.log("Seeded default roles and admin user");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

