# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ketong112/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ketong112/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token-launch radar: ranks 198 pre-token DeFi protocols from a sealed DefiLlama snapshot by implied launch value — every rankable pre-token protocol in the snapshot (the 40-protocol watchlist plus all 158 others) — with a costed farm plan and a FARM / THIN / SKIP verdict for each, on a sortable dashboard.

## The model (radar-3)

Implied value = TVL × sector multiple × growth × maturity × breadth, where the sector
multiple is the median market-cap-per-TVL of the snapshot's live-token protocols in the
same category (global live median when a category has fewer than 3 live protocols),
computed from the snapshot at runtime — never a hardcoded list of names.

The model is validated, not asserted, on the snapshot's own 128 live-token protocols:

| Test | n | Median \|log error\| | Within 2× | Spearman ρ |
| --- | --- | --- | --- | --- |
| Leave-one-out | 128 | 1.688 | 19.5% | 0.39 |
| Walk-forward (fit pre-2025, test 2025+) | 31 | 1.480 | 25.8% | 0.26 |
| Blind holdout (every 4th by slug) | 32 | 1.941 | 21.9% | 0.39 |
| Flat 0.25 multiple (baseline) | 128 | 1.656 | 26.6% | 0.43 |

The model ranks, it does not price: the typical prediction is off by a factor of ×5.4,
and a flat multiple does about as well on live tokens — the fitted curve's job is to stop
a bridge's TVL being scored like a DEX's. What the ranking does do: the top decile of the
leave-one-out predictions holds protocols whose real market caps are 25× the bottom
decile's ($129.1M vs $5.1M median). Every row carries a rank range (P10–P90 over 200
bootstrap refits of the sector multiples) and a farm plan netted to the dollar, ending in
a verdict: FARM at an implied value of $10,000,000 or more, THIN at $2,000,000 or more,
SKIP below that — stepped down one level when the plan's gas alone is more than 50% of
its capital. This board: 38 FARM / 86 THIN / 74 SKIP. Top row: Steakhouse Financial,
$557,909,595. Bottom row: $620,182.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dmgw15y1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
