// Allowed training request statuses for adding learners to batches
// Status 2 = In Queue, 3 = No batch match, 7 = Drop off
export const ALLOWED_TRAINING_REQUEST_STATUSES = [2, 3, 7] as const;

