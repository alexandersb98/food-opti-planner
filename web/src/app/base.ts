/** Where the React app lives until it replaces the Vue app (ticket 42 sets
 * this to "/"). Only the router's basename and the dev server's fallback
 * know about it; routes and tests use the app's own paths ("/recipes/3"). */
export const BASE_PATH = '/next'
