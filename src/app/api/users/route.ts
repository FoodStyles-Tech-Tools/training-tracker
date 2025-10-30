import { NextResponse } from "next/server";
import { db, schema } from "@/db";

export async function GET() {
  const users = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .orderBy(schema.users.name);
  return NextResponse.json({ users });
}
