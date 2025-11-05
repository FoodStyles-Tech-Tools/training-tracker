import { db, schema } from "@/db";

/**
 * Logs an activity to the activity_log table
 * @param userId - UUID of the user performing the action
 * @param module - Module name
 * @param action - Action name (add/edit/delete)
 * @param data - Extra data to log (object/primitive, will be JSON.stringified)
 */
export async function logActivity({
  userId,
  module,
  action,
  data,
}: {
  userId: string;
  module: typeof schema.moduleNameEnum.enumValues[number];
  action: typeof schema.actionEnum.enumValues[number];
  data?: unknown;
}) {
  try {
    await db.insert(schema.activityLog).values({
      userId,
      module,
      action,
      data: data ? JSON.stringify(data) : null,
    });
  } catch (error) {
    // Swallow, don't crash the main app flow; optionally log elsewhere.
    // You may wish to handle this more robustly in production
    console.error("Failed to log activity", error);
  }
}
