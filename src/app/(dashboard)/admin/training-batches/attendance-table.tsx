"use client";

import { useState, useTransition, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { updateAttendanceAction } from "./actions";
import type { TrainingBatch, TrainingBatchSession, User, TrainingBatchAttendanceSession } from "@/db/schema";

interface AttendanceTableProps {
  batch: TrainingBatch & {
    sessions: TrainingBatchSession[];
    learners: Array<{
      learnerUserId: string;
      learner: {
        id: string;
        name: string;
        email: string;
      };
    }>;
  };
  sessions: TrainingBatchSession[];
  learners: Array<{
    id: string;
    name: string;
    email: string;
  }>;
  attendance: Array<
    TrainingBatchAttendanceSession & {
      session: TrainingBatchSession;
      learner: {
        id: string;
        name: string;
      };
    }
  >;
}

export function AttendanceTable({
  batch,
  sessions,
  learners,
  attendance,
}: AttendanceTableProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [attendanceState, setAttendanceState] = useState<Map<string, boolean>>(() => {
    const state = new Map<string, boolean>();
    attendance.forEach((a) => {
      const key = `${a.learnerUserId}-${a.sessionId}`;
      state.set(key, a.attended);
    });
    return state;
  });

  // Create a map for quick lookup
  const attendanceMap = useMemo(() => {
    const map = new Map<string, boolean>();
    attendance.forEach((a) => {
      const key = `${a.learnerUserId}-${a.sessionId}`;
      map.set(key, a.attended);
    });
    return map;
  }, [attendance]);

  const handleAttendanceChange = (
    learnerId: string,
    sessionId: string,
    attended: boolean,
  ) => {
    const key = `${learnerId}-${sessionId}`;
    setAttendanceState((prev) => {
      const newState = new Map(prev);
      newState.set(key, attended);
      return newState;
    });

    // Update via server action
    startTransition(async () => {
      const result = await updateAttendanceAction(batch.id, sessionId, [
        { learnerId, attended },
      ]);
      if (result.success) {
        setMessage({ text: "Attendance updated successfully", tone: "success" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ text: result.error || "Failed to update attendance", tone: "error" });
        // Revert state on error
        setAttendanceState((prev) => {
          const newState = new Map(prev);
          newState.set(key, !attended);
          return newState;
        });
      }
    });
  };

  const handleCheckAll = (sessionId: string, checked: boolean) => {
    const updates: Array<{ learnerId: string; attended: boolean }> = [];
    learners.forEach((learner) => {
      const key = `${learner.id}-${sessionId}`;
      const currentValue = attendanceState.get(key) || false;
      if (currentValue !== checked) {
        setAttendanceState((prev) => {
          const newState = new Map(prev);
          newState.set(key, checked);
          return newState;
        });
        updates.push({ learnerId: learner.id, attended: checked });
      }
    });

    if (updates.length > 0) {
      startTransition(async () => {
        const result = await updateAttendanceAction(batch.id, sessionId, updates);
        if (result.success) {
          setMessage({ text: "Attendance updated successfully", tone: "success" });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ text: result.error || "Failed to update attendance", tone: "error" });
          // Revert state on error
          updates.forEach((update) => {
            const key = `${update.learnerId}-${sessionId}`;
            setAttendanceState((prev) => {
              const newState = new Map(prev);
              newState.set(key, !update.attended);
              return newState;
            });
          });
        }
      });
    }
  };

  const isColumnAllChecked = (sessionId: string): boolean => {
    if (learners.length === 0) return false;
    return learners.every((learner) => {
      const key = `${learner.id}-${sessionId}`;
      return attendanceState.get(key) || false;
    });
  };

  const isColumnIndeterminate = (sessionId: string): boolean => {
    const checkedCount = learners.filter((learner) => {
      const key = `${learner.id}-${sessionId}`;
      return attendanceState.get(key) || false;
    }).length;
    return checkedCount > 0 && checkedCount < learners.length;
  };

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Attendance</h2>
        <p className="text-sm text-slate-400">
          Mark attendance for each learner per session.
        </p>
      </div>

      {message && (
        <Alert variant={message.tone === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-800/80">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-950/70 text-slate-300">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Learners</th>
              {sessions.map((session) => (
                <th key={session.id} className="px-4 py-3 text-center font-medium">
                  <div className="flex flex-col items-center gap-1">
                    <span>Session {session.sessionNumber}</span>
                    <Checkbox
                      checked={isColumnAllChecked(session.id)}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = isColumnIndeterminate(session.id);
                        }
                      }}
                      onChange={(e) => handleCheckAll(session.id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {learners.length === 0 ? (
              <tr>
                <td colSpan={sessions.length + 1} className="px-4 py-8 text-center text-slate-400">
                  No learners in this batch
                </td>
              </tr>
            ) : (
              learners.map((learner) => (
                <tr key={learner.id} className="hover:bg-slate-900/60">
                  <td className="px-4 py-3 text-slate-100">{learner.name}</td>
                  {sessions.map((session) => {
                    const key = `${learner.id}-${session.id}`;
                    const attended = attendanceState.get(key) || false;
                    return (
                      <td key={session.id} className="px-4 py-3 text-center">
                        <Checkbox
                          checked={attended}
                          onChange={(e) =>
                            handleAttendanceChange(learner.id, session.id, e.target.checked)
                          }
                          disabled={isPending}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

