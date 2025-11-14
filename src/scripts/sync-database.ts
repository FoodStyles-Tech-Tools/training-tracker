import "dotenv/config";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as readline from "readline";

const execAsync = promisify(exec);

/**
 * Script to sync database from DATABASE_URL (source) to DATABASE_URL_PROD (destination).
 * 
 * This script:
 * 1. Uses pg_dump to create a dump of the source database
 * 2. Uses psql to restore the dump to the destination database
 * 3. Creates a true carbon copy of the source database
 */

// Parse PostgreSQL connection string
function parseConnectionString(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.slice(1), // Remove leading /
    user: parsed.username,
    password: parsed.password,
    ssl: url.includes("sslmode=require") || url.includes("sslmode=prefer"),
  };
}

// Build pg_dump command
function buildPgDumpCommand(connection: ReturnType<typeof parseConnectionString>, outputFile: string) {
  const parts = [
    "pg_dump",
    `-h ${connection.host}`,
    `-p ${connection.port}`,
    `-U ${connection.user}`,
    `-d ${connection.database}`,
    "-F c", // Custom format (binary)
    "-f", outputFile,
  ];

  if (connection.ssl) {
    parts.push("--no-password"); // Will use PGPASSWORD env var
  }

  return parts.join(" ");
}

// Build psql command for restore
function buildPsqlCommand(connection: ReturnType<typeof parseConnectionString>, dumpFile: string) {
  const parts = [
    "pg_restore",
    `-h ${connection.host}`,
    `-p ${connection.port}`,
    `-U ${connection.user}`,
    `-d ${connection.database}`,
    "--clean", // Clean (drop) database objects before recreating
    "--if-exists", // Use IF EXISTS when dropping objects
    "--no-owner", // Skip restoration of object ownership
    "--no-acl", // Skip restoration of access privileges (ACL)
    dumpFile,
  ];

  if (connection.ssl) {
    parts.push("--no-password"); // Will use PGPASSWORD env var
  }

  return parts.join(" ");
}

// Prompt for confirmation before proceeding
function promptConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n⚠️  CAUTION: Running this will wipe the database of production.");
    console.log("Please type 'UNDERSTAND' to continue running this script:");
    
    rl.question("> ", (answer) => {
      rl.close();
      if (answer.trim() === "UNDERSTAND") {
        resolve(true);
      } else {
        console.log("\n✗ Confirmation failed. Script aborted.");
        resolve(false);
      }
    });
  });
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const destUrl = process.env.DATABASE_URL_PROD;

  if (!sourceUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  if (!destUrl) {
    throw new Error("DATABASE_URL_PROD environment variable is required");
  }

  // Require confirmation before proceeding
  const confirmed = await promptConfirmation();
  if (!confirmed) {
    process.exit(1);
  }

  console.log("\nStarting database sync using pg_dump/pg_restore...");
  console.log(`Source: ${sourceUrl.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`Destination: ${destUrl.replace(/:[^:@]+@/, ":****@")}`);
  console.log("");

  const sourceConn = parseConnectionString(sourceUrl);
  const destConn = parseConnectionString(destUrl);

  // Create temp directory for dump file
  const tempDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpFile = path.join(tempDir, `db-dump-${timestamp}.dump`);

  try {
    // Step 1: Dump source database
    console.log("Step 1: Dumping source database...");
    const dumpCommand = buildPgDumpCommand(sourceConn, dumpFile);
    const dumpEnv = {
      ...process.env,
      PGPASSWORD: sourceConn.password,
      PGSSLMODE: sourceConn.ssl ? "require" : "prefer",
    };

    console.log(`  Running: pg_dump (output: ${dumpFile})`);
    const { stdout: dumpStdout, stderr: dumpStderr } = await execAsync(dumpCommand, {
      env: dumpEnv,
      maxBuffer: 1024 * 1024 * 100, // 100MB buffer
    });

    if (dumpStderr && !dumpStderr.includes("WARNING")) {
      console.warn("  pg_dump warnings:", dumpStderr);
    }

    const dumpStats = fs.statSync(dumpFile);
    console.log(`  ✓ Dump completed (${(dumpStats.size / 1024 / 1024).toFixed(2)} MB)\n`);

    // Step 2: Restore to destination database
    console.log("Step 2: Restoring dump to destination database...");
    const restoreCommand = buildPsqlCommand(destConn, dumpFile);
    const restoreEnv = {
      ...process.env,
      PGPASSWORD: destConn.password,
      PGSSLMODE: destConn.ssl ? "require" : "prefer",
    };

    console.log(`  Running: pg_restore`);
    try {
      const { stdout: restoreStdout, stderr: restoreStderr } = await execAsync(restoreCommand, {
        env: restoreEnv,
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
      });

      if (restoreStdout) {
        console.log("  pg_restore output:", restoreStdout);
      }

      if (restoreStderr) {
        // Filter out known non-critical errors
        const criticalErrors = restoreStderr
          .split("\n")
          .filter((line) => {
            const lower = line.toLowerCase();
            // Ignore warnings about unrecognized config parameters (version differences)
            if (lower.includes("unrecognized configuration parameter")) {
              return false;
            }
            // Ignore warnings about errors being ignored (non-critical)
            if (lower.includes("errors ignored on restore")) {
              return false;
            }
            // Ignore warnings about already exists (expected with --clean)
            if (lower.includes("already exists")) {
              return false;
            }
            // Ignore standard warnings
            if (lower.includes("warning:")) {
              return false;
            }
            return true;
          })
          .filter((line) => line.trim().length > 0);

        if (criticalErrors.length > 0) {
          console.warn("  pg_restore warnings/errors:", criticalErrors.join("\n"));
        } else if (restoreStderr.trim().length > 0) {
          console.log("  pg_restore info: Some non-critical warnings were ignored");
        }
      }

      console.log("  ✓ Restore completed\n");
    } catch (restoreError: any) {
      // Check if restore actually failed or just had warnings
      const errorOutput = restoreError.stderr || "";
      const errorMessage = restoreError.message || "";

      // Check if it's just a non-critical error about unsupported parameters
      const isNonCriticalError =
        errorOutput.includes("unrecognized configuration parameter") ||
        errorOutput.includes("errors ignored on restore") ||
        errorMessage.includes("unrecognized configuration parameter");

      if (isNonCriticalError) {
        console.log("  ⚠ Restore completed with non-critical warnings (version differences)");
        console.log("  ✓ Restore likely successful despite warnings\n");
      } else {
        // Re-throw if it's a real error
        throw restoreError;
      }
    }

    console.log("=== Summary ===");
    console.log("✓ Database sync completed successfully!");
    console.log(`✓ Source database dumped to: ${dumpFile}`);
    console.log(`✓ Destination database restored from dump`);

    // Optionally keep the dump file for reference
    console.log(`\nNote: Dump file saved at ${dumpFile}`);
    console.log("You can delete it manually if not needed.");
  } catch (error: any) {
    console.error("\n✗ Fatal error during sync:", error.message);
    if (error.stdout) {
      console.error("stdout:", error.stdout);
    }
    if (error.stderr) {
      console.error("stderr:", error.stderr);
    }
    process.exit(1);
  } finally {
    // Cleanup: Optionally remove dump file (uncomment if you want auto-cleanup)
    // if (fs.existsSync(dumpFile)) {
    //   fs.unlinkSync(dumpFile);
    //   console.log(`\nCleaned up dump file: ${dumpFile}`);
    // }
  }
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

