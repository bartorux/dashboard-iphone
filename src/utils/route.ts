/**
 * The one fork in an app that otherwise never reads `location.hash` (see the
 * comment on `shortcuts` in vite.config.ts — that absence was true until this
 * file). It exists to keep the research subpage (Badanie.tsx) reachable
 * without giving it a route library, a link anyone would click by accident,
 * or a place on the main screen: typing `#badanie` is the whole contract.
 *
 * Matches "#badanie" and "#/badanie", either with or without a trailing
 * slash. Nothing else — not a bare "#", not "#badanie2", not "#Badanie" —
 * because a loose match here would make some OTHER future hash silently
 * boot the research page instead of the product.
 */
export function isBadanieHash(hash: string): boolean {
  return /^#\/?badanie\/?$/.test(hash);
}
