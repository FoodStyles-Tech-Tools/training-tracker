"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import { db, schema } from "@/db";
import { ensurePermission } from "@/lib/permissions";
import { requireSession } from "@/lib/session";
import { logActivity } from "@/lib/utils-server";

const userSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  discordId: z.string().optional(),
  roleId: z.string().uuid("Choose a valid role"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .optional(),
});

export type UserFormInput = z.infer<typeof userSchema>;

function parseUserInput(input: UserFormInput) {
  try {
    return userSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fallback = "Please check the form and try again.";
      const message =
        (error.issues ?? [])
          .map((issue) => issue.message?.trim())
          .filter(Boolean)
          .join(" ") || fallback;

      throw new Error(message);
    }

    throw error;
  }
}

export async function createUserAction(input: UserFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "users", "add");

  const parsed = parseUserInput(input);

  if (!parsed.password) {
    throw new Error("Password is required when creating a user");
  }

  const existingUser = await db.query.users.findFirst({
    where: eq(schema.users.email, parsed.email),
  });

  if (existingUser) {
    throw new Error("A user with that email already exists");
  }

  const [user] = await db
    .insert(schema.users)
    .values({
      name: parsed.name,
      email: parsed.email,
      discordId: parsed.discordId,
      roleId: parsed.roleId,
      emailVerified: true,
    })
    .returning();

  if (!user) {
    throw new Error("Failed to create user");
  }

  const hashedPassword = await hashPassword(parsed.password);
  await db.insert(schema.accounts).values({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashedPassword,
  });

  // Log user creation
  await logActivity({
    userId: session.user.id,
    module: "users",
    action: "add",
    data: {
      createdId: user.id,
      name: parsed.name,
      email: parsed.email,
      roleId: parsed.roleId,
    },
  });

  revalidatePath("/admin/users");
  return user.id;
}

export async function updateUserAction(id: string, input: UserFormInput) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "users", "edit");

  const parsed = parseUserInput(input);
  await db
    .update(schema.users)
    .set({
      name: parsed.name,
      email: parsed.email,
      discordId: parsed.discordId,
      roleId: parsed.roleId,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, id));
  if (parsed.password) {
    const hashedPassword = await hashPassword(parsed.password);
    const existingAccount = await db.query.accounts.findFirst({
      where: (account, { and, eq: eqOp }) =>
        and(eqOp(account.userId, id), eqOp(account.providerId, "credential")),
    });
    if (existingAccount) {
      await db
        .update(schema.accounts)
        .set({
          accountId: id,
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, existingAccount.id));
    } else {
      await db.insert(schema.accounts).values({
        userId: id,
        providerId: "credential",
        accountId: id,
        password: hashedPassword,
      });
    }
  }
  // Log user update
  await logActivity({
    userId: session.user.id,
    module: "users",
    action: "edit",
    data: {
      updatedId: id,
      ...parsed,
    },
  });
  revalidatePath("/admin/users");
}

export async function deleteUserAction(id: string) {
  const session = await requireSession();
  await ensurePermission(session.user.id, "users", "delete");

  // Fetch user before delete for log (get email/name)
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, id),
  });
  await db.delete(schema.users).where(eq(schema.users.id, id));
  // Log user deletion
  await logActivity({
    userId: session.user.id,
    module: "users",
    action: "delete",
    data: {
      deletedId: id,
      email: user?.email,
      name: user?.name,
    },
  });
  revalidatePath("/admin/users");
}

