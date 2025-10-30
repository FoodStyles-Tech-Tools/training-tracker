import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getCurrentSession() {
  const incomingHeaders = await headers();
  const session = await auth.api.getSession({
    headers: new Headers(incomingHeaders),
  });

  if (!session) {
    return null;
  }

  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
