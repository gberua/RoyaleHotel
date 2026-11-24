/** Of the candidates for one picture slot, the first real hotel photo; a demo (stock) photo only if none is real. */
export function preferReal<T extends { isDemo: boolean }>(...candidates: (T | undefined)[]): T | undefined {
  const present = candidates.filter((c): c is T => Boolean(c));
  return present.find((c) => !c.isDemo) ?? present[0];
}
