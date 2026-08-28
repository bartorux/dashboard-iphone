/**
 * The one honest formula for "OZE w krajowym miksie" (renewables' share of the
 * mix Poland actually consumes), used by both the generation tooltip and the
 * renewable-mix card. Extracted from GenerationChart's tooltip, which used to
 * carry this arithmetic inline — a second, unrelated card needing the same
 * number is exactly how a formula drifts into two slightly different versions.
 *
 * Denominator: country demand adjusted by cross-border exchange, i.e. the
 * generation actually staying inside Poland to be consumed — not just what
 * left the plants. Exchange is negative on export, so SUBTRACTING it INCREASES
 * the denominator (those exported electrons never reached a Polish socket):
 * measured live 28.08.2026 noon, 19 950 − (−4 640) = 24 590 MW. On import
 * exchange is positive, and subtracting it correctly shrinks the denominator
 * instead — the imported MW are already inside kseDemand, not on top of it.
 *
 * Both kseDemand and exchange are published for the CURRENT business day only
 * (pdgobpkd), so a null on any input means null out — never a silent fallback
 * that would print a number built on a made-up figure. pv/wind are equally
 * required: a data gap in either is a data gap in the share, not a share
 * computed as if the missing source produced nothing.
 */
export function renewableMixShare(
  pv: number | null,
  wind: number | null,
  kseDemand: number | null,
  exchange: number | null
): number | null {
  if (pv === null || wind === null || kseDemand === null || exchange === null) {
    return null;
  }

  const denominator = kseDemand - exchange;
  if (denominator <= 0) return null;

  return Math.round(((pv + wind) / denominator) * 100);
}
