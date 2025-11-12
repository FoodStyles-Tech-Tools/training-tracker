import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { eq } from "drizzle-orm";

import { db, schema } from "../db";

interface CSVRow {
  status: string;
  role: string;
  name: string;
  email: string;
  discord_user_id: string;
}

function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split("\n");
  const headers = lines[0]?.split(",").map((h) => h.trim()) ?? [];
  
  const rows: CSVRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    
    // Simple CSV parsing (handles quoted fields)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    if (values.length >= headers.length) {
      const row: any = {};
      headers.forEach((header, idx) => {
        row[header] = values[idx] ?? "";
      });
      rows.push(row as CSVRow);
    }
  }
  
  return rows;
}

function mapStatus(status: string): "active" | "inactive" {
  const normalized = status.toLowerCase().trim();
  if (normalized === "active") return "active";
  return "inactive";
}

function mapDepartment(role: string): "curator" | "scraping" {
  const normalized = role.toLowerCase().trim();
  if (normalized === "curator") return "curator";
  if (normalized === "scraper") return "scraping";
  // Default to curator if role is empty or unknown
  return "curator";
}

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
        where: (fields, { and: andOp, eq: eqOp }) =>
          andOp(
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

async function importTeamList() {
  try {
    console.log("Ensuring Learner role exists...");
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
    console.log(`Learner role ID: ${learnerRoleId}`);
    
    console.log("Reading teamList.csv...");
    const csvPath = join(process.cwd(), "teamList.csv");
    const csvContent = readFileSync(csvPath, "utf-8");
    const rows = parseCSV(csvContent);
    
    console.log(`Found ${rows.length} rows to import`);
    
    const EXCEPTION_EMAIL = "claudy.novianto@foodstyles.com";
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const row of rows) {
      // Skip rows with empty email
      if (!row.email?.trim()) {
        console.log(`Skipping row with empty email: ${row.name}`);
        skipped++;
        continue;
      }
      
      const email = row.email.trim();
      const name = row.name.trim();
      const discordId = row.discord_user_id?.trim() || null;
      const status = mapStatus(row.status || "Active");
      const department = mapDepartment(row.role || "");
      
      // Assign role: Learner for everyone except claudy.novianto@foodstyles.com
      const roleId = email.toLowerCase() === EXCEPTION_EMAIL.toLowerCase() ? null : learnerRoleId;
      
      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
        with: {
          accounts: true,
        },
      });
      
      if (existingUser) {
        // Update existing user
        await db
          .update(schema.users)
          .set({
            name,
            discordId,
            status,
            department,
            roleId,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, existingUser.id));
        
        // Check if auth account exists
        const passwordAccount = existingUser.accounts?.find(
          (account) =>
            account.providerId === "credential" && account.accountId === existingUser.id,
        );
        
        if (passwordAccount) {
          // Update password to empty (null)
          await db
            .update(schema.accounts)
            .set({
              password: null,
              updatedAt: new Date(),
            })
            .where(eq(schema.accounts.id, passwordAccount.id));
        } else {
          // Create auth account with empty password (null)
          await db.insert(schema.accounts).values({
            userId: existingUser.id,
            providerId: "credential",
            accountId: existingUser.id,
            password: null,
          });
        }
        
        updated++;
        const roleText = roleId ? "Learner" : "No role";
        console.log(`Updated: ${name} (${email}) - ${roleText}`);
      } else {
        // Create new user
        const [user] = await db
          .insert(schema.users)
          .values({
            name,
            email,
            discordId,
            status,
            department,
            roleId,
            emailVerified: true,
          })
          .returning();
        
        if (!user) {
          console.error(`Failed to create user: ${name} (${email})`);
          skipped++;
          continue;
        }
        
        // Create auth account with empty password (null)
        await db.insert(schema.accounts).values({
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: null,
        });
        
        imported++;
        const roleText = roleId ? "Learner" : "No role";
        console.log(`Imported: ${name} (${email}) - ${roleText}`);
      }
    }
    
    console.log("\nImport completed!");
    console.log(`  Imported: ${imported}`);
    console.log(`  Updated: ${updated}`);
    console.log(`  Skipped: ${skipped}`);
    console.log(`  Total: ${imported + updated + skipped}`);
  } catch (error) {
    console.error("Error importing team list:", error);
    throw error;
  }
}

importTeamList()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

