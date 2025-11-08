"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const isPermissionIssue =
    error?.name === "PermissionError" ||
    /permission/i.test(error?.message ?? "");

  useEffect(() => {
    // Log for observability in dev; in prod, wire to your logger if needed
    console.error(error);
  }, [error]);

  if (!isPermissionIssue) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="mb-2 text-2xl font-semibold">Something went wrong</h1>
          <p className="mb-6 text-sm text-slate-400">{error.message || "Unexpected error"}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-2xl font-semibold">Access denied</h1>
        <p className="mb-6 text-sm text-slate-400">
          You don&apos;t have permission to view this page or perform this action.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/admin" className="rounded bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700">
            Go to dashboard
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded border border-slate-700 px-4 py-2 text-sm hover:bg-slate-900"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}



