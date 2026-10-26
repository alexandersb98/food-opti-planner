// The server's limits on what the forms send, as the API describes them.
// limits.test.ts checks each one against openapi.json, so a limit changed
// on the server fails a test until it is changed here too.

/** The number of days in a plan. */
export const PLAN_DAYS = { min: 1, max: 31 }
/** The most meals a day can have. */
export const MOST_MEALS = 8
/** The longest meal name. */
export const MEAL_NAME_LENGTH = 40
/** Max solving time, in whole seconds: the solve runs inside the request. */
export const SOLVE_SECONDS = { min: 1, max: 300 }
/** An attribute's decimals, the library's precision. */
export const DECIMALS = { min: 0, max: 6 }
