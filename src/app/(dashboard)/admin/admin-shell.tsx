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

type NavGroups = {
  learner: NavItem[];
  trainer: NavItem[];
  report: NavItem[];
  training_forum: NavItem[];
  settings: NavItem[];
};

interface AdminShellProps {
  user: {
    name: string;
    roleName: string | null;
  };
  navGroups: NavGroups;
  children: ReactNode;
}

type AdminTheme = "dark" | "light";

export function AdminShell({ user, navGroups, children }: AdminShellProps) {
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

  const processNavItems = (items: NavItem[]) =>
    items.map((item) => {
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
    });

  const processedGroups = useMemo(
    () => ({
      learner: processNavItems(navGroups.learner),
      trainer: processNavItems(navGroups.trainer),
      report: processNavItems(navGroups.report),
      training_forum: processNavItems(navGroups.training_forum),
      settings: processNavItems(navGroups.settings),
    }),
    [navGroups, pathname],
  );

  const allNavItems = useMemo(
    () => [
      ...processedGroups.learner,
      ...processedGroups.trainer,
      ...processedGroups.report,
      ...processedGroups.training_forum,
      ...processedGroups.settings,
    ],
    [processedGroups],
  );

  const closeNav = () => setIsNavOpen(false);
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  return (
    <div
      className={cn(
        "admin-theme min-h-screen bg-slate-950 text-slate-100 transition-colors",
      )}
      data-theme={theme}
    >
      {/* Fixed Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 border-r border-slate-800 bg-slate-950/80 lg:flex lg:flex-col">
        <div className="flex h-full flex-col overflow-y-auto p-6">
          <div className="space-y-8">
            <div>
              <p className="text-lg font-semibold">Competency Training Tracker</p>
              <p className="text-sm text-slate-400">{user.roleName ?? "No role"}</p>
            </div>
            <nav className="space-y-6">
              {processedGroups.learner.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Learner</p>
                  <div className="space-y-1">
                    {processedGroups.learner.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                          item.active
                            ? "bg-slate-800 text-slate-50"
                            : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {processedGroups.trainer.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Trainer</p>
                  <div className="space-y-1">
                    {processedGroups.trainer.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                          item.active
                            ? "bg-slate-800 text-slate-50"
                            : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {processedGroups.report.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Report</p>
                  <div className="space-y-1">
                    {processedGroups.report.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                          item.active
                            ? "bg-slate-800 text-slate-50"
                            : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {processedGroups.training_forum.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Training Forum</p>
                  <div className="space-y-1">
                    {processedGroups.training_forum.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                          item.active
                            ? "bg-slate-800 text-slate-50"
                            : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {processedGroups.settings.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Settings</p>
                  <div className="space-y-1">
                    {processedGroups.settings.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                          item.active
                            ? "bg-slate-800 text-slate-50"
                            : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                        )}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {allNavItems.length === 0 && (
                <p className="text-sm text-slate-500">No modules available.</p>
              )}
            </nav>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:pl-64">
        {/* Fixed Header */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-1 items-center gap-3">
            {allNavItems.length > 0 ? (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer lg:hidden"
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 transition hover:border-blue-400 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 cursor-pointer"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <LogoutButton />
          </div>
        </header>

        {/* Scrollable Main Content */}
        <main className="min-h-[calc(100vh-73px)] overflow-x-hidden bg-slate-900/40 px-4 py-4 sm:px-6 sm:py-6">
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
            className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:border-blue-500 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 cursor-pointer"
            onClick={closeNav}
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="mt-4 space-y-6">
          {processedGroups.learner.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Learner</p>
              <div className="space-y-1">
                {processedGroups.learner.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNav}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {processedGroups.trainer.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Trainer</p>
              <div className="space-y-1">
                {processedGroups.trainer.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNav}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {processedGroups.report.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Report</p>
              <div className="space-y-1">
                {processedGroups.report.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNav}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {processedGroups.training_forum.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Training Forum</p>
              <div className="space-y-1">
                {processedGroups.training_forum.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNav}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {processedGroups.settings.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Settings</p>
              <div className="space-y-1">
                {processedGroups.settings.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeNav}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm font-medium transition cursor-pointer",
                      item.active
                        ? "bg-slate-800 text-slate-50"
                        : "text-slate-300 hover:bg-slate-800 hover:text-slate-50",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {allNavItems.length === 0 && (
            <p className="text-sm text-slate-500">No modules available.</p>
          )}
        </nav>
      </Modal>
    </div>
  );
}
