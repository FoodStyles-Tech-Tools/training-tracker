"use client";

import { useMemo, useState } from "react";

import type { ActivityLog, User } from "@/db/schema";
import { TableControls } from "@/components/admin/table-controls";
import { Pagination } from "@/components/admin/pagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ActivityLogEntry = ActivityLog & {
  user: Pick<User, "id" | "name" | "email"> | null;
};

const SORT_OPTIONS = [
  { value: "timestamp-desc", label: "Newest first" },
  { value: "timestamp-asc", label: "Oldest first" },
  { value: "user-asc", label: "User A → Z" },
  { value: "user-desc", label: "User Z → A" },
  { value: "module-asc", label: "Module A → Z" },
  { value: "module-desc", label: "Module Z → A" },
  { value: "action-asc", label: "Action A → Z" },
  { value: "action-desc", label: "Action Z → A" },
];

interface ActivityLogManagerProps {
  logs: ActivityLogEntry[];
}

function formatModule(module: string) {
  return module.replace(/_/g, " ");
}

function formatAction(action: string) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatTimestamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
}

function parseData(data: string | null) {
  if (!data) return null;
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}

export function ActivityLogManager({ logs }: ActivityLogManagerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortValue, setSortValue] = useState<string>(SORT_OPTIONS[0]?.value ?? "timestamp-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { filteredAndSortedLogs, totalFilteredLogs } = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    const filtered = normalized
      ? logs.filter((log) => {
          const userDisplay = log.user ? `${log.user.name} ${log.user.email}` : "";
          const haystack = `${userDisplay} ${log.module} ${log.action} ${log.data ?? ""}`.toLowerCase();
          return haystack.includes(normalized);
        })
      : logs.slice();

    const toTime = (value: string | Date) => (value instanceof Date ? value.getTime() : new Date(value).getTime());

    const sorted = filtered.sort((a, b) => {
      switch (sortValue) {
        case "timestamp-asc":
          return toTime(a.timestamp) - toTime(b.timestamp);
        case "timestamp-desc":
          return toTime(b.timestamp) - toTime(a.timestamp);
        case "user-asc":
          return (a.user?.name ?? "").localeCompare(b.user?.name ?? "", undefined, { sensitivity: "base" });
        case "user-desc":
          return (b.user?.name ?? "").localeCompare(a.user?.name ?? "", undefined, { sensitivity: "base" });
        case "module-asc":
          return a.module.localeCompare(b.module, undefined, { sensitivity: "base" });
        case "module-desc":
          return b.module.localeCompare(a.module, undefined, { sensitivity: "base" });
        case "action-asc":
          return a.action.localeCompare(b.action, undefined, { sensitivity: "base" });
        case "action-desc":
          return b.action.localeCompare(a.action, undefined, { sensitivity: "base" });
        default:
          return 0;
      }
    });

    return { filteredAndSortedLogs: sorted, totalFilteredLogs: sorted.length };
  }, [logs, searchQuery, sortValue]);

  // Paginate the filtered and sorted logs
  const visibleLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedLogs.slice(startIndex, endIndex);
  }, [filteredAndSortedLogs, currentPage, pageSize]);

  // Reset to page 1 when search or sort changes
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleSortChange = (value: string) => {
    setSortValue(value);
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <TableControls
        searchValue={searchQuery}
        onSearchChange={handleSearchChange}
        searchPlaceholder="Search logs by user, module, action, or data..."
        sortValue={sortValue}
        onSortChange={handleSortChange}
        sortOptions={SORT_OPTIONS}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">No</th>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Module</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Timestamp</th>
                  <th className="px-4 py-2 font-medium">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visibleLogs.length ? (
                  visibleLogs.map((log, index) => {
                    const formattedData = parseData(log.data ?? null);
                    const rowNumber = (currentPage - 1) * pageSize + index + 1;
                    return (
                      <tr key={log.id} className="hover:bg-slate-900/50">
                        <td className="px-4 py-2 align-top">{rowNumber}</td>
                        <td className="px-4 py-2 align-top">
                          {log.user ? (
                            <>
                              <span className="block font-medium text-slate-50">{log.user.name}</span>
                              <span className="block text-xs text-slate-400">{log.user.email}</span>
                            </>
                          ) : (
                            <span className="text-slate-400">System</span>
                          )}
                        </td>
                        <td className="px-4 py-2 align-top capitalize">{formatModule(log.module)}</td>
                        <td className="px-4 py-2 align-top capitalize">{formatAction(log.action)}</td>
                        <td className="px-4 py-2 align-top whitespace-nowrap">{formatTimestamp(log.timestamp)}</td>
                        <td className="px-4 py-2 align-top">
                          {formattedData ? (
                            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-slate-900/60 p-3 text-xs text-slate-300">
                              {formattedData}
                            </pre>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                      No activity recorded for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <Pagination
        totalItems={totalFilteredLogs}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={(newPageSize) => {
          setPageSize(newPageSize);
          setCurrentPage(1);
        }}
      />
    </div>
  );
}

