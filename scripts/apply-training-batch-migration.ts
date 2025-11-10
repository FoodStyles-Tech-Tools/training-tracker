import "dotenv/config";
import { Pool } from "pg";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

async function applyMigration() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if enum value already exists
    const enumCheck = await client.query(`
      SELECT unnest(enum_range(NULL::module_name)) as value;
    `);
    const enumValues = enumCheck.rows.map((r) => r.value);
    
    if (!enumValues.includes("training_batch")) {
      console.log("Adding 'training_batch' to module_name enum...");
      await client.query(`ALTER TYPE "public"."module_name" ADD VALUE 'training_batch'`);
    } else {
      console.log("'training_batch' enum value already exists, skipping...");
    }

    // Check if tables exist
    const tableCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'training_batch',
        'training_batch_sessions',
        'training_batch_learners',
        'training_batch_attendance_sessions',
        'training_batch_homework_sessions'
      );
    `);
    const existingTables = tableCheck.rows.map((r) => r.table_name);

    if (!existingTables.includes("training_batch")) {
      console.log("Creating training_batch table...");
      await client.query(`
        CREATE TABLE "training_batch" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "competency_level_id" uuid NOT NULL,
          "trainer_user_id" uuid NOT NULL,
          "batch_name" text NOT NULL,
          "session_count" integer DEFAULT 0 NOT NULL,
          "duration_hrs" numeric,
          "estimated_start" timestamp,
          "batch_start_date" timestamp,
          "capacity" integer DEFAULT 0 NOT NULL,
          "current_participant" integer DEFAULT 0 NOT NULL,
          "spot_left" integer DEFAULT 0 NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `);
    } else {
      console.log("training_batch table already exists, skipping...");
    }

    if (!existingTables.includes("training_batch_sessions")) {
      console.log("Creating training_batch_sessions table...");
      await client.query(`
        CREATE TABLE "training_batch_sessions" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "training_batch_id" uuid NOT NULL,
          "session_number" integer NOT NULL,
          "session_date" timestamp,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        );
      `);
    } else {
      console.log("training_batch_sessions table already exists, skipping...");
    }

    if (!existingTables.includes("training_batch_learners")) {
      console.log("Creating training_batch_learners table...");
      await client.query(`
        CREATE TABLE "training_batch_learners" (
          "training_batch_id" uuid NOT NULL,
          "learner_user_id" uuid NOT NULL,
          "training_request_id" uuid NOT NULL,
          CONSTRAINT "training_batch_learners_training_batch_id_learner_user_id_pk" PRIMARY KEY("training_batch_id","learner_user_id")
        );
      `);
    } else {
      console.log("training_batch_learners table already exists, skipping...");
    }

    if (!existingTables.includes("training_batch_attendance_sessions")) {
      console.log("Creating training_batch_attendance_sessions table...");
      await client.query(`
        CREATE TABLE "training_batch_attendance_sessions" (
          "training_batch_id" uuid NOT NULL,
          "learner_user_id" uuid NOT NULL,
          "session_id" uuid NOT NULL,
          "attended" boolean DEFAULT false NOT NULL,
          CONSTRAINT "training_batch_attendance_sessions_training_batch_id_learner_user_id_session_id_pk" PRIMARY KEY("training_batch_id","learner_user_id","session_id")
        );
      `);
    } else {
      console.log("training_batch_attendance_sessions table already exists, skipping...");
    }

    if (!existingTables.includes("training_batch_homework_sessions")) {
      console.log("Creating training_batch_homework_sessions table...");
      await client.query(`
        CREATE TABLE "training_batch_homework_sessions" (
          "training_batch_id" uuid NOT NULL,
          "learner_user_id" uuid NOT NULL,
          "session_id" uuid NOT NULL,
          "completed" boolean DEFAULT false NOT NULL,
          "homework_url" text,
          CONSTRAINT "training_batch_homework_sessions_training_batch_id_learner_user_id_session_id_pk" PRIMARY KEY("training_batch_id","learner_user_id","session_id")
        );
      `);
    } else {
      console.log("training_batch_homework_sessions table already exists, skipping...");
    }

    // Add foreign key constraints
    console.log("Adding foreign key constraints...");
    
    // Check and add training_batch foreign keys
    const fkCheck = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'training_batch' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%competency_level_id%';
    `);
    
    if (fkCheck.rows.length === 0) {
      await client.query(`
        ALTER TABLE "training_batch" 
        ADD CONSTRAINT "training_batch_competency_level_id_competency_levels_id_fk" 
        FOREIGN KEY ("competency_level_id") REFERENCES "public"."competency_levels"("id") ON DELETE cascade ON UPDATE no action;
      `);
    }

    const fkCheck2 = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'training_batch' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%trainer_user_id%';
    `);
    
    if (fkCheck2.rows.length === 0) {
      await client.query(`
        ALTER TABLE "training_batch" 
        ADD CONSTRAINT "training_batch_trainer_user_id_users_id_fk" 
        FOREIGN KEY ("trainer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
      `);
    }

    // Add indexes
    console.log("Adding indexes...");
    
    const indexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'training_batch' 
      AND indexname = 'training_batch_competency_level_id_idx';
    `);
    
    if (indexCheck.rows.length === 0) {
      await client.query(`
        CREATE INDEX "training_batch_competency_level_id_idx" ON "training_batch" USING btree ("competency_level_id");
      `);
    }

    const indexCheck2 = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'training_batch' 
      AND indexname = 'training_batch_trainer_user_id_idx';
    `);
    
    if (indexCheck2.rows.length === 0) {
      await client.query(`
        CREATE INDEX "training_batch_trainer_user_id_idx" ON "training_batch" USING btree ("trainer_user_id");
      `);
    }

    // Add foreign keys for other tables
    const otherTables = [
      { table: "training_batch_sessions", fks: [
        { name: "training_batch_sessions_training_batch_id_training_batch_id_fk", 
          constraint: `FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action` }
      ]},
      { table: "training_batch_learners", fks: [
        { name: "training_batch_learners_training_batch_id_training_batch_id_fk",
          constraint: `FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_learners_learner_user_id_users_id_fk",
          constraint: `FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_learners_training_request_id_training_request_id_fk",
          constraint: `FOREIGN KEY ("training_request_id") REFERENCES "public"."training_request"("id") ON DELETE cascade ON UPDATE no action` }
      ]},
      { table: "training_batch_attendance_sessions", fks: [
        { name: "training_batch_attendance_sessions_training_batch_id_training_batch_id_fk",
          constraint: `FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_attendance_sessions_learner_user_id_users_id_fk",
          constraint: `FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_attendance_sessions_session_id_training_batch_sessions_id_fk",
          constraint: `FOREIGN KEY ("session_id") REFERENCES "public"."training_batch_sessions"("id") ON DELETE cascade ON UPDATE no action` }
      ]},
      { table: "training_batch_homework_sessions", fks: [
        { name: "training_batch_homework_sessions_training_batch_id_training_batch_id_fk",
          constraint: `FOREIGN KEY ("training_batch_id") REFERENCES "public"."training_batch"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_homework_sessions_learner_user_id_users_id_fk",
          constraint: `FOREIGN KEY ("learner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action` },
        { name: "training_batch_homework_sessions_session_id_training_batch_sessions_id_fk",
          constraint: `FOREIGN KEY ("session_id") REFERENCES "public"."training_batch_sessions"("id") ON DELETE cascade ON UPDATE no action` }
      ]}
    ];

    for (const tableInfo of otherTables) {
      for (const fk of tableInfo.fks) {
        const fkExists = await client.query(`
          SELECT constraint_name 
          FROM information_schema.table_constraints 
          WHERE table_name = $1 
          AND constraint_name = $2;
        `, [tableInfo.table, fk.name]);
        
        if (fkExists.rows.length === 0) {
          await client.query(`
            ALTER TABLE "${tableInfo.table}" 
            ADD CONSTRAINT "${fk.name}" 
            ${fk.constraint};
          `);
        }
      }
    }

    // Add remaining indexes
    const indexes = [
      { table: "training_batch_sessions", name: "training_batch_sessions_batch_session_idx", 
        sql: `CREATE UNIQUE INDEX "training_batch_sessions_batch_session_idx" ON "training_batch_sessions" USING btree ("training_batch_id","session_number")` },
      { table: "training_batch_sessions", name: "training_batch_sessions_training_batch_id_idx",
        sql: `CREATE INDEX "training_batch_sessions_training_batch_id_idx" ON "training_batch_sessions" USING btree ("training_batch_id")` },
      { table: "training_batch_learners", name: "training_batch_learners_training_request_id_idx",
        sql: `CREATE INDEX "training_batch_learners_training_request_id_idx" ON "training_batch_learners" USING btree ("training_request_id")` },
      { table: "training_batch_learners", name: "training_batch_learners_learner_user_id_idx",
        sql: `CREATE INDEX "training_batch_learners_learner_user_id_idx" ON "training_batch_learners" USING btree ("learner_user_id")` },
      { table: "training_batch_attendance_sessions", name: "training_batch_attendance_learner_user_id_idx",
        sql: `CREATE INDEX "training_batch_attendance_learner_user_id_idx" ON "training_batch_attendance_sessions" USING btree ("learner_user_id")` },
      { table: "training_batch_attendance_sessions", name: "training_batch_attendance_session_id_idx",
        sql: `CREATE INDEX "training_batch_attendance_session_id_idx" ON "training_batch_attendance_sessions" USING btree ("session_id")` },
      { table: "training_batch_homework_sessions", name: "training_batch_homework_learner_user_id_idx",
        sql: `CREATE INDEX "training_batch_homework_learner_user_id_idx" ON "training_batch_homework_sessions" USING btree ("learner_user_id")` },
      { table: "training_batch_homework_sessions", name: "training_batch_homework_session_id_idx",
        sql: `CREATE INDEX "training_batch_homework_session_id_idx" ON "training_batch_homework_sessions" USING btree ("session_id")` }
    ];

    for (const idx of indexes) {
      const idxExists = await client.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = $1 
        AND indexname = $2;
      `, [idx.table, idx.name]);
      
      if (idxExists.rows.length === 0) {
        await client.query(idx.sql);
      }
    }

    await client.query("COMMIT");
    console.log("✓ Migration applied successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("✗ Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

