// Allowed training request statuses for adding learners to batches
// Status 1 = Looking for trainer, 3 = No batch match, 6 = On Hold, 7 = Drop off
export const ALLOWED_TRAINING_REQUEST_STATUSES = [1, 3, 6, 7] as const;

