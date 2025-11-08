import "dotenv/config";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { db, schema } from "../src/db";

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

async function createLearnerUser({
  email,
  password,
  name,
  discordId,
  roleId,
  department,
  status = "active" as const,
}: {
  email: string;
  password: string;
  name: string;
  discordId?: string;
  roleId: string;
  department: "curator" | "scraping";
  status?: "active" | "inactive";
}) {
  const existing = await db.query.users.findFirst({
    where: eq(schema.users.email, email),
  });

  if (existing) {
    console.log(`User ${email} already exists, skipping...`);
    return existing.id;
  }

  const hashedPassword = await hashPassword(password);

  const [user] = await db
    .insert(schema.users)
    .values({
      name,
      email,
      discordId,
      roleId,
      status,
      department,
      emailVerified: true,
    })
    .returning();

  if (!user) throw new Error(`Failed to create user ${email}`);

  await db.insert(schema.accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashedPassword,
  });

  return user.id;
}

async function main() {
  console.log("Creating Learner role...");
  const learnerRoleId = await ensureRole("Learner", [
    {
      module: "roles",
      canList: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
    {
      module: "users",
      canList: false,
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

  console.log("Creating 10 more learner users...");
  const departments: ("curator" | "scraping")[] = ["curator", "scraping"];
  const firstNames = [
    "Uma",
    "Victor",
    "Wendy",
    "Xavier",
    "Yara",
    "Zoe",
    "Alex",
    "Bella",
    "Cameron",
    "Dylan",
  ];
  const lastNames = [
    "Underwood",
    "Vargas",
    "Wilson",
    "Xu",
    "Yamamoto",
    "Zhang",
    "Adams",
    "Baker",
    "Clark",
    "Diaz",
  ];

  const defaultPassword = "Learner123!";
  const startIndex = 21; // Start from learner21

  for (let i = 0; i < 10; i++) {
    const firstName = firstNames[i]!;
    const lastName = lastNames[i]!;
    const name = `${firstName} ${lastName}`;
    const learnerNumber = startIndex + i;
    const email = `learner${learnerNumber}@example.com`;
    const discordId = `learner${learnerNumber}#${String(learnerNumber).padStart(4, "0")}`;
    const department = departments[i % 2]!; // Alternate between curator and scraping

    try {
      await createLearnerUser({
        email,
        password: defaultPassword,
        name,
        discordId,
        roleId: learnerRoleId,
        department,
        status: "active",
      });
      console.log(`✓ Created learner ${learnerNumber}: ${name} (${email})`);
    } catch (error) {
      console.error(`✗ Failed to create learner ${learnerNumber}: ${name}`, error);
    }
  }

  console.log("\nDone! Created 10 more learner users.");
  console.log(`Default password for all learners: ${defaultPassword}`);
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

