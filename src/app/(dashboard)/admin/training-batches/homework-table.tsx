"use client";

import { useState, useTransition, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert } from "@/components/ui/alert";
import { updateHomeworkAction } from "./actions";
import type { TrainingBatch, TrainingBatchSession, User, TrainingBatchHomeworkSession } from "@/db/schema";
import { Link as LinkIcon } from "lucide-react";

interface HomeworkTableProps {
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
  homework: Array<
    TrainingBatchHomeworkSession & {
      session: TrainingBatchSession;
      learner: {
        id: string;
        name: string;
      };
    }
  >;
}

export function HomeworkTable({
  batch,
  sessions,
  learners,
  homework,
}: HomeworkTableProps) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [homeworkState, setHomeworkState] = useState<
    Map<string, { completed: boolean; homeworkUrl: string }>
  >(() => {
    const state = new Map<string, { completed: boolean; homeworkUrl: string }>();
    homework.forEach((h) => {
      const key = `${h.learnerUserId}-${h.sessionId}`;
      state.set(key, {
        completed: h.completed,
        homeworkUrl: h.homeworkUrl || "",
      });
    });
    return state;
  });

  // Create a map for quick lookup
  const homeworkMap = useMemo(() => {
    const map = new Map<string, { completed: boolean; homeworkUrl: string }>();
    homework.forEach((h) => {
      const key = `${h.learnerUserId}-${h.sessionId}`;
      map.set(key, {
        completed: h.completed,
        homeworkUrl: h.homeworkUrl || "",
      });
    });
    return map;
  }, [homework]);

  const handleHomeworkChange = (
    learnerId: string,
    sessionId: string,
    completed: boolean,
  ) => {
    const key = `${learnerId}-${sessionId}`;
    const currentState = homeworkState.get(key) || { completed: false, homeworkUrl: "" };
    setHomeworkState((prev) => {
      const newState = new Map(prev);
      newState.set(key, {
        completed,
        homeworkUrl: currentState.homeworkUrl, // Keep existing URL, don't allow editing
      });
      return newState;
    });

    // Update via server action - only update completion status, not URL
    startTransition(async () => {
      const result = await updateHomeworkAction(batch.id, sessionId, [
        {
          learnerId,
          completed,
          homeworkUrl: currentState.homeworkUrl, // Keep existing URL from database
        },
      ]);
      if (result.success) {
        setMessage({ text: "Homework updated successfully", tone: "success" });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ text: result.error || "Failed to update homework", tone: "error" });
        // Revert state on error
        setHomeworkState((prev) => {
          const newState = new Map(prev);
          newState.set(key, currentState);
          return newState;
        });
      }
    });
  };

  const handleCheckAll = (sessionId: string, checked: boolean) => {
    const updates: Array<{ learnerId: string; completed: boolean; homeworkUrl?: string }> = [];
    learners.forEach((learner) => {
      const key = `${learner.id}-${sessionId}`;
      const currentState = homeworkState.get(key) || { completed: false, homeworkUrl: "" };
      if (currentState.completed !== checked) {
        setHomeworkState((prev) => {
          const newState = new Map(prev);
          newState.set(key, {
            completed: checked,
            homeworkUrl: currentState.homeworkUrl, // Keep existing URL from database
          });
          return newState;
        });
        updates.push({
          learnerId: learner.id,
          completed: checked,
          homeworkUrl: currentState.homeworkUrl, // Keep existing URL from database
        });
      }
    });

    if (updates.length > 0) {
      startTransition(async () => {
        const result = await updateHomeworkAction(batch.id, sessionId, updates);
        if (result.success) {
          setMessage({ text: "Homework updated successfully", tone: "success" });
          setTimeout(() => setMessage(null), 3000);
        } else {
          setMessage({ text: result.error || "Failed to update homework", tone: "error" });
          // Revert state on error
          updates.forEach((update) => {
            const key = `${update.learnerId}-${sessionId}`;
            const currentState = homeworkState.get(key) || { completed: false, homeworkUrl: "" };
            setHomeworkState((prev) => {
              const newState = new Map(prev);
              newState.set(key, {
                completed: !update.completed,
                homeworkUrl: currentState.homeworkUrl,
              });
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
      const state = homeworkState.get(key);
      return state?.completed || false;
    });
  };

  const isColumnIndeterminate = (sessionId: string): boolean => {
    const checkedCount = learners.filter((learner) => {
      const key = `${learner.id}-${sessionId}`;
      const state = homeworkState.get(key);
      return state?.completed || false;
    }).length;
    return checkedCount > 0 && checkedCount < learners.length;
  };

  return (
    <Card className="space-y-5 p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Homework</h2>
        <p className="text-sm text-slate-400">
          Mark homework completion for each learner per session.
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
                    <span>Homework {session.sessionNumber}</span>
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
                    const state = homeworkState.get(key) || { completed: false, homeworkUrl: "" };
                    return (
                      <td key={session.id} className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={state.completed}
                            onChange={(e) =>
                              handleHomeworkChange(learner.id, session.id, e.target.checked)
                            }
                            disabled={isPending}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                          />
                          {state.homeworkUrl && (
                            <a
                              href={state.homeworkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs !text-blue-600 hover:!text-blue-500 transition underline"
                              title={state.homeworkUrl}
                            >
                              Homework URL
                            </a>
                          )}
                        </div>
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

