import { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getCurrentSession();

  if (session) {
    redirect("/admin");
  }

  return <>{children}</>;
}
