// Every student gets their first attempt plus this many reattempts on an official
// exam without asking. Only beyond that do they need an administrator-approved reattempt.
export const FREE_REATTEMPTS = 3;

/**
 * SQL for the number of attempts a student may take without approval. An exam's own
 * max_attempts can raise the allowance but never lower it below 1 + FREE_REATTEMPTS.
 */
export const freeAttemptsSql = (maxAttemptsColumn = "e.max_attempts") =>
  `GREATEST(COALESCE(${maxAttemptsColumn}, 1), ${1 + FREE_REATTEMPTS})`;
