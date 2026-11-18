// Token Radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// EVERY other rankable pre-token protocol below the watchlist floor: 158 early rows, 198 in all.
// A protocol is pre-token when its DefiLlama record carries no token (no market cap, no CoinGecko
// id, no symbol); the snapshot's live-token protocols are kept apart and shown as the market's own
// values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   sector     = median mcap/TVL of the snapshot's live-token protocols in the same category
//                (fewer than 3 live protocols: the global live median), clamped to [0.05, 1.0]
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.04 x min(max(chains - 1, 0), 5)
//   implied    = max(1, round(tvl_usd x sector x growthMult x maturity x breadth))
//
// The sector multiple is the model's one idea: the live market's own multiples calibrate what a
// new token in the same sector is worth, so a DEX is not scored like a bridge. It is computed
// from the snapshot at runtime, never hardcoded, and no protocol name is ever special-cased:
// the same function scores every row.
//
// The model is validated, not asserted. validateModel() runs three tests against the snapshot's
// own live-token protocols and reports the real numbers: leave-one-out (each live protocol
// predicted with its own record left out of the calibration), walk-forward (fit on protocols
// listed before 2025-01-01, tested on the ones listed after), and a blind holdout (every fourth
// protocol by slug held out). It also runs the same leave-one-out test with a flat 0.25 multiple,
// the starter's rule, so the fitted curve is judged against the simplest alternative. The tests
// report the median absolute log error, the share of predictions within 2x and 3x, and the
// Spearman rank correlation between predicted and actual market caps. The numbers are what they
// are: an implied value is a ranking device, not a price prediction, and the dashboard says so.
//
// Each row also carries a rank range: 200 bootstrap refits resample the live mcap/TVL ratios of
// every category with replacement, refit the sector multiples, and re-rank the whole board; the
// range is the P10-P90 of the row's rank across the refits. A row whose sector is thinly
// calibrated (few live protocols) gets a wider range, which is the honest shape of it.
//
// Each row's farm plan is costed and netted to the dollar: the capital the position needs, the
// gas of every transaction in the plan, and the total, ending in a verdict FARM / THIN / SKIP
// from the implied value, stepped down one level when the gas alone eats more than half the
// capital. The verdict is the model's advice, not a promise: it never claims a token, an
// airdrop or a points program exists.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
  sector_floor: number;
  sector_cap: number;
  sector_min_live: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.04,
  breadth_cap: 5,
  sector_floor: 0.05,
  sector_cap: 1.0,
  sector_min_live: 3,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits for the rank ranges: each refit resamples the live ratios and re-ranks the board. */
export const BOOTSTRAP_REFITS = 200;

/** The walk-forward split: the calibration is fit on live protocols listed before this date. */
export const WALK_FORWARD_CUTOFF = '2025-01-01';

/** The blind holdout: every Nth live protocol by slug is held out of the calibration. */
export const BLIND_HOLDOUT_EVERY = 4;

/** Verdict bands on implied value: at or above FARM, at or above THIN, below that SKIP. */
export const VERDICT_FARM_MIN = 10_000_000;
export const VERDICT_THIN_MIN = 2_000_000;

/** A plan steps down one verdict level when its gas alone is more than this share of its capital. */
export const VERDICT_GAS_SHARE = 0.5;

/** A farm verdict: FARM it, THIN it (small or occasional), or SKIP it. */
export type Verdict = 'FARM' | 'THIN' | 'SKIP';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    sector_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
  /** The plan's verdict: FARM, THIN or SKIP, from the implied value and the gas share. */
  verdict: Verdict;
  /** The plan's capital, in whole dollars, and its gas, in whole dollars, over the hold. */
  capital_usd: number;
  gas_usd: number;
  /** The plan's total cost: capital + gas, in whole dollars. */
  plan_cost_usd: number;
  /** The rank range: the P10-P90 of this row's rank over the bootstrap refits. */
  rank_lo: number;
  rank_hi: number;
  /** The P10 and P90 of this row's implied value over the bootstrap refits, in whole dollars. */
  implied_p10: number;
  implied_p90: number;
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  sector_multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  verdict: Verdict;
  capital_usd: number;
  gas_usd: number;
  plan_cost_usd: number;
  rank_lo: number;
  rank_hi: number;
  implied_p10: number;
  implied_p90: number;
}

/** One validation test's numbers, computed from the snapshot's live protocols. */
export interface ValidationTest {
  /** How the test was run, in one line. */
  method: string;
  /** Live protocols in the test set. */
  n_test: number;
  /** Live protocols the calibration was fit on. */
  n_fit: number;
  /** Median absolute log error, ln(predicted / actual): 0 is exact, 0.69 is a factor of two. */
  median_abs_log_error: number;
  /** Mean absolute log error. */
  mean_abs_log_error: number;
  /** Share of predictions within a factor of two of the actual market cap, 0..1. */
  within_2x: number;
  /** Share of predictions within a factor of three, 0..1. */
  within_3x: number;
  /** Spearman rank correlation between predicted and actual market caps. */
  spearman: number;
  /** Mean signed log error: negative means the model under-predicts on average. */
  bias_log: number;
}

/** The model's validation: three tests on live protocols, plus the flat-multiple baseline. */
export interface Validation {
  loo: ValidationTest;
  walk_forward: ValidationTest;
  blind: ValidationTest;
  /** The same leave-one-out test with a flat 0.25 multiple for every protocol. */
  flat_loo: ValidationTest;
  /** The top decile's median actual market cap, under leave-one-out predictions, in whole dollars. */
  top_decile_median_mcap: number;
  /** The bottom decile's median actual market cap, under leave-one-out predictions. */
  bottom_decile_median_mcap: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  sector_fallback: number;
  sectors: Record<string, number>;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** The model's validation, computed from the snapshot's live protocols. */
  validation: Validation;
  /** How many board rows carry each verdict. */
  verdict_counts: Record<Verdict, number>;
  /** The model's verdict bands, so the page states the rule it applies. */
  verdict_farm_min: number;
  verdict_thin_min: number;
  verdict_gas_share: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of numbers; the mean of the two middles when even. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The live market's mcap/TVL ratios, sorted, per category and overall: the raw material every
 * sector multiple, every validation test and every bootstrap refit draws from. Only live-token
 * protocols with a positive TVL and a positive market cap count; a negative or missing market
 * cap is not a ratio (the snapshot carries one protocol with mcap -1, and it is left out).
 */
export function liveRatioLists(protocols: SnapshotProtocol[]): { byCategory: Map<string, number[]>; all: number[] } {
  const byCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of protocols) {
    if (isPreToken(p)) continue;
    if (p.tvl_usd <= 0 || p.mcap_usd === null || p.mcap_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const cat = p.category ?? 'Other';
    const list = byCategory.get(cat) ?? [];
    list.push(ratio);
    byCategory.set(cat, list);
  }
  for (const list of byCategory.values()) list.sort((a, b) => a - b);
  all.sort((a, b) => a - b);
  return { byCategory, all };
}

/** The sector multiples from ratio lists: a category's own median when it has enough live protocols, else the global live median, clamped. */
export function sectorsFromLists(
  lists: { byCategory: Map<string, number[]>; all: number[] },
  model: ModelConstants = MODEL,
): { byCategory: Record<string, number>; fallback: number } {
  const clamp = (v: number): number => Math.min(model.sector_cap, Math.max(model.sector_floor, v));
  const fallback = clamp(median(lists.all));
  const byCategory: Record<string, number> = {};
  for (const cat of [...lists.byCategory.keys()].sort()) {
    const ratios = lists.byCategory.get(cat)!;
    byCategory[cat] = ratios.length >= model.sector_min_live ? clamp(median(ratios)) : fallback;
  }
  return { byCategory, fallback };
}

/** The sector multiple one protocol gets from a fit set's ratio lists: its category's median, or the global median. */
function sectorForProtocol(
  protocol: SnapshotProtocol,
  lists: { byCategory: Map<string, number[]>; all: number[] },
  model: ModelConstants = MODEL,
): number {
  const clamp = (v: number): number => Math.min(model.sector_cap, Math.max(model.sector_floor, v));
  const cat = protocol.category ?? 'Other';
  const ratios = lists.byCategory.get(cat);
  if (ratios !== undefined && ratios.length >= model.sector_min_live) return clamp(median(ratios));
  return clamp(median(lists.all));
}

/**
 * The sector multiples, derived from the snapshot's own live market: for each category, the
 * median market-cap-per-TVL of its live-token protocols when at least `sector_min_live` of
 * them report both figures, else the global live median. Every multiple is clamped to
 * [sector_floor, sector_cap]. Categories are returned in sorted order so the result is
 * deterministic.
 */
export function sectorMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Record<string, number>; fallback: number } {
  return sectorsFromLists(liveRatioLists(snapshot.protocols), model);
}

/** The sector multiple one category gets: its own median, or the global fallback. */
function sectorFor(category: string | null, sectors: { byCategory: Record<string, number>; fallback: number }): number {
  const key = category ?? 'Other';
  return sectors.byCategory[key] ?? sectors.fallback;
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  sectors: { byCategory: Record<string, number>; fallback: number },
  model: ModelConstants = MODEL,
): { implied: number; sector: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const sector = sectorFor(protocol.category, sectors);
  const implied = Math.max(1, Math.round(protocol.tvl_usd * sector * growthMult * maturityMult * breadthMult));
  return { implied, sector, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The live-token protocols the validation can score: a positive TVL and a positive market cap. */
export function liveUsable(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
}

/** The Spearman rank correlation of two equal-length lists, with tied values sharing the average rank. */
export function spearman(xs: number[], ys: number[]): number {
  const ranks = (arr: number[]): number[] => {
    const order = arr.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
    const out = new Array<number>(arr.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k]![1]] = avg;
      i = j + 1;
    }
    return out;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** One test's numbers from its [predicted, actual] pairs; zeros when the test set is empty. */
function testMetrics(method: string, pairs: Array<[number, number]>, nFit: number): ValidationTest {
  if (pairs.length === 0) {
    return { method, n_test: 0, n_fit: nFit, median_abs_log_error: 0, mean_abs_log_error: 0, within_2x: 0, within_3x: 0, spearman: 0, bias_log: 0 };
  }
  const errs = pairs.map(([pred, act]) => Math.log(pred / act));
  const abs = [...errs].map(Math.abs).sort((a, b) => a - b);
  const ln2 = Math.log(2);
  const ln3 = Math.log(3);
  return {
    method,
    n_test: pairs.length,
    n_fit: nFit,
    median_abs_log_error: round3(median(abs)),
    mean_abs_log_error: round3(abs.reduce((a, b) => a + b, 0) / abs.length),
    within_2x: Math.round((errs.filter((e) => Math.abs(e) <= ln2).length / errs.length) * 1000) / 1000,
    within_3x: Math.round((errs.filter((e) => Math.abs(e) <= ln3).length / errs.length) * 1000) / 1000,
    spearman: round3(spearman(pairs.map(([p]) => p), pairs.map(([, a]) => a))),
    bias_log: round3(errs.reduce((a, b) => a + b, 0) / errs.length),
  };
}

/**
 * The model's validation, computed from the snapshot's own live protocols. Three tests, each
 * predicting a live protocol's market cap with the same formula the board uses, the calibration
 * fit without the protocol being predicted:
 * - leave-one-out: every live protocol, its own record left out of the calibration;
 * - walk-forward: the calibration fit on protocols listed before WALK_FORWARD_CUTOFF, tested
 *   on the ones listed after it (protocols with no listed date sit out this test: a walk
 *   forward needs a date to walk on);
 * - blind: every BLIND_HOLDOUT_EVERY-th live protocol by slug held out, the rest the fit.
 * A fourth run repeats leave-one-out with a flat 0.25 multiple for every protocol, the starter's
 * rule, so the fitted curve is judged against the simplest alternative. The decile medians are
 * the top and bottom tenths of the leave-one-out predictions, by predicted value, and the median
 * actual market cap of each: they say whether the ranking separates the valuable from the thin,
 * which is what a radar is for.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const live = liveUsable(snapshot);
  const predictWith = (p: SnapshotProtocol, sector: number): number =>
    impliedValue(p, snapshot.as_of, { byCategory: {}, fallback: sector }, model).implied;

  // Leave-one-out, fitted.
  const looPairs: Array<[number, number]> = live.map((p) => {
    const fit = live.filter((x) => x.slug !== p.slug);
    return [predictWith(p, sectorForProtocol(p, liveRatioLists(fit), model)), p.mcap_usd!];
  });
  const loo = testMetrics('Leave-one-out: each live protocol predicted with its own record left out of the calibration.', looPairs, live.length - 1);

  // Leave-one-out, flat 0.25.
  const flatPairs: Array<[number, number]> = live.map((p) => [predictWith(p, 0.25), p.mcap_usd!]);
  const flatLoo = testMetrics('Leave-one-out with a flat 0.25 sector multiple for every protocol (the starter\u2019s rule for the multiple), keeping the growth, maturity and breadth multipliers.', flatPairs, live.length - 1);

  // Walk-forward.
  const wfFit = live.filter((p) => p.listed_at !== null && p.listed_at < WALK_FORWARD_CUTOFF);
  const wfTest = live.filter((p) => p.listed_at !== null && p.listed_at >= WALK_FORWARD_CUTOFF);
  const wfLists = liveRatioLists(wfFit);
  const wfPairs: Array<[number, number]> = wfTest.map((p) => [predictWith(p, sectorForProtocol(p, wfLists, model)), p.mcap_usd!]);
  const walkForward = testMetrics(`Walk-forward: fit on live protocols listed before ${WALK_FORWARD_CUTOFF}, tested on the ones listed after.`, wfPairs, wfFit.length);

  // Blind holdout: every Nth live protocol by slug.
  const sorted = [...live].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const blindTest = sorted.filter((_, i) => i % BLIND_HOLDOUT_EVERY === 0);
  const blindFit = sorted.filter((_, i) => i % BLIND_HOLDOUT_EVERY !== 0);
  const blindLists = liveRatioLists(blindFit);
  const blindPairs: Array<[number, number]> = blindTest.map((p) => [predictWith(p, sectorForProtocol(p, blindLists, model)), p.mcap_usd!]);
  const blind = testMetrics(`Blind holdout: every ${BLIND_HOLDOUT_EVERY}th live protocol by slug held out, the rest the fit.`, blindPairs, blindFit.length);

  // Decile separation, from the leave-one-out predictions.
  const ranked = [...looPairs].sort((a, b) => b[0] - a[0]);
  const decile = Math.max(1, Math.ceil(ranked.length / 10));
  const medianOf = (values: number[]): number => median([...values].sort((a, b) => a - b));
  const topMedian = medianOf(ranked.slice(0, decile).map(([, a]) => a));
  const bottomMedian = medianOf(ranked.slice(-decile).map(([, a]) => a));

  return {
    loo,
    walk_forward: walkForward,
    blind,
    flat_loo: flatLoo,
    top_decile_median_mcap: Math.round(topMedian),
    bottom_decile_median_mcap: Math.round(bottomMedian),
  };
}

/** A small deterministic PRNG (mulberry32): the bootstrap refits are the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const quantile = (sorted: number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;

/**
 * The rank ranges: BOOTSTRAP_REFITS refits, each resampling the live mcap/TVL ratios of every
 * category with replacement, refitting the sector multiples, and re-ranking the whole board.
 * The range is the P10-P90 of the row's rank across the refits, and the implied P10/P90 the same
 * of its implied value. One PRNG stream, drawn in a fixed order (refit, category, index), so the
 * ranges are the same on every run.
 */
export function bootstrapRankRanges(
  scored: Array<{ p: SnapshotProtocol; v: { implied: number } }>,
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): Map<string, { rank_lo: number; rank_hi: number; implied_p10: number; implied_p90: number }> {
  const lists = liveRatioLists(snapshot.protocols);
  const cats = [...lists.byCategory.keys()].sort();
  const rand = mulberry32(0xc0ffee);
  const ranksBySlug = new Map<string, number[]>();
  const impliedBySlug = new Map<string, number[]>();
  for (const s of scored) {
    ranksBySlug.set(s.p.slug, []);
    impliedBySlug.set(s.p.slug, []);
  }
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const resampled = new Map<string, number[]>();
    for (const cat of cats) {
      const src = lists.byCategory.get(cat)!;
      const draw: number[] = [];
      for (let i = 0; i < src.length; i++) draw.push(src[Math.floor(rand() * src.length)]!);
      draw.sort((a, b) => a - b);
      resampled.set(cat, draw);
    }
    const allSrc = lists.all;
    const allDraw: number[] = [];
    for (let i = 0; i < allSrc.length; i++) allDraw.push(allSrc[Math.floor(rand() * allSrc.length)]!);
    allDraw.sort((a, b) => a - b);
    const sectors = sectorsFromLists({ byCategory: resampled, all: allDraw }, model);
    const refit = scored
      .map((s) => ({ slug: s.p.slug, implied: impliedValue(s.p, snapshot.as_of, sectors, model).implied }))
      .sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    refit.forEach((row, i) => {
      ranksBySlug.get(row.slug)!.push(i + 1);
      impliedBySlug.get(row.slug)!.push(row.implied);
    });
  }
  const out = new Map<string, { rank_lo: number; rank_hi: number; implied_p10: number; implied_p90: number }>();
  for (const s of scored) {
    const ranks = [...ranksBySlug.get(s.p.slug)!].sort((a, b) => a - b);
    const implied = [...impliedBySlug.get(s.p.slug)!].sort((a, b) => a - b);
    out.set(s.p.slug, {
      rank_lo: quantile(ranks, 0.1),
      rank_hi: quantile(ranks, 0.9),
      implied_p10: quantile(implied, 0.1),
      implied_p90: quantile(implied, 0.9),
    });
  }
  return out;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's own rule keeps out: wrapped, staked or bridged products of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not begin with: an exchange's own product, not a launch of its own. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped or staked product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\bwrapped\b|\bstaked\b|\bstaking\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const sectors = sectorMultiples(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: EVERY other rankable pre-token protocol, by implied value. The board is the
  // model's ranking, so its tail is the model's next-best picks, not the biggest TVLs — and there
  // is no cap: the snapshot holds 198 rankable protocols, and the board ranks all of them.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, sectors, model) }))
    .sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, sectors, model);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const ranges = bootstrapRankRanges(scored, snapshot, model);
  return scored.map((s, i) => {
    const economics = planEconomics(s.p, s.v.age);
    const { verdict, downgraded } = verdictFor(s.v.implied, economics);
    const range = ranges.get(s.p.slug)!;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      model: {
        // Full precision on purpose: the dashboard recomputes the row from this
        // multiple, so a rounded copy here would disagree with board.json by a
        // few thousand dollars. The page rounds it to four decimals for display.
        sector_multiple: s.v.sector,
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        breadth_multiplier: round4(s.v.breadthMult),
        age_days: s.v.age,
      },
      farm_steps: farmSteps(s.p, s.v.age, s.v.implied, verdict, economics, downgraded).map(stepText),
      verdict,
      capital_usd: economics.capital,
      gas_usd: economics.gas,
      plan_cost_usd: economics.total,
      rank_lo: range.rank_lo,
      rank_hi: range.rank_hi,
      implied_p10: range.implied_p10,
      implied_p90: range.implied_p90,
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one simple transaction costs on a chain, as an estimate: gas is not in the snapshot. */
function gasFor(chain: string): string {
  switch (chain) {
    case 'Ethereum':
      return '$8';
    case 'Solana':
    case 'Sui':
    case 'Aptos':
      return '$0.05';
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'zkSync Era':
    case 'Linea':
    case 'Scroll':
    case 'Blast':
    case 'Mode':
      return '$0.50';
    case 'BSC':
      return '$0.30';
    case 'Polygon':
      return '$0.10';
    case 'Avalanche':
      return '$0.50';
    default:
      return '$1';
  }
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one simple transaction costs on a chain, in whole dollars, as an estimate: gas is not in the snapshot. */
function gasUsdFor(chain: string): number {
  switch (chain) {
    case 'Ethereum':
      return 8;
    case 'Solana':
    case 'Sui':
    case 'Aptos':
      return 0.05;
    case 'Base':
    case 'Arbitrum':
    case 'Optimism':
    case 'zkSync Era':
    case 'Linea':
    case 'Scroll':
    case 'Blast':
    case 'Mode':
      return 0.5;
    case 'BSC':
      return 0.3;
    case 'Polygon':
      return 0.1;
    case 'Avalanche':
      return 0.5;
    default:
      return 1;
  }
}

/** A plan's economics, in whole dollars: the capital, the gas of every transaction in the plan, and the total. */
export interface PlanEconomics {
  capital: number;
  gas: number;
  total: number;
  weeks: number;
  /** The gas as a share of the capital: above VERDICT_GAS_SHARE the verdict steps down one level. */
  gas_share: number;
}

/** The capital, the gas and the total of one protocol's farm plan. */
export function planEconomics(p: SnapshotProtocol, age: number | null): PlanEconomics {
  const capital = capitalFor(p);
  const gasEach = gasUsdFor(chainOf(p));
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  // One transaction to set up, one a week while holding, one to unwind.
  const gas = Math.round((gasEach * (2 + weeks)) * 100) / 100;
  const total = Math.round((capital + gas) * 100) / 100;
  return { capital, gas, total, weeks, gas_share: Math.round((gas / capital) * 1000) / 1000 };
}

/** The verdict's base band from the implied value, before the gas step-down. */
function verdictBase(implied: number): Verdict {
  if (implied >= VERDICT_FARM_MIN) return 'FARM';
  if (implied >= VERDICT_THIN_MIN) return 'THIN';
  return 'SKIP';
}

/** One step down the verdict ladder: FARM to THIN, THIN to SKIP, SKIP stays SKIP. */
function stepDown(v: Verdict): Verdict {
  if (v === 'FARM') return 'THIN';
  return 'SKIP';
}

/**
 * A row's verdict and whether the gas stepped it down: the base band from the implied value,
 * then one step down when the plan's gas alone is more than VERDICT_GAS_SHARE of its capital.
 * The rule is the same for every row, and the dashboard states it.
 */
export function verdictFor(implied: number, economics: PlanEconomics): { verdict: Verdict; downgraded: boolean } {
  const base = verdictBase(implied);
  if (economics.gas_share > VERDICT_GAS_SHARE) return { verdict: stepDown(base), downgraded: true };
  return { verdict: base, downgraded: false };
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Supply $${capital} of USDC to ${name} on ${chain} as collateral and borrow a small amount against it.`;
  if (c.includes('dex'))
    return `Provide $${capital} of liquidity to ${name}'s largest pool on ${chain} and make one swap through it.`;
  if (c.includes('yield') || c.includes('leveraged farm'))
    return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and let it compound.`;
  if (c.includes('bridge') || c.includes('cross chain'))
    return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('restak') || c.includes('staking'))
    return `Restake $${capital} of the staking asset through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative'))
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small hedged position.`;
  if (c.includes('prediction'))
    return `Fund $${capital} and place one position on a ${name} market on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
    return `Deposit $${capital} into a ${name} curated vault on ${chain} and keep the shares.`;
  if (c.includes('stable'))
    return `Mint or hold $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa'))
    return `Mint $${capital} of the yield-bearing asset on ${name} on ${chain} and hold it through one distribution.`;
  if (c.includes('insurance'))
    return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain'))
    return `Use $${capital} across ${name}'s own apps on its chain and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action, flavored by category. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex')) return `Swap a small amount through ${name} once a week to keep the position active.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
    return `Adjust the borrow or top up collateral on ${name} once a week.`;
  if (c.includes('yield') || c.includes('leveraged farm')) return `Claim or compound the yield on ${name} once a week.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge a small amount through ${name} once a week.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Rebalance the hedge on ${name} once a week.`;
  return `Make one qualifying action each week, such as a deposit, a swap or a vote.`;
}

/** A dollar amount with thousands separators, deterministic and locale-free; cents kept when present. */
function fmtUsd(n: number): string {
  const whole = Math.trunc(n);
  const cents = Math.round((n - whole) * 100);
  const intPart = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cents === 0 ? `$${intPart}` : `$${intPart}.${String(cents).padStart(2, '0')}`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a hand-written
 * list of names. The seventh step nets the plan to the dollar — the capital, the gas of every
 * transaction, the total — and ends in the verdict. It never claims the protocol has a token,
 * an airdrop or a points program: the protocol records no token, and step 5 says so by
 * conditioning the claim on a page the protocol itself publishes one day.
 */
export function farmSteps(
  p: SnapshotProtocol,
  age: number | null,
  implied: number,
  verdict: Verdict,
  economics: PlanEconomics,
  downgraded: boolean,
): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = economics.capital;
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gasPct = Math.round(economics.gas_share * 100);
  const reason =
    verdict === 'FARM'
      ? `the implied value of ${fmtUsd(implied)} puts this in the board's top group, and the plan costs ${fmtUsd(economics.total)}`
      : verdict === 'THIN'
        ? `the implied value of ${fmtUsd(implied)} is mid-board; farm it only with capital you can leave alone for ${hold} days`
        : `the implied value of ${fmtUsd(implied)} is near the board's tail, and the plan costs ${fmtUsd(economics.total)}, which the value does not justify`;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `about ${gas} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about ${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p),
      cost: `about ${gas} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `If the protocol ever publishes a points or rewards page, claim only from the link it publishes: never pay to claim, and never trust a claim link from a chat, an ad or a DM.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
    {
      text: `Total plan cost: ${fmtUsd(economics.total)} — ${fmtUsd(economics.capital)} of capital stays in the position and ${fmtUsd(economics.gas)} of gas over ${hold} days (about ${economics.weeks} weekly actions). Net: the gas is ${gasPct}% of the capital. Verdict: ${verdict} — ${reason}${downgraded ? ` (Stepped down one level: the gas alone is ${gasPct}% of the capital.)` : ''}`,
      cost: `${fmtUsd(economics.total)} in all`,
      time: `${hold} days`,
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    sector_multiple: row.model.sector_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    verdict: row.verdict,
    capital_usd: row.capital_usd,
    gas_usd: row.gas_usd,
    plan_cost_usd: row.plan_cost_usd,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    implied_p10: row.implied_p10,
    implied_p90: row.implied_p90,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const sectors = sectorMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const verdictCounts: Record<Verdict, number> = { FARM: 0, THIN: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    sector_fallback: sectors.fallback,
    sectors: sectors.byCategory,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    validation: validateModel(snapshot, model),
    verdict_counts: verdictCounts,
    verdict_farm_min: VERDICT_FARM_MIN,
    verdict_thin_min: VERDICT_THIN_MIN,
    verdict_gas_share: VERDICT_GAS_SHARE,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
