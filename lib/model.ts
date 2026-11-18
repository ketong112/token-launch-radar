// Token Radar's model, radar-4: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// EVERY other rankable pre-token protocol: 158 early rows, 198 in all. A protocol is pre-token
// when its DefiLlama record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never
// mixed into the ranked board. Every one of the 758 protocols is accounted for in the ledger:
// ranked, traded, on record, or set aside with a reason.
//
// Implied value follows only from the snapshot's own figures, through a size curve fitted on
// the snapshot's traded tokens:
//
//   value = 10^a · TVL^b · sector · kinship
//
// a and b are the Theil–Sen line of log10(market cap) on log10(TVL) over the comparables —
// one comparable per token that trades, listings that share a ticker and a name stem merged
// into one family with their TVL summed. A dollar of TVL is worth less in a big protocol
// (b < 1), so the curve compresses the giants instead of scoring them like small ones. The
// sector effect is each sector's median residual off the curve, shrunk toward zero by four
// pseudo-comparables. Kinship: a row whose name stem already carries a token on record is
// worth a quarter (×0.25) — the launch value is shared with the token that exists; a row
// above the floor but off the watchlist is filed under a parent listing, so its TVL is
// shared and its value is halved on the curve (×2^(b−1)).
//
// The comparables are the traded tokens that can be compared to a launch: the house's own
// categories (bridges, liquid staking, exchanges) price a chain, an exchange or a staked
// asset, not a launch, and a token whose cap equals its TVL within 1.5% is a deposit
// receipt, not a launch — both are left out of the fit, and the ledger says so. 90 of the
// 128 traded tokens qualify.
//
// The model is validated, not asserted. validateModel() runs the ladder: four levels
// (flat multiple → size curve → + sector → + 7-day growth and age), each tested
// leave-one-out and older-to-newer (fit on tokens on record 900+ days, tested on the
// newer ones), and reports the real numbers. The shipped level is the highest whose every
// added term improves BOTH tests — growth and age were tested and dropped: they improve
// older-to-newer slightly and worsen leave-one-out, so the blind test does not keep them.
// The ladder is printed in full on the dashboard, including the dropped level, and the same
// ladder is run on all 128 traded tokens as a robustness check. The numbers are what they
// are: an implied value is a ranking device, not a price prediction, and the dashboard
// says so.
//
// Each row also carries two ranges: the P10–P90 of its rank over 200 bootstrap refits
// (the curve refit on resampled comparables, the whole board re-ranked), and a blind-miss
// range — half the blind misses of tokens like it fall inside it — with the hold rate
// (how often the range actually held, leave-one-out and older-to-newer).
//
// Each row's farm plan is costed and netted to the dollar on a fixed $1,000 ticket: the
// slice is the ticket's share of the implied value, the fees are every transaction's gas
// plus the play's own fees, the forgone is the T-bill yield the ticket gives up, and the
// verdict is FARM when the net is positive, THIN when the slice covers the fees, SKIP
// otherwise. Every row also carries its break-even ticket and its dollars per hour. The
// verdict is the model's advice, not a promise: it never claims a token, an airdrop or a
// points program exists.

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
  pseudo_comps: number;
  receipt_band: number;
  growth_cap: number;
  age_share: number;
  age_clamp: [number, number];
  young_days: number;
  kin_token: number;
  capital: number;
  airdrop_share: number;
  tbill: number;
  points_window: number;
}

export const MODEL: ModelConstants = {
  pseudo_comps: 4,
  receipt_band: 0.015,
  growth_cap: 0.4,
  age_share: 0.25,
  age_clamp: [0.9, 1.15],
  young_days: 540,
  kin_token: 0.25,
  capital: 1000,
  airdrop_share: 0.1,
  tbill: 0.04,
  points_window: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** The shipped fit level: 2 — size curve + sector. Level 3 (growth, age) was tested and dropped. */
export const SHIPPED_LEVEL = 2;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits for the rank ranges: each refit resamples the comparables and re-ranks the board. */
export const BOOTSTRAP_REFITS = 200;

/** The walk-forward split: the calibration is fit on comparables listed before this date. */
export const WALK_FORWARD_CUTOFF = '2025-01-01';

/** The blind holdout: every Nth comparable by slug is held out of the calibration. */
export const BLIND_HOLDOUT_EVERY = 4;

/** The older-to-newer split: comparables on record this long, or undated, are the older set. */
export const OLDER_DAYS = 900;

/** A farm verdict: FARM it, THIN it (small or occasional), or SKIP it. */
export type Verdict = 'FARM' | 'THIN' | 'SKIP';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A row's kinship: its name stem already carries a token, or it is filed under a parent listing. */
export type Kinship = 'token' | 'parent' | null;

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
    curve: number;
    sector_effect: number;
    sector: string;
    kinship: number;
    kin: Kinship;
    age_days: number | null;
    excess: number;
  };
  /** watchlist, shared (filed under a parent listing), or early. */
  tier: 'watchlist' | 'shared' | 'early';
  /** The farm play's key, e.g. 'vault'; the page's knob re-plans from it. */
  play: string;
  play_label: string;
  chain: string;
  hold_days: number;
  slice_usd: number;
  fees_usd: number;
  forgone_usd: number;
  net_usd: number;
  per_hour_usd: number;
  break_even_usd: number | null;
  farm_steps: string[];
  /** The plan's verdict: FARM, THIN or SKIP, from the plan's net economics. */
  verdict: Verdict;
  /** The plan's ticket, in whole dollars — the same $1,000 on every row. */
  capital_usd: number;
  /** The plan's gas, in whole dollars, over the hold. */
  gas_usd: number;
  /** The plan's total cost: all its fees, in whole dollars. */
  plan_cost_usd: number;
  /** A digest of the farm steps, so the page can prove its plan text is board.json's text. */
  plan_digest: string;
  /** The rank range: the P10–P90 of this row's rank over the bootstrap refits. */
  rank_lo: number;
  rank_hi: number;
  /** The P10 and P90 of this row's implied value over the bootstrap refits, in whole dollars. */
  implied_p10: number;
  implied_p90: number;
  /** The blind-miss range: the implied value divided and multiplied by the blind miss of tokens like it. */
  low: number;
  high: number;
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
  curve: number;
  sector_effect: number;
  sector: string;
  kinship: number;
  kin: Kinship;
  tier: 'watchlist' | 'shared' | 'early';
  play: string;
  play_label: string;
  chain: string;
  hold_days: number;
  slice_usd: number;
  fees_usd: number;
  forgone_usd: number;
  net_usd: number;
  per_hour_usd: number;
  break_even_usd: number | null;
  verdict: Verdict;
  capital_usd: number;
  gas_usd: number;
  plan_cost_usd: number;
  plan_digest: string;
  rank_lo: number;
  rank_hi: number;
  implied_p10: number;
  implied_p90: number;
  low: number;
  high: number;
}

/** One traded token's blind price: what the fitted curve says it is worth, never having seen it. */
export interface TradedRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  blind_usd: number;
  /** The blind price divided by the real market cap, as a factor: 1 is exact, 3 is threefold off. */
  miss_x: number;
}

/** One set-aside protocol: it records no token, and the reason it is not ranked. */
export interface AsideRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  reason: string;
}

/** One ledger group: every protocol lands in exactly one group, with the reason. */
export interface LedgerRow {
  group: string;
  count: number;
  reason: string;
}

/** One rung of the validation ladder. */
export interface LadderRung {
  level: number;
  name: string;
  loo_miss: number;
  loo_within3: number;
  loo_n: number;
  o2n_miss: number;
  o2n_within3: number;
  o2n_n: number;
}

/** The blind-miss ranges and how often they held. */
export interface RangeTest {
  young_miss: number;
  seasoned_miss: number;
  n_young: number;
  loo_holds: number;
  loo_n: number;
  o2n_holds: number;
  o2n_n: number;
}

/** One validation test's numbers, computed from the snapshot's own comparables. */
export interface ValidationTest {
  /** How the test was run, in one line. */
  method: string;
  /** Comparables in the test set. */
  n_test: number;
  /** Comparables the calibration was fit on. */
  n_fit: number;
  /** Median miss as a factor: 1 is exact, 3 is threefold off. */
  median_miss_x: number;
  /** Share of predictions within a factor of three of the actual market cap, 0..1. */
  within_3x: number;
  /** Spearman rank correlation between predicted and actual market caps. */
  spearman: number;
}

/** The model's validation: the ladder on the fit set and on all traded tokens, plus the other tests. */
export interface Validation {
  ladder: LadderRung[];
  ladder_all: LadderRung[];
  walk_forward: ValidationTest;
  blind: ValidationTest;
  /** The same blind holdout with a flat multiple, so the split's own difficulty is visible. */
  blind_flat: ValidationTest;
  ranges: RangeTest;
  /** The top decile's median actual market cap, under leave-one-out predictions, in whole dollars. */
  top_decile_median_mcap: number;
  /** The bottom decile's median actual market cap, under leave-one-out predictions. */
  bottom_decile_median_mcap: number;
  /** Comparables in the fit set (traded tokens that can be compared to a launch). */
  comps_n: number;
  /** Traded tokens in all, fit set or not. */
  comps_all_n: number;
  /** Comparables on record 900+ days, and newer ones, in the older-to-newer split. */
  older_n: number;
  newer_n: number;
  /** The fitted curve: intercept and slope of log10(market cap) on log10(TVL). */
  curve_a: number;
  curve_b: number;
  /** The fitted sector effects, in log10. */
  sector_effects: Record<string, number>;
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

/** The farm play table the page re-plans from, carried in data.js so the dashboard stays small. */
export interface FarmTable {
  capital: number;
  share: number;
  tbill: number;
  plays: Record<string, { label: string; hold: number; tx: [number, number, number, number]; pct: [number, number]; carry: number; min: [number, number, number]; enter: string; qualify: string; watch: string; stop: string; qualify_first?: boolean }>;
  chain_cost: Record<string, [number, number]>;
}

/** Everything the dashboard needs: the board, the live set, the ledger, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  curve_a: number;
  curve_b: number;
  sector_effects: Record<string, number>;
  comps_n: number;
  comps_all_n: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
  /** The model's validation, computed from the snapshot's own comparables. */
  validation: Validation;
  /** How many board rows carry each verdict. */
  verdict_counts: Record<Verdict, number>;
  /** The ledger: all 758 protocols, each in exactly one group. */
  ledger: LedgerRow[];
  /** The traded-token tab: every token that trades, with its blind price and miss. */
  traded: TradedRow[];
  /** The set-aside tab: every pre-token protocol the board does not rank, with its reason. */
  aside: AsideRow[];
  /** The farm play table: the page re-plans live from it when the ticket or share knob moves. */
  farm: FarmTable;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const LOG10 = (x: number): number => Math.log(x) / Math.LN10;

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

/** The median of a list of numbers; the mean of the two middles when even. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = (s.length - 1) / 2;
  return (s[Math.floor(mid)]! + s[Math.ceil(mid)]!) / 2;
}

/** Theil–Sen line: the median of every pairwise slope, so one 400× outlier cannot tilt the curve. */
function theilSen(points: Array<[number, number]>): { a: number; b: number } {
  const slopes: number[] = [];
  points.forEach(([x1, y1], i) => {
    for (const [x2, y2] of points.slice(i + 1)) if (x2 !== x1) slopes.push((y2 - y1) / (x2 - x1));
  });
  const b = median(slopes);
  return { a: median(points.map(([x, y]) => y - b * x)), b };
}

/** A dollar amount with thousands separators, deterministic and locale-free; cents kept when present; negatives keep their sign. */
export function fmtUsd(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  const whole = Math.trunc(a);
  const cents = Math.round((a - whole) * 100);
  const intPart = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return cents === 0 ? `${sign}$${intPart}` : `${sign}$${intPart}.${String(cents).padStart(2, '0')}`;
}

/** FNV-1a over the joined strings, so the page can prove its plan text is board.json's text. */
export function digest(strings: string[]): string {
  const s = strings.join('\n');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

// ---------------------------------------------------------------- comparables

/** Six sectors, because DefiLlama's 40 categories leave most of them with one comparable or none. */
const SECTORS: Record<string, string> = {
  Vaults: 'Risk Curators|Onchain Capital Allocator|Yield|Yield Aggregator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault',
  Dollars: 'Basis Trading|CDP|CDP Manager|Stablecoin Wrapper|Dual-Token Stablecoin|CeDeFi',
  RWA: 'RWA|RWA Lending',
  Lending: 'Lending|Uncollateralized Lending|Collateral Markets|Collateral Management',
  Trading: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|OTC Marketplace|NFT Marketplace|Launchpad',
};

/** A category's sector: the first sector that lists it, else Network. */
export function sectorOf(category: string | null): string {
  const cat = category ?? '';
  for (const s of Object.keys(SECTORS)) if (SECTORS[s]!.split('|').indexOf(cat) >= 0) return s;
  return 'Network';
}

/** 'trades': a market cap. 'on-record': a ticker or CoinGecko id, no cap. 'none': neither. */
export function tokenStatus(p: SnapshotProtocol): 'trades' | 'on-record' | 'none' {
  return p.mcap_usd !== null && p.mcap_usd > 0 ? 'trades' : p.gecko_id !== null || p.symbol !== null ? 'on-record' : 'none';
}

/** Categories the watchlist's own rule keeps out: wrapped, staked or bridged products of a token that trades. */
const HOUSE_CATEGORIES = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX'];

/** The house's own watchlist rule (the kit's input/README.md), reused to sort protocols below its floor. */
export function houseRule(p: SnapshotProtocol): string | null {
  const at = HOUSE_CATEGORIES.indexOf(p.category ?? '');
  if (at >= 0) return at < 2 ? 'Bridge' : at < 5 ? 'Liquid staking' : 'Exchange custody';
  if (/^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/.test(p.name)) return 'Exchange custody';
  if (/\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/.test(p.name)) return 'Versioned listing';
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return 'Wrapped or staked';
  return null;
}

/** A name's stem: its first word, lowercased — the token a name already carries, if any. */
export function stem(name: string): string {
  return name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? '';
}

/** One comparable: a token that trades, with the figures the curve is fit on. */
export interface Comparable {
  slug: string;
  name: string;
  symbol: string;
  sector: string;
  tvl: number;
  mcap: number;
  members: number;
  age: number | null;
  excess: number;
  x: number;
  y: number;
  /** Why this token is left out of the fit set, or null: it compares to a launch. */
  skip: string | null;
}

/** A week's TVL growth read against the market's (this snapshot's median protocol shrank that week). */
function excessGrowth(change7d: number | null, marketWeek: number, model: ModelConstants = MODEL): number {
  if (change7d === null) return 0;
  return Math.min(model.growth_cap, Math.max(-model.growth_cap, (1 + change7d / 100) / (1 + marketWeek / 100) - 1));
}

/**
 * The comparables: one per token that trades; listings sharing its ticker and name stem are
 * one family whose TVL is summed. A comparable is skipped when it cannot be compared to a
 * launch: the house categories price a chain, an exchange or a staked asset, and a cap
 * within 1.5% of TVL is a deposit receipt, not a launch.
 */
export function buildComps(snapshot: Snapshot, marketWeek: number, model: ModelConstants = MODEL): Comparable[] {
  const tickers = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record' && p.symbol !== null);
  const sameFamily = (s: string, t: string): boolean =>
    t === s || (Math.min(t.length, s.length) > 3 && (t.indexOf(s) === 0 || s.indexOf(t) === 0));
  return snapshot.protocols
    .filter((p) => tokenStatus(p) === 'trades')
    .map((p) => {
      const own = stem(p.name);
      let tvl = p.tvl_usd;
      let members = 1;
      for (const q of tickers) {
        if (q.symbol === p.symbol && sameFamily(own, stem(q.name))) {
          tvl += q.tvl_usd;
          members++;
        }
      }
      let skip: string | null = null;
      if (HOUSE_CATEGORIES.indexOf(p.category ?? '') >= 0) skip = 'prices a chain, exchange or staked asset';
      else if (Math.abs(p.mcap_usd! / tvl - 1) < model.receipt_band) skip = 'receipt token: cap equals TVL';
      return {
        slug: p.slug,
        name: p.name,
        symbol: p.symbol ?? p.gecko_id ?? '',
        sector: sectorOf(p.category),
        tvl,
        mcap: p.mcap_usd!,
        members,
        age: ageDays(snapshot.as_of, p.listed_at),
        excess: excessGrowth(p.change_7d, marketWeek, model),
        x: LOG10(tvl),
        y: LOG10(p.mcap_usd!),
        skip,
      };
    });
}

/** A fitted curve, by level. 0: one flat cap/TVL multiple. 1: the size curve. 2: + sector. 3: + momentum and age. */
export interface CurveFit {
  level: number;
  a: number;
  b: number;
  sector: Record<string, number>;
  ageSlope: number;
  ageRef: number;
}

/** The fit, by level, on a set of comparables. */
export function fitCurve(comps: Comparable[], level: number, model: ModelConstants = MODEL): CurveFit {
  if (level === 0) return { level: 0, a: median(comps.map((c) => c.y - c.x)), b: 1, sector: {}, ageSlope: 0, ageRef: 0 };
  const line = theilSen(comps.map((c) => [c.x, c.y] as [number, number]));
  const fit: CurveFit = { level, a: line.a, b: line.b, sector: {}, ageSlope: 0, ageRef: 0 };
  if (level === 1) return fit;
  const left: Record<string, number[]> = {};
  for (const c of comps) {
    const list = left[c.sector] ?? [];
    list.push(c.y - fit.a - fit.b * c.x);
    left[c.sector] = list;
  }
  for (const [s, res] of Object.entries(left)) fit.sector[s] = (res.length * median(res)) / (res.length + model.pseudo_comps);
  if (level === 2) return fit;
  const dated = comps
    .filter((c) => c.age !== null)
    .map((c) => [LOG10(c.age!), c.y - fit.a - fit.b * c.x - (fit.sector[c.sector] ?? 0)] as [number, number]);
  fit.ageSlope = theilSen(dated).b * model.age_share;
  fit.ageRef = median(dated.map(([lx]) => lx));
  return fit;
}

/** A fitted curve's age factor: newer tokens trade richer, but the tilt stays slight. */
function ageFactor(fit: CurveFit, age: number | null, model: ModelConstants = MODEL): number {
  if (age === null || !fit.ageSlope) return 1;
  return Math.min(model.age_clamp[1], Math.max(model.age_clamp[0], Math.pow(10, fit.ageSlope * (LOG10(Math.max(age, 30)) - fit.ageRef))));
}

/** log10 of the cap a fit gives one comparable: the same sum the board's value multiplies out. */
export function predictLog(fit: CurveFit, c: Comparable, model: ModelConstants = MODEL): number {
  let v = fit.a + fit.b * c.x + (fit.sector[c.sector] ?? 0);
  if (fit.level >= 3) v += fit.b * LOG10(1 + c.excess) + LOG10(ageFactor(fit, c.age, model));
  return v;
}

/** One rung's numbers: the median miss as a factor, and the share within threefold. */
function scoreErrors(errors: number[]): { miss: number; within3: number; n: number } {
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  return { miss: Math.pow(10, median(abs)), within3: abs.filter((e) => e <= LOG10(3)).length / abs.length, n: abs.length };
}

/** Whether a comparable belongs to the older set: 900+ days on record, or undated. */
const isOlder = (c: Comparable): boolean => c.age === null || c.age >= OLDER_DAYS;

/**
 * Every comparable priced blind at each level, two ways: by a fit on all the others (each
 * left out), and by a fit on the older tokens only (older-to-newer). Level 3's blind price
 * is kept on each comparable for the range test.
 */
export function backtest(comps: Comparable[], model: ModelConstants = MODEL): { ladder: LadderRung[]; older: number; newer: number } {
  const names = ['One flat cap/TVL multiple', '+ size curve (TVL^b)', '+ sector', '+ 7-day growth, age'];
  const older = comps.filter(isOlder);
  const newer = comps.filter((c) => !isOlder(c));
  const without = (list: Comparable[], i: number): Comparable[] => list.filter((_, j) => j !== i);
  const ladder: LadderRung[] = names.map((name, level) => {
    const loo = scoreErrors(
      comps.map((c, i) => c.y - predictLog(fitCurve(without(comps, i), level, model), c, model)),
    );
    const early = fitCurve(older, level, model);
    const o2n = scoreErrors(newer.map((c) => c.y - predictLog(early, c, model)));
    return { level, name, loo_miss: loo.miss, loo_within3: loo.within3, loo_n: loo.n, o2n_miss: o2n.miss, o2n_within3: o2n.within3, o2n_n: o2n.n };
  });
  return { ladder, older: older.length, newer: newer.length };
}

/**
 * The printed range: half the blind misses of tokens like it (under or over 18 months on
 * record) fall inside. Then tested on tokens it never saw: each left out against the
 * others' misses, and older-to-newer.
 */
export function rangeTest(comps: Comparable[], blindBySlug: Map<string, number>): RangeTest {
  const missOf = (c: Comparable): number => Math.abs(c.y - LOG10(blindBySlug.get(c.slug)!));
  const isYoung = (c: Comparable): boolean => c.age !== null && c.age < MODEL.young_days;
  const young = comps.filter(isYoung);
  const seasoned = comps.filter((c) => !isYoung(c));
  const each = comps.filter((c) => {
    const peers = (isYoung(c) ? young : seasoned).filter((o) => o !== c);
    return missOf(c) <= median(peers.map(missOf));
  }).length;
  const older = comps.filter(isOlder);
  const newer = comps.filter((c) => !isOlder(c));
  const fitOld = fitCurve(older, SHIPPED_LEVEL);
  const width = median(
    older.map((c, i) => Math.abs(c.y - predictLog(fitCurve(older.filter((_, j) => j !== i), SHIPPED_LEVEL), c))),
  );
  return {
    young_miss: Math.pow(10, median(young.map(missOf))),
    seasoned_miss: Math.pow(10, median(seasoned.map(missOf))),
    n_young: young.length,
    loo_holds: each,
    loo_n: comps.length,
    o2n_holds: newer.filter((c) => Math.abs(c.y - predictLog(fitOld, c)) <= width).length,
    o2n_n: newer.length,
  };
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

/** One test's numbers from its [predicted, actual] pairs in log10; zeros when the test set is empty. */
function testMetrics(method: string, pairs: Array<[number, number]>, nFit: number): ValidationTest {
  if (pairs.length === 0) return { method, n_test: 0, n_fit: nFit, median_miss_x: 0, within_3x: 0, spearman: 0 };
  const errs = pairs.map(([pred, act]) => Math.log10(pred / act));
  const abs = [...errs].map(Math.abs).sort((a, b) => a - b);
  return {
    method,
    n_test: pairs.length,
    n_fit: nFit,
    median_miss_x: round3(Math.pow(10, median(abs))),
    within_3x: Math.round((errs.filter((e) => Math.abs(e) <= LOG10(3)).length / errs.length) * 1000) / 1000,
    spearman: round3(spearman(pairs.map(([p]) => p), pairs.map(([, a]) => a))),
  };
}

// ---------------------------------------------------------------- validation

/**
 * The model's validation, computed from the snapshot's own comparables. The ladder runs on
 * the fit set (90 comparables) and again on all 128 traded tokens as a robustness check;
 * walk-forward fits on comparables listed before WALK_FORWARD_CUTOFF and tests the ones
 * listed after; the blind holdout holds out every fourth comparable by slug and runs the
 * same split with a flat multiple, so the split's own difficulty is visible. The decile
 * medians are the top and bottom tenths of the leave-one-out predictions, by predicted
 * value, and the median actual market cap of each.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): Validation {
  const marketWeek = median(snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d!));
  const tokens = buildComps(snapshot, marketWeek, model);
  const comps = tokens.filter((c) => c.skip === null);
  const bt = backtest(comps, model);
  const btAll = backtest(tokens, model);
  const fit = fitCurve(comps, SHIPPED_LEVEL, model);

  // Blind prices at the shipped level, leave-one-out: the range test and the traded tab read them.
  const blindBySlug = new Map<string, number>();
  comps.forEach((c, i) => {
    const rest = comps.filter((_, j) => j !== i);
    blindBySlug.set(c.slug, Math.pow(10, predictLog(fitCurve(rest, SHIPPED_LEVEL, model), c, model)));
  });

  // Walk-forward on the fit set.
  const wfFit = comps.filter((c) => {
    const p = snapshot.protocols.find((q) => q.slug === c.slug);
    return p !== undefined && p.listed_at !== null && p.listed_at < WALK_FORWARD_CUTOFF;
  });
  const wfTest = comps.filter((c) => {
    const p = snapshot.protocols.find((q) => q.slug === c.slug);
    return p !== undefined && p.listed_at !== null && p.listed_at >= WALK_FORWARD_CUTOFF;
  });
  const wfFitCurve = fitCurve(wfFit, SHIPPED_LEVEL, model);
  const walkForward = testMetrics(
    `Walk-forward: fit on comparables listed before ${WALK_FORWARD_CUTOFF}, tested on the ones listed after.`,
    wfTest.map((c) => [Math.pow(10, predictLog(wfFitCurve, c, model)), c.mcap] as [number, number]),
    wfFit.length,
  );

  // Blind holdout: every Nth comparable by slug, shipped level and flat on the same split.
  const sorted = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const blindTest = sorted.filter((_, i) => i % BLIND_HOLDOUT_EVERY === 0);
  const blindFit = sorted.filter((_, i) => i % BLIND_HOLDOUT_EVERY !== 0);
  const blindCurve = fitCurve(blindFit, SHIPPED_LEVEL, model);
  const blindFlat = fitCurve(blindFit, 0, model);
  const blind = testMetrics(
    `Blind holdout: every ${BLIND_HOLDOUT_EVERY}th comparable by slug held out, the rest the fit.`,
    blindTest.map((c) => [Math.pow(10, predictLog(blindCurve, c, model)), c.mcap] as [number, number]),
    blindFit.length,
  );
  const blindFlatTest = testMetrics(
    'Blind holdout with a flat multiple on the same split, so the split\u2019s own difficulty is visible.',
    blindTest.map((c) => [Math.pow(10, predictLog(blindFlat, c, model)), c.mcap] as [number, number]),
    blindFit.length,
  );

  // Decile separation, from the leave-one-out blind prices.
  const ranked = [...comps].sort((a, b) => blindBySlug.get(b.slug)! - blindBySlug.get(a.slug)!);
  const decile = Math.max(1, Math.ceil(ranked.length / 10));
  const topMedian = median(ranked.slice(0, decile).map((c) => c.mcap));
  const bottomMedian = median(ranked.slice(-decile).map((c) => c.mcap));

  return {
    ladder: bt.ladder,
    ladder_all: btAll.ladder,
    walk_forward: walkForward,
    blind,
    blind_flat: blindFlatTest,
    ranges: rangeTest(comps, blindBySlug),
    top_decile_median_mcap: Math.round(topMedian),
    bottom_decile_median_mcap: Math.round(bottomMedian),
    comps_n: comps.length,
    comps_all_n: tokens.length,
    older_n: bt.older,
    newer_n: bt.newer,
    curve_a: fit.a,
    curve_b: fit.b,
    sector_effects: fit.sector,
  };
}

// ---------------------------------------------------------------- value

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the watchlist's own rule keeps out: wrapped, staked or bridged products of a token that trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a protocol must not begin with: an exchange's own product, not a launch of its own. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped or staked product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\bwrapped\b|\bstaked\b|\bstaking\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((x) => p.name.startsWith(x))) return false;
  return true;
}

/** The multipliers and the implied value one protocol gets under the shipped fit. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: CurveFit,
  marketWeek: number,
  kin: Kinship,
  model: ModelConstants = MODEL,
): { implied: number; curve: number; sectorEffect: number; kinship: number; sector: string; age: number | null; excess: number } {
  const sector = sectorOf(protocol.category);
  const age = ageDays(asOf, protocol.listed_at);
  const excess = excessGrowth(protocol.change_7d, marketWeek, model);
  const curve = Math.pow(10, fit.a + fit.b * LOG10(protocol.tvl_usd));
  const sectorEffect = fit.sector[sector] ?? 0;
  const kinship = kin === 'token' ? model.kin_token : kin === 'parent' ? Math.pow(2, fit.b - 1) : 1;
  const implied = Math.max(1, Math.round(curve * Math.pow(10, sectorEffect) * kinship));
  return { implied, curve, sectorEffect, kinship, sector, age, excess };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------- farm plans

/** One play: a mechanism's shape — ten plays, one per way a protocol earns a farmer's activity. */
interface Play {
  label: string;
  hold: number;
  tx: [number, number, number, number];
  pct: [number, number];
  carry: number;
  min: [number, number, number];
  enter: string;
  qualify: string;
  watch: string;
  stop: string;
  qualify_first?: boolean;
}

const PLAYS: Record<string, Play> = {
  vault: {
    label: 'Curated vault', hold: 90, tx: [2, 0, 0, 1], pct: [0, 0], carry: 0, min: [10, 5, 5],
    enter: "Approve and deposit {C} USDC into {N}'s largest vault on {chain}; keep the vault shares in this wallet.",
    qualify: "Join {N}'s points or referral page with this wallet in week one, if it has one; do not move the deposit.",
    watch: "note the vault's share price and TVL",
    stop: 'the share price falls while its asset is flat',
  },
  lend: {
    label: 'Supply and borrow', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0.0075, min: [10, 10, 5],
    enter: 'Approve and supply {C} USDC to {N} on {chain}.',
    qualify: 'Borrow {C/4} of a stablecoin against it and hold it: both sides earn credit. About 3% a year; keep health above 2.',
    watch: 'check the health factor and the supply rate',
    stop: 'health nears 1.5 or utilisation pins at 100%',
  },
  dollar: {
    label: 'Yield dollar', hold: 90, tx: [2, 1, 0, 2], pct: [0.001, 0], carry: 0, min: [10, 5, 5],
    enter: "Mint or buy {C} of {N}'s dollar on {chain} with USDC, about 0.1% in fees.",
    qualify: "Stake it into its yield-bearing form in {N}'s own app, where points accrue; a DEX pool does not count.",
    watch: 'check the peg and the backing report',
    stop: 'it trades under $0.995 for a day or backing is under 100%',
  },
  cdp: {
    label: 'Mint against collateral', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0.0167, min: [15, 5, 5],
    enter: 'Lock {C} of collateral on {N} on {chain} and mint {C/3} of its stablecoin: a 300% ratio, about 5% a year.',
    qualify: "Put the minted stablecoin in {N}'s savings or stability module, so debt and deposit both count.",
    watch: 'check the collateral ratio and the peg',
    stop: 'the ratio falls under 200% or the stablecoin slips under $0.99',
  },
  rwa: {
    label: 'Tokenised asset', hold: 90, tx: [2, 0, 0, 1], pct: [0.002, 0], carry: 0, min: [15, 20, 5],
    enter: "Mint or buy {C} of {N}'s tokenised asset on {chain}, about 0.2% in fees; read the redemption notice first.",
    qualify: "Pass {N}'s KYC or whitelist form with this wallet before funding it, if asked; allow 1 to 3 days.",
    watch: 'check NAV and the redemption queue',
    stop: 'redemptions pause or NAV is marked down',
    qualify_first: true,
  },
  pool: {
    label: 'Liquidity and swaps', hold: 60, tx: [3, 0, 1, 1], pct: [0, 0.0003], carry: 0, min: [15, 5, 10],
    enter: "Approve both tokens and add {C} to {N}'s deepest pool on {chain}, in its most liquid pair.",
    qualify: "Set a weekly reminder for one {C/10} swap through {N}'s own router (0.3% fee): programmes score fees and active weeks.",
    watch: "make the swap and check the pool's range",
    stop: 'impermanent loss passes 2%',
  },
  perps: {
    label: 'Margin and volume', hold: 60, tx: [2, 0, 2, 1], pct: [0, 0.001], carry: 0, min: [10, 5, 15],
    enter: 'Deposit {C} USDC as margin on {N} on {chain}.',
    qualify: 'Set a weekly reminder for one round trip: open and close {C} of notional at 1x on a major pair, 0.05% taker fee each way.',
    watch: 'make the round trip and total fees and funding',
    stop: 'fees and funding pass 3% of margin',
  },
  market: {
    label: 'Prediction volume', hold: 60, tx: [2, 0, 2, 1], pct: [0, 0.001], carry: 0, min: [10, 5, 15],
    enter: 'Deposit {C} USDC on {N} on {chain}.',
    qualify: 'Set a weekly reminder for one trade: buy then sell {C/4} of shares in a liquid market priced 0.20 to 0.80, with limit orders.',
    watch: 'make the trade and total the spread paid',
    stop: 'spread and fees pass 3% of the deposit',
  },
  stake: {
    label: 'Stake or restake', hold: 90, tx: [2, 1, 0, 2], pct: [0, 0], carry: 0, min: [10, 10, 5],
    enter: 'Stake or restake {C} of the asset {N} accepts on {chain}; note the unbonding period first.',
    qualify: "Delegate to an operator or pool in {N}'s own app; keep the receipt token in this wallet.",
    watch: "check the operator's status and reward rate",
    stop: 'the operator is slashed or withdrawals queue over a week',
  },
  network: {
    label: 'Use the network', hold: 90, tx: [2, 0, 1, 1], pct: [0, 0], carry: 0, min: [15, 5, 5],
    enter: 'Move {C} onto {N} on {chain} through its own bridge or app, so the activity is credited to this wallet.',
    qualify: 'Set a weekly reminder for one real transfer, payment or contract call: network drops count active weeks and actions.',
    watch: 'make the transaction and check the fee',
    stop: 'the bridge pauses withdrawals',
  },
};

const PLAY_BY_CATEGORY: Record<string, string> = {
  Lending: 'lend', 'Uncollateralized Lending': 'lend', 'Collateral Markets': 'lend', CDP: 'cdp', 'CDP Manager': 'cdp', Dexs: 'pool',
  'Prediction Market': 'market', Restaking: 'stake', 'Staking Pool': 'stake', 'Governance Incentives': 'stake', Insurance: 'stake',
};
const PLAY_BY_SECTOR: Record<string, string> = { Vaults: 'vault', Dollars: 'dollar', RWA: 'rwa', Lending: 'lend', Trading: 'perps', Network: 'network' };

/** A protocol's play, from its category first, then its sector. */
export function playOf(category: string | null): string {
  return PLAY_BY_CATEGORY[category ?? ''] ?? PLAY_BY_SECTOR[sectorOf(category)] ?? 'network';
}

/** [gas per transaction, fee to fund the wallet from an exchange], in dollars, by DefiLlama's chain names. */
const CHAIN_COST: Record<string, [number, number]> = {
  Ethereum: [2.5, 4], Bitcoin: [1.5, 2], Tron: [1, 1.5], Binance: [0.1, 0.3], Avalanche: [0.05, 0.5], Polygon: [0.01, 0.3],
  Solana: [0.005, 1], Sui: [0.005, 0.5], Aptos: [0.005, 0.5], Stellar: [0.001, 0.2], Algorand: [0.001, 0.2],
  Base: [0.03, 0.5], Arbitrum: [0.03, 0.5], Optimism: [0.03, 0.5], Ink: [0.03, 1], Monad: [0.01, 1], 'Hyperliquid L1': [0.01, 1],
};

const chainCost = (chain: string): [number, number] => CHAIN_COST[chain] ?? [0.05, 1.5];

/** A protocol's first three chains hold most of its TVL; the plan runs on the cheapest of them. */
export function farmChain(chains: string[]): string {
  return chains.slice(0, 3).sort((a, b) => chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b))[0] ?? 'its main chain';
}

/** The farm play table, for data.js: the page re-plans live from it when a knob moves. */
export function farmTable(model: ModelConstants = MODEL): FarmTable {
  return { capital: model.capital, share: model.airdrop_share, tbill: model.tbill, plays: PLAYS, chain_cost: CHAIN_COST };
}

/** Fill a play's {C}, {C/4}, {N} and {chain} placeholders. */
function fill(t: string, capital: number, name: string, chain: string): string {
  return t
    .replace(/\{C(\/\d+)?\}/g, (_, d: string) => fmtUsd(d ? capital / +d.slice(1) : capital))
    .replace(/\{N\}/g, name)
    .replace(/\{chain\}/g, chain);
}

/** One row's plan: eight steps of [verb, what to do, dollars, minutes], then the sums. */
export interface FarmPlan {
  play: string;
  label: string;
  chain: string;
  hold: number;
  weeks: number;
  capital: number;
  share: number;
  steps: FarmStep[];
  fees: number;
  minutes: number;
  forgone: number;
  slice: number;
  snapshot_slice: number;
  net: number;
  per_hour: number;
  verdict: Verdict;
  break_even: number | null;
  gas: number;
}

/**
 * One row's farm plan on a fixed ticket: the slice is the ticket's share of the implied
 * value (the ticket's dollar-days over everyone's, deposits already in counting half the
 * days the protocol has run with no token, a year at most); the fees are every
 * transaction's gas plus the play's own fees and carry; the forgone is the T-bill yield
 * the ticket gives up. FARM when the net is positive, THIN when the slice covers the
 * fees, SKIP otherwise.
 */
export function farmPlan(
  p: { name: string; slug: string; category: string | null; chains: string[]; tvl_usd: number },
  value: number,
  age: number | null,
  opts: { capital?: number; share?: number } = {},
  model: ModelConstants = MODEL,
): FarmPlan {
  const C = opts.capital ?? model.capital;
  const share = opts.share ?? model.airdrop_share;
  const key = playOf(p.category);
  const how = PLAYS[key]!;
  const N = p.name;
  const chain = farmChain(p.chains);
  const [gas, fund] = chainCost(chain);
  const H = how.hold;
  const weeks = Math.round(H / 7);
  const ahead = Math.min(age ?? model.points_window, model.points_window) / 2;
  const snapshotSlice = (value * share * C) / (p.tvl_usd + C);
  const slice = snapshotSlice * (H / (ahead + H));
  const [txIn, txQualify, txWeek, txOut] = how.tx;
  const gasBudget = Math.max(1, Math.ceil(2 * gas * (txIn + txQualify + weeks * txWeek + txOut + 2)));
  const steps: FarmStep[] = [
    { text: `Withdraw ${fmtUsd(C)} (USDC, or the asset it takes) and ${fmtUsd(gasBudget)} for gas from an exchange to a fresh wallet on ${chain}, used for this farm only.`, cost: `${fmtUsd(fund)} to fund the wallet`, time: '10 minutes' },
    { text: `Open ${N} from defillama.com/protocol/${p.slug}, not a search ad; check contracts, audits, that it still lists no token, and any points page.`, cost: 'no fee to check', time: '15 minutes' },
    { text: fill(how.enter, C, N, chain), cost: `${fmtUsd(txIn * gas + how.pct[0] * C)}`, time: `${how.min[0]} minutes to set up` },
    { text: fill(how.qualify, C, N, chain), cost: `${fmtUsd(txQualify * gas + (how.carry * C * H) / 365)}`, time: `${how.min[1]} minutes` },
    { text: `Each week for ${weeks} weeks, ${how.watch}; log it.`, cost: `${fmtUsd(weeks * (txWeek * gas + how.pct[1] * C))}`, time: `${weeks * how.min[2]} minutes over ${H} days` },
    { text: `Leave early if ${how.stop}, TVL drops under ${fmtUsd(p.tvl_usd * 0.7)} (-30%), or a token is announced with nothing for depositors.`, cost: 'nothing to leave', time: '5 minutes' },
    { text: '', cost: `${fmtUsd(gas)} of gas to claim`, time: '10 minutes' },
    { text: `After ${H} days or at the claim, unwind the position and send the funds back to the exchange.`, cost: `${fmtUsd((txOut + 1) * gas)}`, time: '10 minutes' },
  ];
  if (how.qualify_first) {
    const [enter, qualify] = [steps[2]!, steps[3]!];
    steps[2] = qualify;
    steps[3] = enter;
  }
  const fees = steps.reduce((s, st) => s + parseCost(st.cost), 0);
  const minutes = steps.reduce((s, st) => s + parseMinutes(st.time), 0);
  const forgone = (C * model.tbill * H) / 365;
  const net = slice - fees - forgone;
  const scaling = C * (how.pct[0] + weeks * how.pct[1] + (how.carry * H) / 365);
  const perDollar = (slice - scaling - forgone) / C;
  const breakEven = perDollar > 0 ? (fees - scaling) / perDollar : null;
  const verdict: Verdict = net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP';
  const reason =
    verdict === 'FARM'
      ? 'the net is positive on this ticket'
      : verdict === 'THIN'
        ? 'the slice covers the fees but the net is negative'
        : 'the slice does not cover the fees';
  steps[6]!.text =
    `If a token launches, claim only from ${N}'s own site, never pay to claim, then revoke approvals. ` +
    `At the implied ${fmtUsd(value)} this ticket's slice is about ${fmtUsd(slice)}; fees ${fmtUsd(fees)}, T-bill forgone ${fmtUsd(forgone)}, net ${net >= 0 ? '+' : ''}${fmtUsd(net)} (${fmtUsd(net / (minutes / 60))}/hour). ` +
    `Verdict: ${verdict} — ${reason}. Break-even ticket ${breakEven === null ? 'none: the net never turns positive' : fmtUsd(breakEven)}.`;
  return {
    play: key, label: how.label, chain, hold: H, weeks, capital: C, share, steps, fees, minutes, forgone, slice,
    snapshot_slice: snapshotSlice, net, per_hour: net / (minutes / 60),
    verdict, break_even: breakEven, gas: gas * (txIn + txQualify + weeks * txWeek + txOut + 2),
  };
}

/** A step's cost string back to dollars: the step texts carry the numbers, the sums need them too. */
function parseCost(cost: string): number {
  const m = cost.match(/\$([\d,]+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]!.replace(/,/g, '')) : 0;
}

/** A step's time string back to minutes: '10 minutes' or '50 minutes over 90 days'. */
function parseMinutes(time: string): number {
  const m = time.match(/(\d+) minutes/);
  return m ? parseInt(m[1]!, 10) : 0;
}

/** The strings board.json carries: one a step, each with its cost and its time. */
export function stepStrings(plan: FarmPlan): string[] {
  return plan.steps.map((s) => stepText(s));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

// ---------------------------------------------------------------- the board

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
 * The rank ranges: BOOTSTRAP_REFITS refits, each resampling the comparables with replacement,
 * refitting the curve, and re-ranking the whole board. The range is the P10–P90 of the row's
 * rank across the refits, and the implied P10/P90 the same of its implied value. One PRNG
 * stream, drawn in a fixed order, so the ranges are the same on every run.
 */
export function bootstrapRankRanges(
  scored: Array<{ p: SnapshotProtocol; kin: Kinship; listed: boolean }>,
  snapshot: Snapshot,
  comps: Comparable[],
  model: ModelConstants = MODEL,
): Map<string, { rank_lo: number; rank_hi: number; implied_p10: number; implied_p90: number }> {
  const marketWeek = median(snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d!));
  const rand = mulberry32(0xc0ffee);
  const ranksBySlug = new Map<string, number[]>();
  const impliedBySlug = new Map<string, number[]>();
  for (const s of scored) {
    ranksBySlug.set(s.p.slug, []);
    impliedBySlug.set(s.p.slug, []);
  }
  for (let r = 0; r < BOOTSTRAP_REFITS; r++) {
    const draw: Comparable[] = [];
    for (let i = 0; i < comps.length; i++) draw.push(comps[Math.floor(rand() * comps.length)]!);
    const fit = fitCurve(draw, SHIPPED_LEVEL, model);
    const refit = scored
      .map((s) => ({ slug: s.p.slug, implied: impliedValue(s.p, snapshot.as_of, fit, marketWeek, s.kin, model).implied }))
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

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The protocols the board ranks, strongest first, with ranks 1..n — plus the ledger, the traded tab and the set-aside tab. */
export function buildBoard(
  snapshot: Snapshot,
  fit: CurveFit,
  tokens: Comparable[],
  comps: Comparable[],
  validation: Validation,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; ledger: LedgerRow[]; traded: TradedRow[]; aside: AsideRow[] } {
  const marketWeek = median(snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d!));
  const index = bySlug(snapshot.protocols);
  const stems: Record<string, string> = {};
  for (const p of snapshot.protocols) if (tokenStatus(p) !== 'none') stems[stem(p.name)] = p.symbol ?? p.gecko_id ?? '';
  const watched = new Set(snapshot.watchlist);
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
    .map((p) => ({ p, v: impliedValue(p, snapshot.as_of, fit, marketWeek, stems[stem(p.name)] ? 'token' : null, model) }))
    .sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const listed = watched.has(p.slug);
    const kin: Kinship = stems[stem(p.name)] ? 'token' : !listed && p.tvl_usd >= snapshot.floor_usd ? 'parent' : null;
    const v = impliedValue(p, snapshot.as_of, fit, marketWeek, kin, model);
    return { p, v, kin, listed };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const ranges = bootstrapRankRanges(scored, snapshot, comps, model);
  const blindSpread = (age: number | null): number =>
    age !== null && age < model.young_days && validation.ranges.n_young > 0 ? validation.ranges.young_miss : validation.ranges.seasoned_miss;

  const board: BoardRow[] = scored.map((s, i) => {
    const plan = farmPlan(s.p, s.v.implied, s.v.age, {}, model);
    const range = ranges.get(s.p.slug)!;
    const spread = blindSpread(s.v.age);
    const tier: 'watchlist' | 'shared' | 'early' = s.listed ? 'watchlist' : s.kin === 'parent' ? 'shared' : 'early';
    const steps = stepStrings(plan);
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
        // Full precision on purpose: the dashboard recomputes the row from these
        // figures, so a rounded copy here would disagree with board.json by thousands
        // of dollars. The page rounds them to four decimals for display.
        curve: s.v.curve,
        sector_effect: s.v.sectorEffect,
        sector: s.v.sector,
        kinship: s.v.kinship,
        kin: s.kin,
        age_days: s.v.age,
        excess: round4(s.v.excess),
      },
      tier,
      play: plan.play,
      play_label: plan.label,
      chain: plan.chain,
      hold_days: plan.hold,
      slice_usd: Math.round(plan.slice * 100) / 100,
      fees_usd: Math.round(plan.fees * 100) / 100,
      forgone_usd: Math.round(plan.forgone * 100) / 100,
      net_usd: Math.round(plan.net * 100) / 100,
      per_hour_usd: Math.round(plan.per_hour * 100) / 100,
      break_even_usd: plan.break_even === null ? null : Math.round(plan.break_even * 100) / 100,
      farm_steps: steps,
      verdict: plan.verdict,
      capital_usd: plan.capital,
      gas_usd: Math.round(plan.gas * 100) / 100,
      plan_cost_usd: Math.round(plan.fees * 100) / 100,
      plan_digest: digest(steps),
      rank_lo: range.rank_lo,
      rank_hi: range.rank_hi,
      implied_p10: range.implied_p10,
      implied_p90: range.implied_p90,
      low: Math.max(1, Math.round(s.v.implied / spread)),
      high: Math.round(s.v.implied * spread),
    };
  });

  // The ledger: every protocol in exactly one group.
  const aside: AsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (chosen.has(p.slug)) continue;
    if (!isPreToken(p)) continue;
    const reason = houseRule(p);
    if (reason !== null) aside.push({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, reason });
  }
  aside.sort((a, b) => b.tvl_usd - a.tvl_usd);
  const onRecord = snapshot.protocols.filter((p) => tokenStatus(p) === 'on-record').length;
  const ruled = ['Bridge', 'Liquid staking', 'Exchange custody', 'Versioned listing', 'Wrapped or staked'];
  const ledger: LedgerRow[] = [
    { group: 'Ranked', count: board.length, reason: 'records no token; no rule sets it aside' },
    { group: 'Token trades', count: tokens.length, reason: 'a market cap: comparables, never ranked' },
    { group: 'Token on record', count: onRecord, reason: 'a ticker or CoinGecko id, no cap' },
    ...ruled.map((g) => ({
      group: g,
      count: aside.filter((a) => a.reason === g).length,
      reason: 'the house rule, applied below its floor',
    })),
  ];

  // The traded tab: every token that trades, with its blind price at the shipped level.
  const traded: TradedRow[] = tokens.map((t) => {
    const fitHere = t.skip === null ? fitCurve(comps.filter((c) => c.slug !== t.slug), SHIPPED_LEVEL, model) : fit;
    const blind = Math.pow(10, predictLog(fitHere, t, model));
    return {
      slug: t.slug,
      name: t.name,
      category: snapshot.protocols.find((p) => p.slug === t.slug)?.category ?? null,
      tvl_usd: t.tvl,
      mcap_usd: t.mcap,
      blind_usd: Math.round(blind),
      miss_x: round3(blind / t.mcap),
    };
  });
  traded.sort((a, b) => b.mcap_usd - a.mcap_usd);

  return { board, ledger, traded, aside };
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
    curve: row.model.curve,
    sector_effect: row.model.sector_effect,
    sector: row.model.sector,
    kinship: row.model.kinship,
    kin: row.model.kin,
    tier: row.tier,
    play: row.play,
    play_label: row.play_label,
    chain: row.chain,
    hold_days: row.hold_days,
    slice_usd: row.slice_usd,
    fees_usd: row.fees_usd,
    forgone_usd: row.forgone_usd,
    net_usd: row.net_usd,
    per_hour_usd: row.per_hour_usd,
    break_even_usd: row.break_even_usd,
    verdict: row.verdict,
    capital_usd: row.capital_usd,
    gas_usd: row.gas_usd,
    plan_cost_usd: row.plan_cost_usd,
    plan_digest: row.plan_digest,
    rank_lo: row.rank_lo,
    rank_hi: row.rank_hi,
    implied_p10: row.implied_p10,
    implied_p90: row.implied_p90,
    low: row.low,
    high: row.high,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const marketWeek = median(snapshot.protocols.filter((p) => p.change_7d !== null).map((p) => p.change_7d!));
  const tokens = buildComps(snapshot, marketWeek, model);
  const comps = tokens.filter((c) => c.skip === null);
  const fit = fitCurve(comps, SHIPPED_LEVEL, model);
  const validation = validateModel(snapshot, model);
  const { board, ledger, traded, aside } = buildBoard(snapshot, fit, tokens, comps, validation, model);
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
    curve_a: fit.a,
    curve_b: fit.b,
    sector_effects: fit.sector,
    comps_n: comps.length,
    comps_all_n: tokens.length,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
    validation,
    verdict_counts: verdictCounts,
    ledger,
    traded,
    aside,
    farm: farmTable(model),
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
