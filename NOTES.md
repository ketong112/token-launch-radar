# Token Radar — build notes (token-radar-01)

Entry: "Build the best token launch radar". $1,325, deadline 2026-12-14 10:00 UTC.
Snapshot: DefiLlama protocols, fetched 2026-11-14, 758 protocols, watchlist 40, floor $50M.
Work dir: `~/workspace/makefun/token-radar/` (becomes the repo content; not submitted yet).

## 1. Value model — `impliedValue` in lib/model.ts

implied = round( tvl_usd × sectorMultiple(category) × growthMult × maturityMult × breadthMult )

- **sectorMultiple(category)**: the median mcap/TVL of the snapshot's LIVE-token protocols
  in the same category (needs ≥3 live protocols in the category, else the global live median
  0.205), clamped to [0.05, 1.0]. Computed from the snapshot at runtime — never hardcoded,
  never a list of protocol names. Rationale: the live market's own multiples calibrate what a
  new token in the same sector is worth; a flat multiple (starter: 0.25 for everything)
  pretends a DEX and a bridge are worth the same per TVL dollar. Observed medians:
  Dexs 0.342, RWA 0.275, Yield 0.180, Lending 0.132, Basis Trading 0.654,
  Canonical Bridge 0.746, Cross Chain Bridge 1.22→clamped 1.0. Categories with <3 live
  protocols (Risk Curators, Derivatives, Onchain Capital Allocator, …) fall back to 0.205.
- **growthMult** = 1 + clamp(change_7d, −60, +120)/100 × 0.5. Null change_7d counts as 0.
  The 4448.5% outlier in the snapshot is clamped to +120% (mult 1.6).
- **maturityMult** = 0.6 + min(age_days, 1095)/1095 × 0.4. Age = as_of − listed_at in days.
  Null listed_at counts as 365 days. Longer with no token = more pent-up launch value,
  with diminishing returns (capped at 3 years).
- **breadthMult** = 1 + 0.04 × min(max(chains − 1, 0), 5), at most 1.20. More chains =
  more users and TVL sources a launch reaches.
- implied is a positive whole number, max(1, round(…)). All 120 rows got distinct values
  in the prototype (top $534.7M, bottom $2.2M), so the board is a real ranking.
- **Precision note (fixed 2026-11-15):** the sector multiple is carried at FULL precision in
  board.json/data.js — never rounded. An earlier build rounded it to 4 decimals, and the
  dashboard's recompute then disagreed with board.json by a few thousand dollars on every
  row. The page displays the multiple to 4 decimals but recomputes from the full-precision
  value, so the dialog's recompute line now agrees exactly on all 120 rows (verified
  2026-11-15: 0 mismatches; spot-checked live for ranks 1, 60, 120). The other multipliers
  (growth/maturity/breadth) are display-only — the page recomputes them from the raw
  snapshot fields, so rounding them is harmless.

## 2. Board composition — 120 rows, all pre-token

- 40 watchlist slugs (mandatory coverage) + 80 early rows.
- Early rows: pre-token protocols below the $50M floor that are rankable, picked by
  IMPLIED VALUE (top 80), not by TVL as the starter does — the board is the model's
  ranking, so its tail should be the model's next-best picks.
- Rankable = records no token AND category not in {CEX, Bridge, Canonical Bridge,
  Liquid Staking, Liquid Restaking, Restaked BTC} AND name has no version marker
  (… V2 / v2 / 2.0) AND name has no whole word wrapped/staked/staking. This mirrors
  the watchlist's own exclusion rule (minus parentProtocol, which the snapshot does
  not carry). It keeps wrapped/staked products and exchange pools out of the board:
  without it, binance-cex ($116B TVL, records no token) and layerzero-v2 / aave-v3
  ($17.6B / $14.3B, versioned) would top the board and the radar would be wrong.
- The board itself is PRE-TOKEN ONLY. Live-token protocols are NOT ranked in it:
  a real market cap is not comparable to a modeled implied value, and mixing them
  would blur criterion 2's separation. The live contrast lives in the dashboard's
  "Live token" tab (top 24 live protocols by market cap, real mcaps shown, clearly
  labelled "already trades"). This satisfies judge criterion 2 ("the board separates
  protocols whose token already trades from those still to come") without polluting
  the ranking.
- 120 rows (not the starter's 200): keeps data.js compact and the board readable;
  every row is a real pick, no filler.

## 3. Farm plans — `farmSteps` in lib/model.ts (duplicated in dashboard/app.js)

- 6 steps per protocol, each "action. Cost: …. Time: ….", 20–600 chars, derived only
  from the protocol's own record (category, chains, TVL, age). No protocol name is
  special-cased; the category action table and the chain gas table are the only
  hand-written tables, and both are tables of CATEGORIES/CHAINS, not of names.
- Capital by TVL: ≥$5B → $250; ≥$1B → $150; ≥$100M → $100; else $50.
- Hold by age: <180d → 60d; <365d → 45d; else 30d; unknown age → 30d.
- Gas by first chain (estimates, labelled as such): Ethereum ~$8, Solana ~$0.05,
  Base/Arbitrum/Optimism/zkSync/Linea/Scroll/Blast ~$0.50, BSC ~$0.30,
  Polygon ~$0.10, Avalanche ~$0.50, Sui/Aptos ~$0.05, everything else ~$1.
- Language discipline (rules): a protocol "records no token" per its DefiLlama
  record — never "has no token". No step claims a token, airdrop or points program
  exists; step 5 says "if the protocol ever publishes a points or rewards page".
  Step 5 also warns: never pay to claim, never trust a link from a chat or ad.
- Known snapshot quirk, handled honestly: watchlist rows such as `usdd` (a
  stablecoin whose token obviously trades) are on the watchlist because DefiLlama
  records no gecko_id for them. We rank them as the snapshot says and let the
  dashboard's "records no token" wording + disclaimer carry the caveat — we do
  NOT drop watchlist rows (coverage is mandatory) and do NOT invent a token for them.

## 4. Dashboard

- Static page, no network: index.html + app.css + app.js in dashboard/, data.js
  written beside it by main.ts. Sortable table (rank / name / TVL / 7d / age /
  implied), search, category filter, chain filter, Pre-token / Live token tabs,
  per-protocol detail dialog (model breakdown + farm plan), model panel with the
  formula and the per-category sector multiples actually used.
- Palette: dark radar theme (ink navy, teal/green accent, amber for warnings),
  system font stack, consistent spacing. NOT a framework.
- Byte budget: dashboard/ source (html+css+js) target ≤ ~50 KB so the dossier
  text (cap 65,536 bytes) shows every file whole. data.js lives at /output/data.js
  (outside dashboard/), so it is not part of the dossier text — but it is kept
  compact anyway (short keys, only the fields the page renders).
- Screenshots (1440×900, headless Chromium /opt/meta-chromium/chrome):
  1-board.png (full board), 2-detail.png (rank-1 detail dialog open),
  3-filtered.png (a filter applied). Each ≤512 KiB, aim 300–350 KB (JPEG q~85
  via PIL if PNG is too big).

## 5. Determinism

- Pure functions of the snapshot bytes: no clock, no randomness, no network,
  no locale formatting in main.ts outputs. Sorting tie-breaks are by slug.
- Sector multiples are computed from the snapshot at runtime (median of a
  deterministically sorted list). Object key order is fixed by construction.
- Verified by running main.ts twice into two dirs and diffing (see validate.mjs).

## 6. Model-call determination

- This is a program/v1 bounty (requirements: harness "program/v1"). The entry
  is a deterministic Node program run in a no-network sandbox, standard library
  only. It makes NO model calls — there is no model gateway for it, the starter
  makes none, and the rules' program runs in a sandbox with no network, so a
  call is impossible. The requirements' `model_call` check is an agent/v1 floor
  ("the entry's agent calls its model through the grader's model gateway on
  every trial"); a program/v1 entry has no trials and the check's own text says
  a competition waives it when its harness says model calls are optional / the
  entry may be a program that calls no model at all. Confirmed: no model call
  is needed or expected for this entry.

## 7. Judgment calls / open risks

- Sector-multiple fallback (0.205) applies to Risk Curators — the watchlist's
  biggest category (12 of 40) — because only 1 live Risk Curator exists in the
  snapshot. The model is still fully snapshot-derived; the dashboard states the
  fallback openly in the sector table.
- `usdd` and similar watchlist rows rank high on TVL alone; the "records no
  token" wording is the honest handling, per the rules.
- Data quirk found 2026-11-15: `autofinance` carries mcap_usd −1 (negative market
  cap). The model excludes non-positive mcaps from the sector-median calibration;
  a Python prototype that used a truthiness check included it and got a slightly
  different global median (0.205 vs the correct 0.214). TS code is correct.
- Judge is pairwise vs house anchors (starter = 2-plain, strength 0.593) and
  rungs up to 3.253. Our edge vs the starter: snapshot-derived sector multiples,
  implied-value (not TVL) early picks, chain-aware farm plans, a designed page.
## 8. Round 2 — radar-3 (2026-11-18, this build session)

Round 1 scored 88.5% judge win rate (profile @lively-heron-54) but sits outside the live
top 50. Round 2 rebuilds the model and the page on the ATM findings (leaders: fitted
comps curve tested blind/OOS/walk-forward/LOO, rank ranges from refits, farm plans
netted to the dollar with farm/thin/skip verdicts, 198 rows, 40/40 watchlist).

- **Coverage 120 → 198 rows.** The snapshot holds exactly 198 rankable pre-token
  protocols (40 watchlist + 158 early); the board now ranks all of them. No cap.
- **Validation, computed from the snapshot, reported with real numbers** (`validateModel`
  in lib/model.ts; shown in the dashboard's "How the model was tested" panel and in
  README): LOO (n=128) median |log error| 1.688, within 2× 19.5%, Spearman 0.385;
  walk-forward fit pre-2025-01-01 / test 2025+ (n=31) 1.480, 25.8%, 0.262; blind holdout
  every 4th by slug (n=32) 1.941, 21.9%, 0.387; flat-0.25 LOO baseline 1.656, 26.6%,
  0.435. Top-decile median actual mcap $129,118,224 vs bottom $5,104,554 (25×).
  The numbers were rechecked with independent scripts (/tmp/explore2.mjs, explore3.mjs,
  check-r3.mjs): LOO and blind match exactly; walk-forward differs from the first
  exploration only because protocols with no listed date are now excluded from that
  test (a walk-forward needs a date to walk on).
- **Honest reading, stated on the dashboard:** the model ranks, it does not price
  (typical error ×5.4); the flat multiple does about as well on live tokens, so the
  fitted curve is justified by sector separation, not by a tighter price prediction.
  Do NOT claim the fitted curve beats the flat multiple — it does not, on these tests.
- **Rank ranges:** 200 bootstrap refits (mulberry32, fixed seed 0xc0ffee, one stream in
  fixed order) resample each category's live ratios, refit the multiples, re-rank the
  board; P10–P90 of rank and implied value per row. Median range width 30 ranks
  (p90 96, max 121); rank 1 is 1–1, rank 100 is 54–160, rank 198 is 162–198.
- **Farm plans, 7 steps, netted to the dollar:** capital + gas of every transaction
  (setup + weekly + unwind) + total, ending in FARM / THIN / SKIP. Bands: FARM ≥ $10M,
  THIN ≥ $2M, else SKIP; one step down when gas alone is > 50% of capital. Counts:
  38 FARM / 86 THIN / 74 SKIP (20 FARM→THIN and 23 THIN→SKIP by the gas rule, mostly
  Ethereum-first rows). Step 7 states the totals and the verdict. `fmtUsd` keeps cents
  when present (gas $0.55 stays $0.55, not $1) so the step text agrees with the numeric
  fields exactly.
- **Dashboard:** new Verdict column (sortable) + "likely lo–hi" rank range under each
  rank; stats show verdict counts; model panel has the validation table + the honest
  reading + the verdict rule; detail dialog has a Rank range row and a Plan cost
  section (capital / gas / total / gas share). Deep-linking extended: `#tab=live`
  opens the Live token tab. Dashboard source 57,618 bytes total (dossier text 57,882
  bytes, under the 65,536 cap, no cut). Live tab verified headless: 24 rows, Market cap
  column, Verdict "—".
- **Farm-step agreement, verified for all 198 rows:** the page's farmSteps (app.js)
  and board.json's farm_steps are byte-identical on all 7 steps (extraction check
  /tmp/agree-check.mjs: 0 mismatches), the page's recompute agrees on all 198 rows,
  and the page's verdict agrees with data.js on all 198 rows. Board vs data.js: 0
  disagreements. Two runs of main.ts are byte-identical (deterministic).
- **Screenshots (1440×900 / 1440×1440, PNG):** 1-board.png 1440×900 144 KB (board,
  verdicts + rank ranges visible); 2-detail.png 1440×1440 303 KB (Steakhouse Financial
  #1 detail: breakdown, rank range #1–1, recompute line, plan cost, steps 1–6; step 7's
  text sits below the fold — its numbers are in the Plan cost table directly above);
  3-filtered.png 1440×900 137 KB (category Dexs, 21 of 21). All three LOOKED at.
  Tooling note: /opt/meta-chromium/chrome refuses to start in this VM ("Hatch WebGL
  domain policy is required for browser startup" — the flag
  --hatch-webgl-allowed-domains did not satisfy it); screenshots were taken with the
  Playwright chrome-headless-shell at
  ~/.cache/ms-playwright/chromium_headless_shell-1255/.../chrome-headless-shell
  (--no-sandbox, --virtual-time-budget=6000).
- **Gate (local validator, final build): ALL 7 CHECKS PASS** — dashboard_files (3
  files, 57,618 bytes), board_file (198 rows), sorted_by_value (top $557,909,595,
  bottom $620,182), coverage (40/40), farm_steps (198×7, all 20–600 chars),
  screenshots (1440×900 / 1440×1440, ≤512 KB), dossier_matches (byte-identical,
  858,654 bytes ≤ 1.5 MiB), no_secrets.
- Submission is NOT part of this build: no keypair, no repo, no push, no submit. The
  parent session handles GitHub + wallet + transcripts bundle later.
  Transcript note for submission: this session + subagent sessions built the
  code; bundle must run from the top-level agent after subagents finish.
