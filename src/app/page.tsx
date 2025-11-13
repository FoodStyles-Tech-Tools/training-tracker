import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

export default async function IndexPage() {
  const session = await getCurrentSession();

  if (session) {
    redirect("/admin/learner-dashboard");
  }

  redirect("/login");
}
