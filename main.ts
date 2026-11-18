// Token Radar's entrypoint (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>),
// scores every pre-token protocol with the radar-4 model in lib/model.ts, writes the ranked
// board to /output/board.json, writes the dashboard's data beside the page as data.js, and
// copies this repository's dashboard/ and screenshots/ to /output. Last, it writes
// /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// radar-4 scores all 198 rankable pre-token protocols (the 40-protocol watchlist plus every
// other rankable protocol) with a size curve fitted on the snapshot's own traded tokens
// (Theil–Sen log10 market cap on log10 TVL, sector effects shrunk toward the curve),
// validates the model with a four-level ladder — flat multiple, curve, + sector, + growth
// and age — tested leave-one-out and older-to-newer, and ships the highest level whose
// every added term improves both tests. It accounts for all 758 protocols in a ledger,
// gives every row a bootstrap rank range and a blind-miss range with hold rates, and nets
// every farm plan to the dollar on a fixed $1,000 ticket with a FARM / THIN / SKIP verdict
// from the net, a break-even ticket and dollars per hour.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html,
// dashboard/app.css and dashboard/app.js read /output/data.js, which this program writes from
// the same board. Every run is deterministic: same snapshot bytes in, same output bytes out.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHIPPED_LEVEL, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const ladder = radar.validation.ladder;
const shipped = ladder[SHIPPED_LEVEL]!;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: curve a=${radar.curve_a.toFixed(3)} b=${radar.curve_b.toFixed(3)} on ${radar.comps_n} comparables (of ${radar.comps_all_n} traded)\n` +
    `token radar: ladder L0 flat x${ladder[0]!.loo_miss.toFixed(3)}/${ladder[0]!.o2n_miss.toFixed(3)} L1 curve x${ladder[1]!.loo_miss.toFixed(3)}/${ladder[1]!.o2n_miss.toFixed(3)} L2 +sector x${shipped.loo_miss.toFixed(3)}/${shipped.o2n_miss.toFixed(3)} L3 +growth/age x${ladder[3]!.loo_miss.toFixed(3)}/${ladder[3]!.o2n_miss.toFixed(3)} (LOO/O2N median miss)\n` +
    `token radar: blind holdout x${radar.validation.blind.median_miss_x.toFixed(3)} (flat on the same split x${radar.validation.blind_flat.median_miss_x.toFixed(3)}), walk-forward x${radar.validation.walk_forward.median_miss_x.toFixed(3)}\n` +
    `token radar: verdicts FARM ${radar.verdict_counts.FARM} / THIN ${radar.verdict_counts.THIN} / SKIP ${radar.verdict_counts.SKIP} on a $1,000 ticket\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
