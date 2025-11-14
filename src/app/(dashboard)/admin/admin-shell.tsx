"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun, X } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState, startTransition } from "react";

import { cn } from "@/lib/utils";
import { LogoutButton } from "@/components/logout-button";
import { Modal } from "@/components/ui/modal";

type NavItem = {
  label: string;
  href: string;
};

interface AdminShellProps {
  user: {
    name: string;
    roleName: string | null;
  };
  navItems: NavItem[];
  children: ReactNode;
}

type AdminTheme = "dark" | "light";

export function AdminShell({ user, navItems, children }: AdminShellProps) {
  const pathname = usePathname();
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [theme, setTheme] = useState<AdminTheme>("light");
  const hasHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTheme = window.localStorage.getItem("admin-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      startTransition(() => setTheme(storedTheme as AdminTheme));
    }
    hasHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    document.body.dataset.adminTheme = theme;
    if (hasHydratedRef.current) {
      window.localStorage.setItem("admin-theme", theme);
    }

    return () => {
      if (typeof document !== "undefined") {
        delete document.body.dataset.adminTheme;
      }
    };
  }, [theme]);

  const nav = useMemo(
    () =>
      navItems.map((item) => {
        let active = pathname === item.href;
        
        // Special handling for Learner Dashboard
        if (item.href === "/admin/learner-dashboard" && pathname.startsWith("/admin/learner-dashboard")) {
          active = true;
        }
        
        // Special handling for Request Log - also active on old request routes
        if (item.href === "/admin/request-log") {
          active = pathname === "/admin/request-log" ||
                   pathname === "/admin/training-requests" ||
                   pathname === "/admin/validation-project-approval" ||
                   pathname === "/admin/validation-schedule-request";
        }
        
        return {
          ...item,
          active,
        };
      }),
    [navItems, pathname],
  );

  const closeNav = () => setIsNavOpen(false);
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return (
    <div
      className={cn(
        "admin-theme flex min-h-screen flex-col bg-slate-950 text-slate-100 transition-colors lg:flex-row",
      )}
      data-theme={theme}
    >
      <aside className="hidden w-64 border-r border-slate-800 bg-slate-950/80 p-6 lg:flex lg:flex-col">
        <div className="space-y-8">
          <div>
            <p className="text-lg font-semibold">Competency Training Tracker</p>
            <p className="text-sm text-slate-400">{user.roleName ?? "No role"}</p>
          </div>
          <nav className="space-y-2">
            {nav.length ? (
              <>
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </>
            ) : (
              <p className="text-sm text-slate-500">No modules available.</p>
            )}
          </nav>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 sm:px-6">
          <div className="flex flex-1 items-center gap-3">
            {nav.length ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:hidden"
                onClick={() => setIsNavOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
                Menu
              </button>
            ) : null}
            <div>
              <p className="text-sm font-semibold text-slate-100 lg:hidden">
                Competency Training Tracker
              </p>
              <p className="text-xs uppercase tracking-wide text-slate-500">Signed in as</p>
              <p className="text-sm font-medium text-slate-50">{user.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:border-blue-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <LogoutButton />
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden bg-slate-900/40 px-4 py-4 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>

      <Modal
        open={isNavOpen}
        onClose={closeNav}
        contentClassName="max-w-xs w-full"
        overlayClassName="bg-slate-950/90"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <p className="text-sm font-semibold">Navigation</p>
          <button
            type="button"
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            onClick={closeNav}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="mt-4 space-y-2">
          {nav.length ? (
            <>
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeNav}
                  className={cn(
                    "block rounded-md px-3 py-2 text-sm font-medium transition",
                    item.active
                      ? "bg-slate-800 text-slate-50"
                      : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </>
          ) : (
            <p className="text-sm text-slate-500">No modules available.</p>
          )}
        </nav>
      </Modal>
    </div>
  );
}
