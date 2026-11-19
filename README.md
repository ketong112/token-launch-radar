# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ketong112/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ketong112/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token-launch radar: ranks 198 pre-token DeFi protocols from a sealed DefiLlama snapshot by implied launch value — every rankable pre-token protocol in the snapshot (the 40-protocol watchlist plus all 158 others) — with a costed farm plan and a FARM / THIN / SKIP verdict for each, on a sortable dashboard.

## The model (radar-4)

Implied value = 10^(a + b · log10 TVL) · 10^sector effect · kinship, with a = 3.339 and
b = 0.477 fitted by Theil–Sen on the snapshot's own traded tokens. A dollar of TVL is
worth less in a big protocol, so the curve compresses the giants; each sector's effect is
its median residual off the curve, shrunk toward zero by 4 pseudo-comparables. Kinship:
a row whose name stem already carries a token on record is worth a quarter (×0.25); a
row filed under a parent listing has its TVL shared (×2^(b−1)). The model is validated,
not asserted, on the snapshot's own comparables — and the level shipped is the highest
whose every added term improves both blind tests:

| Level | Fit set | Leave-one-out miss | Leave-one-out within 3× | Older→newer miss | Older→newer within 3× |
| --- | --- | --- | --- | --- | --- |
| L0 flat multiple | 90 | ×4.821 | 38.9% | ×4.452 | 42.4% |
| L1 + size curve | 90 | ×3.510 | 43.3% | ×2.735 | 51.5% |
| **L2 + sector (shipped)** | **90** | **×2.865** | **51.1%** | **×2.495** | **54.5%** |
| L3 + growth, age | 90 | ×2.921 | 52.2% | ×2.401 | 54.5% |

L3 is shown, not shipped: it improves older-to-newer slightly and worsens leave-one-out,
so the blind test does not keep growth or age. The same ladder on all 128 traded tokens
(house categories and receipt tokens included) is L0 ×4.915/×4.912, L1 ×3.524/×3.032,
L2 ×3.255/×3.735, L3 ×3.234/×3.795 — the curve beats the flat multiple there too, but the
sector term worsens older-to-newer on the unfiltered set, which is why those tokens are
left out of the fit set.

The 7 rows whose name stem already carries a token stay ranked, with the ×0.25 kinship
discount stated on each row — they are not hidden in the set-aside tab: GMX Solana #127,
Mezo Earn #164, MetalX Swap #171, Manta CeDeFi #183, Kava Mint #196, Solv Strategies
#197, Flying Tulip ftUSD #198. Another 19 rows are filed under a parent listing.

The model ranks, it does not price: the typical held-out prediction is off by a factor of
×2.87 — but the fitted curve now beats the flat multiple on both blind tests, which the
previous model did not. Blind holdout (every 4th comparable by slug): ×2.047, against
×3.988 for the flat multiple on the same split. Walk-forward (fit pre-2025, test 2025+):
×2.972. The previous model's blind holdout was ×6.97, and the flat multiple on that same
split was ×6.12, so that split was hard for every model; this curve scores ×3.78 on that
split against flat ×6.63. The top decile of the leave-one-out predictions holds protocols
whose real market caps are 11× the bottom decile's ($40.0M vs $3.6M median). Every row
carries a rank range (P10–P90 over 200 bootstrap refits) and a blind-miss range — the
range held 44/90 leave-one-out and 18/33 older-to-newer; young tokens (listed under 540
days) miss by ×7.32, seasoned ones by ×2.74.

## Farm plans

Every plan runs on a fixed $1,000 ticket with a 10% airdrop share and a 4% T-bill rate.
Slice = implied value × share × ticket / (TVL + ticket), spread over the hold against the
days the protocol has already run with no token. Fees = every transaction's gas on the
cheapest of the protocol's first three chains, plus the play's own fees and carry. Forgone
= the T-bill yield the ticket gives up. Net = slice − fees − forgone. **FARM** when the
net is positive, **THIN** when the slice covers the fees, **SKIP** otherwise. Each row
also carries its break-even ticket and its dollars per hour; the dashboard's Ticket and
Airdrop share knobs re-plan every row live. This board: **55 FARM / 99 THIN / 44 SKIP**,
total implied $1,700,059,047. Top row: Bittensor dTAO, $62,989,122. Bottom row: Flying
Tulip ftUSD, $388,131. Best plan by the hour: GoonFi, +$32.25/h.

## Coverage and the dashboard

All 758 protocols in the snapshot are accounted for in a ledger: 198 ranked, 128 token
trades (comparables, never ranked), 288 token on record, and 144 set aside under the
house rule (43 bridge, 43 liquid staking, 42 exchange custody, 11 versioned listing,
5 wrapped or staked). The dashboard shows a KPI strip (ranked, total implied, held-out
miss, range holds, FARM count, best $/hour) and two proof pills — Watchlist 40/40 and a
board self-check that recomputes every row from the snapshot figures and compares it
with board.json — plus tabs for the live-token, traded-token (blind price and miss per
token) and set-aside protocols, a method tab with the full ladder and ledger, filters
for tier, play, verdict, TVL band and trend, CSV export, and URL-hash state.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dmgw15y1&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
