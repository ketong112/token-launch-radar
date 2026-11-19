// Token Radar dashboard, radar-4. Renders window.RADAR (written beside this page by main.ts):
// the ranked pre-token board with a KPI strip, the traded-token and set-aside tabs, a method
// tab with the validation ladder and the ledger, and a per-protocol detail dialog with the
// model breakdown and a farm plan. No network: every byte shown comes from data.js.
// No framework, plain DOM. The page recomputes every row from the snapshot figures and
// checks the numbers board.json carries, so the page's code and the board's data are visibly
// the same arithmetic.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var MODEL = DATA.model;
  var FARM = DATA.farm;

  /* ---------- small helpers ---------- */

  function appendChild(node, child) {
    if (child === null || child === undefined) return;
    if (Array.isArray(child)) { child.forEach(function (c) { appendChild(node, c); }); return; }
    if (typeof child === 'string' || typeof child === 'number') { node.appendChild(document.createTextNode(String(child))); return; }
    node.appendChild(child);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'title') node.title = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    for (var i = 2; i < arguments.length; i++) appendChild(node, arguments[i]);
    return node;
  }

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtUsd(n) { return '$' + fmtInt(n); }
  function fmtCompact(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) { var m = n / 1e6; return '$' + (Number.isInteger(m) ? String(m) : m.toFixed(1)) + 'M'; }
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return fmtUsd(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(x) { return Number(x).toFixed(4); }
  function fmtSigned(n) { return (n >= 0 ? '+' : '-') + fmtUsdPlain(Math.abs(n)); }

  /** A dollar amount with thousands separators, deterministic and locale-free; cents kept when present; negatives keep their sign. */
  function fmtUsdPlain(n) {
    var sign = n < 0 ? '-' : '';
    var a = Math.abs(n);
    var whole = Math.trunc(a);
    var cents = Math.round((a - whole) * 100);
    var intPart = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return cents === 0 ? sign + '$' + intPart : sign + '$' + intPart + '.' + String(cents).padStart(2, '0');
  }

  /* ---------- the model, mirrored from lib/model.ts ---------- */

  // The page recomputes a row from the snapshot figures and checks the number
  // board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic: implied = 10^(a + b·log10 TVL) · 10^sector effect · kinship.
  function impliedOf(row) {
    return Math.max(1, Math.round(row.curve * Math.pow(10, row.sector_effect) * row.kinship));
  }

  /** FNV-1a over the joined strings, so the page can prove its plan text is board.json's text. */
  function digest(strings) {
    var s = strings.join('\n');
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h.toString(16);
  }

  var PLAY_BY_CATEGORY = {
    Lending: 'lend', 'Uncollateralized Lending': 'lend', 'Collateral Markets': 'lend', CDP: 'cdp', 'CDP Manager': 'cdp', Dexs: 'pool',
    'Prediction Market': 'market', Restaking: 'stake', 'Staking Pool': 'stake', 'Governance Incentives': 'stake', Insurance: 'stake'
  };
  var PLAY_BY_SECTOR = { Vaults: 'vault', Dollars: 'dollar', RWA: 'rwa', Lending: 'lend', Trading: 'perps', Network: 'network' };

  function playOf(category, sector) {
    return PLAY_BY_CATEGORY[category || ''] || PLAY_BY_SECTOR[sector] || 'network';
  }

  function chainCost(chain) { return FARM.chain_cost[chain] || [0.05, 1.5]; }

  /** A protocol's first three chains hold most of its TVL; the plan runs on the cheapest of them. */
  function farmChain(chains) {
    return chains.slice(0, 3).sort(function (a, b) { return chainCost(a)[0] - chainCost(b)[0] || chains.indexOf(a) - chains.indexOf(b); })[0] || 'its main chain';
  }

  function fill(t, capital, name, chain) {
    return t.replace(/\{C(\/\d+)?\}/g, function (_, d) { return fmtUsdPlain(d ? capital / +d.slice(1) : capital); })
      .replace(/\{N\}/g, name).replace(/\{chain\}/g, chain);
  }

  function parseCost(cost) {
    var m = cost.match(/\$([\d,]+(?:\.\d+)?)/);
    return m ? parseFloat(m[1].replace(/,/g, '')) : 0;
  }

  function parseMinutes(time) {
    var m = time.match(/(\d+) minutes/);
    return m ? parseInt(m[1], 10) : 0;
  }

  /**
   * One row's farm plan on a ticket, from DATA.farm: the slice is the ticket's share of
   * the implied value, the fees are every transaction's gas plus the play's own fees and
   * carry, the forgone is the T-bill yield the ticket gives up. FARM when the net is
   * positive, THIN when the slice covers the fees, SKIP otherwise. The default ticket
   * and share ($1,000, 10%) reproduce board.json's plan exactly; the knobs re-plan live.
   */
  function farmPlan(row, capital, share) {
    var C = capital === undefined ? FARM.capital : capital;
    var sh = share === undefined ? FARM.share : share;
    var key = playOf(row.category, row.sector);
    var how = FARM.plays[key];
    var N = row.name;
    var chain = farmChain(row.chains);
    var gc = chainCost(chain);
    var gas = gc[0], fund = gc[1];
    var H = how.hold;
    var weeks = Math.round(H / 7);
    var ahead = Math.min(row.age_days === null ? 365 : row.age_days, 365) / 2;
    var snapshotSlice = (row.implied_value_usd * sh * C) / (row.tvl_usd + C);
    var slice = snapshotSlice * (H / (ahead + H));
    var txIn = how.tx[0], txQualify = how.tx[1], txWeek = how.tx[2], txOut = how.tx[3];
    var gasBudget = Math.max(1, Math.ceil(2 * gas * (txIn + txQualify + weeks * txWeek + txOut + 2)));
    var steps = [
      { text: 'Withdraw ' + fmtUsdPlain(C) + ' (USDC, or the asset it takes) and ' + fmtUsdPlain(gasBudget) + ' for gas from an exchange to a fresh wallet on ' + chain + ', used for this farm only.', cost: fmtUsdPlain(fund) + ' to fund the wallet', time: '10 minutes' },
      { text: 'Open ' + N + ' from defillama.com/protocol/' + row.slug + ', not a search ad; check contracts, audits, that it still lists no token, and any points page.', cost: 'no fee to check', time: '15 minutes' },
      { text: fill(how.enter, C, N, chain), cost: fmtUsdPlain(txIn * gas + how.pct[0] * C), time: how.min[0] + ' minutes to set up' },
      { text: fill(how.qualify, C, N, chain), cost: fmtUsdPlain(txQualify * gas + (how.carry * C * H) / 365), time: how.min[1] + ' minutes' },
      { text: 'Each week for ' + weeks + ' weeks, ' + how.watch + '; log it.', cost: fmtUsdPlain(weeks * (txWeek * gas + how.pct[1] * C)), time: (weeks * how.min[2]) + ' minutes over ' + H + ' days' },
      { text: 'Leave early if ' + how.stop + ', TVL drops under ' + fmtUsdPlain(row.tvl_usd * 0.7) + ' (-30%), or a token is announced with nothing for depositors.', cost: 'nothing to leave', time: '5 minutes' },
      { text: '', cost: fmtUsdPlain(gas) + ' of gas to claim', time: '10 minutes' },
      { text: 'After ' + H + ' days or at the claim, unwind the position and send the funds back to the exchange.', cost: fmtUsdPlain((txOut + 1) * gas), time: '10 minutes' }
    ];
    if (how.qualify_first) { var t = steps[2]; steps[2] = steps[3]; steps[3] = t; }
    var fees = steps.reduce(function (s, st) { return s + parseCost(st.cost); }, 0);
    var minutes = steps.reduce(function (s, st) { return s + parseMinutes(st.time); }, 0);
    var forgone = (C * FARM.tbill * H) / 365;
    var net = slice - fees - forgone;
    var scaling = C * (how.pct[0] + weeks * how.pct[1] + (how.carry * H) / 365);
    var perDollar = (slice - scaling - forgone) / C;
    var breakEven = perDollar > 0 ? (fees - scaling) / perDollar : null;
    var verdict = net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP';
    var reason = verdict === 'FARM' ? 'the net is positive on this ticket' : verdict === 'THIN' ? 'the slice covers the fees but the net is negative' : 'the slice does not cover the fees';
    steps[6].text = 'If a token launches, claim only from ' + N + '\'s own site, never pay to claim, then revoke approvals. ' +
      'At the implied ' + fmtUsdPlain(row.implied_value_usd) + ' this ticket\'s slice is about ' + fmtUsdPlain(slice) + '; fees ' + fmtUsdPlain(fees) + ', T-bill forgone ' + fmtUsdPlain(forgone) + ', net ' + fmtSigned(net) + ' (' + fmtUsdPlain(net / (minutes / 60)) + '/hour). ' +
      'Verdict: ' + verdict + ' — ' + reason + '. Break-even ticket ' + (breakEven === null ? 'none: the net never turns positive' : fmtUsdPlain(breakEven)) + '.';
    return {
      play: key, label: how.label, chain: chain, hold: H, weeks: weeks, capital: C, share: sh,
      steps: steps, fees: fees, minutes: minutes, forgone: forgone, slice: slice,
      net: net, per_hour: net / (minutes / 60), verdict: verdict, break_even: breakEven,
      gas: gas * (txIn + txQualify + weeks * txWeek + txOut + 2)
    };
  }

  /** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  /** The board self-check: every row recomputed from the snapshot figures must equal board.json. */
  function checkBoard() {
    var same = 0;
    DATA.rows.forEach(function (row) {
      var plan = farmPlan(row);
      if (impliedOf(row) === row.implied_value_usd && digest(plan.steps.map(stepText)) === row.plan_digest) same++;
    });
    return { same: same, of: DATA.rows.length };
  }

  /* ---------- state + hash deep-linking ---------- */

  var state = { q: '', category: 'all', chain: 'all', tier: 'all', play: 'all', verdict: 'all', tvl: 'all', trend: 'all', tab: 'pre', sort: 'rank', dir: 1, limit: 50, selected: null, ticket: 1000, share: 0.10 };
  var SORT_DEFAULT_DIR = { rank: 1, name: 1, tvl: -1, change: -1, age: -1, value: -1, verdict: 1, status: 1, miss: -1, blind: -1 };

  var HASH_FIELDS = ['q', 'category', 'chain', 'tier', 'play', 'verdict', 'tvl', 'trend'];

  function readHash() {
    var params = new URLSearchParams(window.location.hash.slice(1));
    HASH_FIELDS.forEach(function (f) {
      var v = params.get(f);
      if (v !== null) state[f] = v;
    });
    var tab = params.get('tab');
    var ticket = params.get('ticket');
    var share = params.get('share');
    var p = params.get('p');
    if (tab === 'pre' || tab === 'traded' || tab === 'aside' || tab === 'method' || tab === 'live') state.tab = tab;
    if (ticket !== null && [1000, 5000, 25000].indexOf(parseInt(ticket, 10)) >= 0) state.ticket = parseInt(ticket, 10);
    if (share !== null && [0.05, 0.10, 0.20].indexOf(parseFloat(share)) >= 0) state.share = parseFloat(share);
    return p;
  }

  function writeHash() {
    var params = new URLSearchParams();
    HASH_FIELDS.forEach(function (f) {
      if (state[f] && state[f] !== 'all') params.set(f, state[f]);
    });
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.ticket !== 1000) params.set('ticket', String(state.ticket));
    if (state.share !== 0.10) params.set('share', String(state.share));
    if (state.selected) params.set('p', state.selected);
    var hash = params.toString();
    var url = hash ? '#' + hash : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }

  /* ---------- data views ---------- */

  // Live rows in the same shape as board rows, so one table renders both tabs.
  var liveRows = DATA.live.map(function (r, i) {
    return {
      rank: i + 1, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
      tvl_usd: r.tvl_usd, change_7d: r.change_7d, listed_at: null, age_days: null,
      implied_value_usd: null, mcap_usd: r.mcap_usd,
      sector: null, kinship: null, tier: null, play: null, verdict: null,
      live: true
    };
  });

  function tabRows() {
    if (state.tab === 'live') return liveRows;
    if (state.tab === 'traded') return DATA.traded;
    if (state.tab === 'aside') return DATA.aside;
    return DATA.rows;
  }
  function rowValue(row) { return state.tab === 'live' ? row.mcap_usd : row.implied_value_usd; }

  /** The live farm plan for a board row under the current knobs (the default plan is board.json's). */
  var planCache = {};
  function livePlan(row) {
    var k = row.slug + '|' + state.ticket + '|' + state.share;
    if (!planCache[k]) planCache[k] = farmPlan(row, state.ticket, state.share);
    return planCache[k];
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return tabRows().filter(function (r) {
      if (state.tab === 'pre') {
        if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
        if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
        if (state.tier !== 'all' && r.tier !== state.tier) return false;
        if (state.play !== 'all' && r.play !== state.play) return false;
        if (state.verdict !== 'all' && livePlan(r).verdict !== state.verdict) return false;
        if (state.tvl !== 'all') {
          var band = state.tvl === '10' ? 10000000 : state.tvl === '50' ? 50000000 : 200000000;
          if (r.tvl_usd < band) return false;
        }
        if (state.trend !== 'all') {
          if (state.trend === 'up' && !(r.change_7d !== null && r.change_7d > 0)) return false;
          if (state.trend === 'down' && !(r.change_7d !== null && r.change_7d < 0)) return false;
          if (state.trend === 'flat' && r.change_7d !== null && Math.abs(r.change_7d) > 5) return false;
        }
      }
      if (q) {
        var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function compareRows(a, b) {
    var key = state.sort;
    var av, bv;
    if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
    else if (key === 'change') { av = a.change_7d; bv = b.change_7d; }
    else if (key === 'age') { av = a.age_days; bv = b.age_days; }
    else if (key === 'value') { av = rowValue(a); bv = rowValue(b); }
    else if (key === 'verdict') { var order = { FARM: 0, THIN: 1, SKIP: 2 }; av = a.live ? 3 : order[livePlan(a).verdict]; bv = b.live ? 3 : order[livePlan(b).verdict]; }
    else if (key === 'status') { av = a.live ? 1 : 0; bv = b.live ? 1 : 0; }
    else if (key === 'miss') { av = a.miss_x; bv = b.miss_x; }
    else if (key === 'blind') { av = a.blind_usd; bv = b.blind_usd; }
    else { av = a.rank; bv = b.rank; }
    if (av === null || av === undefined) return 1; // nulls last, either direction
    if (bv === null || bv === undefined) return -1;
    if (av < bv) return -1 * state.dir;
    if (av > bv) return 1 * state.dir;
    return (a.rank || 0) - (b.rank || 0);
  }

  function sortedRows() { return filteredRows().slice().sort(compareRows); }

  function distinct(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) { if (!seen[v]) { seen[v] = true; out.push(v); } });
    return out.sort();
  }

  /* ---------- static sections ---------- */

  var sourceName = (DATA.source.split(' ')[0] || 'DefiLlama') + ' protocols';
  var covered = DATA.board_size - DATA.early_size;

  function buildHeader() {
    var head = el('section', { class: 'radar-head' });
    head.appendChild(el('p', { class: 'snapshot-line' }, [
      'Snapshot ', el('strong', {}, DATA.as_of),
      ' · Source ', el('strong', {}, sourceName),
      ' · Model ', el('strong', {}, DATA.model_version),
      ' · Watchlist floor ', el('strong', {}, fmtCompact(DATA.floor_usd))
    ]));
    var lede = el('div', { class: 'lede' });
    lede.appendChild(el('h1', {}, [
      DATA.watchlist_size + ' watchlist protocols, ranked by ',
      el('span', { class: 'hl', text: 'implied value' })
    ]));
    lede.appendChild(el('p', {}, [
      'All ', el('strong', {}, String(DATA.watchlist_size)),
      ' watchlist protocols are on the board, plus ', el('strong', {}, String(DATA.early_size)),
      ' more below the ', el('strong', {}, fmtCompact(DATA.floor_usd)),
      ' floor, picked by implied value. Every row ', el('strong', {}, 'records no token'),
      ' — implied value is a model, not a promise.'
    ]));
    head.appendChild(lede);
    return head;
  }

  /** The KPI strip: the six numbers that say what this board is, above the table. */
  function buildKpi() {
    var val = DATA.validation;
    var shipped = val.ladder[2];
    var totalImplied = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var best = DATA.rows.reduce(function (b, r) { return r.per_hour_usd > b.per_hour_usd ? r : b; }, DATA.rows[0]);
    var holds = val.ranges;
    var totalRead = DATA.ledger.reduce(function (s, l) { return s + l.count; }, 0);
    var facts = [
      [String(DATA.board_size), 'Ranked · of ' + totalRead + ' read'],
      [fmtCompact(totalImplied), 'Implied value · priced like the ' + val.comps_n + ' tokens that trade'],
      ['\u00D7' + shipped.loo_miss.toFixed(2), 'Value miss, held out · \u00D7' + shipped.o2n_miss.toFixed(2) + ' older\u2192newer'],
      [Math.round((holds.loo_holds / holds.loo_n) * 100) + '%', 'Range holds · ' + holds.loo_holds + '/' + holds.loo_n + ' left out · ' + holds.o2n_holds + '/' + holds.o2n_n + ' newer'],
      [String(DATA.verdict_counts.FARM) + ' FARM', 'Worth farming · ' + DATA.verdict_counts.THIN + ' THIN · ' + DATA.verdict_counts.SKIP + ' SKIP on $1,000'],
      [fmtSigned(best.per_hour_usd), 'Best per hour · ' + best.name + ' · net ' + fmtSigned(best.net_usd)]
    ];
    var ul = el('ul', { class: 'stats' });
    facts.forEach(function (f) {
      ul.appendChild(el('li', { class: 'stat' }, [
        el('span', { class: 'num', text: f[0] }),
        el('span', { class: 'lbl', text: f[1] })
      ]));
    });
    var pills = el('p', { class: 'pills' });
    pills.appendChild(el('span', { class: 'pill', text: 'Watchlist ' + covered + '/' + DATA.watchlist_size + ' on the board' }));
    var check = checkBoard();
    pills.appendChild(el('span', { class: 'pill' + (check.same === check.of ? '' : ' bad'), text: 'checkBoard(): ' + check.same + '/' + check.of + ' rows equal board.json' }));
    var wrap = el('div', { class: 'kpi-wrap' });
    wrap.appendChild(ul);
    wrap.appendChild(pills);
    return wrap;
  }

  /* ---------- controls ---------- */

  var searchInput, categorySelect, chainSelect, tierSelect, playSelect, verdictSelect, tvlSelect, trendSelect;
  var ticketSelect, shareSelect, limitSelect, countLine;
  var tabButtons = {};
  var tbody, tableCaption, tableWrap, methodWrap;

  function optionList(select, values, allLabel) {
    while (select.firstChild) select.removeChild(select.firstChild);
    select.appendChild(el('option', { value: 'all', text: allLabel }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }

  function rebuildFilterOptions() {
    var rows = DATA.rows;
    var cats = distinct(rows.map(function (r) { return r.category || 'Other'; }));
    var chains = distinct(rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []));
    var plays = distinct(rows.map(function (r) { return r.play; }));
    optionList(categorySelect, cats, 'All categories');
    optionList(chainSelect, chains, 'All chains');
    while (playSelect.firstChild) playSelect.removeChild(playSelect.firstChild);
    playSelect.appendChild(el('option', { value: 'all', text: 'All plays' }));
    plays.forEach(function (key) {
      var label = rows.filter(function (r) { return r.play === key; })[0].play_label;
      playSelect.appendChild(el('option', { value: key, text: label }));
    });
    if (cats.indexOf(state.category) < 0) state.category = 'all';
    if (chains.indexOf(state.chain) < 0) state.chain = 'all';
    if (plays.indexOf(state.play) < 0 && state.play !== 'all') state.play = 'all';
    categorySelect.value = state.category;
    chainSelect.value = state.chain;
    playSelect.value = state.play;
  }

  function field(labelText, forId, control) {
    var f = el('div', { class: 'field' });
    f.appendChild(el('label', { for: forId, text: labelText }));
    f.appendChild(control);
    return f;
  }

  function buildControls() {
    var box = el('div', { class: 'controls' });

    searchInput = el('input', { type: 'search', id: 'q', placeholder: 'Name, slug or category', value: state.q });
    searchInput.addEventListener('input', function () { state.q = searchInput.value; renderTable(); writeHash(); });
    box.appendChild(field('Search', 'q', searchInput));

    categorySelect = el('select', { id: 'category' });
    categorySelect.addEventListener('change', function () { state.category = categorySelect.value; renderTable(); writeHash(); });
    box.appendChild(field('Category', 'category', categorySelect));

    chainSelect = el('select', { id: 'chain' });
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('Chain', 'chain', chainSelect));

    tierSelect = el('select', { id: 'tier' });
    [['all', 'All tiers'], ['watchlist', 'Watchlist'], ['shared', 'Shared'], ['early', 'Early']].forEach(function (o) {
      tierSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    tierSelect.value = state.tier;
    tierSelect.addEventListener('change', function () { state.tier = tierSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('Tier', 'tier', tierSelect));

    playSelect = el('select', { id: 'play' });
    playSelect.addEventListener('change', function () { state.play = playSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('Play', 'play', playSelect));

    verdictSelect = el('select', { id: 'verdict' });
    [['all', 'All verdicts'], ['FARM', 'FARM'], ['THIN', 'THIN'], ['SKIP', 'SKIP']].forEach(function (o) {
      verdictSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    verdictSelect.value = state.verdict;
    verdictSelect.addEventListener('change', function () { state.verdict = verdictSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('Verdict', 'verdict', verdictSelect));

    tvlSelect = el('select', { id: 'tvl' });
    [['all', 'Any TVL'], ['10', '$10M+'], ['50', '$50M+'], ['200', '$200M+']].forEach(function (o) {
      tvlSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    tvlSelect.value = state.tvl;
    tvlSelect.addEventListener('change', function () { state.tvl = tvlSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('TVL', 'tvl', tvlSelect));

    trendSelect = el('select', { id: 'trend' });
    [['all', 'Any trend'], ['up', 'Growing'], ['down', 'Shrinking'], ['flat', 'Flat (±5%)']].forEach(function (o) {
      trendSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    trendSelect.value = state.trend;
    trendSelect.addEventListener('change', function () { state.trend = trendSelect.value; renderTable(); writeHash(); });
    box.appendChild(field('7-day trend', 'trend', trendSelect));

    var tabs = el('div', { class: 'tabs' });
    [['pre', 'Pre-token'], ['traded', 'Token trades'], ['aside', 'Set aside'], ['method', 'Method'], ['live', 'Live token']].forEach(function (t) {
      var btn = el('button', { type: 'button', class: 'tab', text: t[1], 'aria-pressed': state.tab === t[0] ? 'true' : 'false', onclick: function () { setTab(t[0]); } });
      tabButtons[t[0]] = btn;
      tabs.appendChild(btn);
    });
    box.appendChild(tabs);

    ticketSelect = el('select', { id: 'ticket' });
    [['1000', '$1,000'], ['5000', '$5,000'], ['25000', '$25,000']].forEach(function (o) {
      ticketSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    ticketSelect.value = String(state.ticket);
    ticketSelect.addEventListener('change', function () { state.ticket = parseInt(ticketSelect.value, 10); renderTable(); writeHash(); });
    box.appendChild(field('Ticket', 'ticket', ticketSelect));

    shareSelect = el('select', { id: 'share' });
    [['0.05', '5%'], ['0.10', '10%'], ['0.20', '20%']].forEach(function (o) {
      shareSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    shareSelect.value = state.share.toFixed(2);
    shareSelect.addEventListener('change', function () { state.share = parseFloat(shareSelect.value); renderTable(); writeHash(); });
    box.appendChild(field('Airdrop share', 'share', shareSelect));

    limitSelect = el('select', { id: 'limit' });
    [['25', '25'], ['50', '50'], ['all', 'All']].forEach(function (o) {
      limitSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    limitSelect.value = '50';
    limitSelect.addEventListener('change', function () {
      state.limit = limitSelect.value === 'all' ? Infinity : parseInt(limitSelect.value, 10);
      renderTable();
    });
    box.appendChild(field('Rows shown', 'limit', limitSelect));

    var csvBtn = el('button', { type: 'button', class: 'csv-btn', text: 'Download CSV', onclick: downloadCsv });
    box.appendChild(csvBtn);

    countLine = el('p', { class: 'rowcount' });
    box.appendChild(countLine);
    return box;
  }

  function downloadCsv() {
    var rows = sortedRows();
    var head = state.tab === 'traded'
      ? 'name,slug,tvl_usd,mcap_usd,blind_usd,miss_x'
      : state.tab === 'aside'
        ? 'name,slug,tvl_usd,reason'
        : 'rank,name,slug,tvl_usd,implied_value_usd,verdict,net_usd,per_hour_usd,break_even_usd';
    var lines = rows.map(function (r) {
      var cells = state.tab === 'traded'
        ? [r.name, r.slug, r.tvl_usd, r.mcap_usd, r.blind_usd, r.miss_x]
        : state.tab === 'aside'
          ? [r.name, r.slug, r.tvl_usd, r.reason]
          : [r.rank, r.name, r.slug, r.tvl_usd, r.implied_value_usd, livePlan(r).verdict, livePlan(r).net.toFixed(2), livePlan(r).per_hour.toFixed(2), livePlan(r).break_even === null ? '' : livePlan(r).break_even.toFixed(2)];
      return cells.map(function (c) { var s = String(c); return s.indexOf(',') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
    });
    var blob = new Blob([[head].concat(lines).join('\n')], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'token-radar-' + state.tab + '.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function setTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    state.sort = 'rank';
    state.dir = 1;
    Object.keys(tabButtons).forEach(function (k) { tabButtons[k].setAttribute('aria-pressed', k === tab ? 'true' : 'false'); });
    renderTable();
    writeHash();
  }

  /* ---------- board table ---------- */

  var COLUMNS = [
    { key: 'rank', label: 'Rank' },
    { key: 'name', label: 'Protocol' },
    { key: 'tvl', label: 'TVL' },
    { key: 'change', label: '7d' },
    { key: 'age', label: 'Age' },
    { key: 'value', label: 'Implied value' },
    { key: 'verdict', label: 'Verdict' },
    { key: 'status', label: 'Token status' }
  ];

  function sortBy(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = SORT_DEFAULT_DIR[key] || -1; }
    renderTable();
  }

  function tableHead(columns, valueLabel) {
    var thead = el('thead');
    var tr = el('tr');
    columns.forEach(function (col) {
      var th = el('th', { scope: 'col' });
      if (col.num) th.className = 'num';
      var label = col.key === 'value' && valueLabel ? valueLabel : col.label;
      var btn = el('button', { type: 'button', onclick: function () { sortBy(col.key); } }, [label]);
      if (state.sort === col.key) {
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(el('span', { class: 'arrow', text: state.dir === 1 ? '▲' : '▼' }));
        th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      }
      th.appendChild(btn);
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    return thead;
  }

  function renderTable() {
    if (state.tab === 'method') {
      tableWrap.style.display = 'none';
      methodWrap.style.display = '';
      countLine.textContent = 'Method: how the model works, how it was tested, and the ledger of all 758 protocols.';
      return;
    }
    var rows = sortedRows();
    var shown = rows.slice(0, state.limit);
    tableWrap.style.display = '';
    methodWrap.style.display = 'none';
    // Rebuild the header so the sort arrow and the value-column label follow the tab.
    var table = tableWrap.querySelector('table');
    var oldHead = table.querySelector('thead');
    if (state.tab === 'traded') {
      table.replaceChild(tableHead([
        { key: 'rank', label: '#' }, { key: 'name', label: 'Protocol' }, { key: 'tvl', label: 'TVL', num: true },
        { key: 'value', label: 'Market cap', num: true }, { key: 'blind', label: 'Blind price', num: true }, { key: 'miss', label: 'Miss ×', num: true }
      ]), oldHead);
    } else if (state.tab === 'aside') {
      table.replaceChild(tableHead([
        { key: 'rank', label: '#' }, { key: 'name', label: 'Protocol' }, { key: 'tvl', label: 'TVL', num: true },
        { key: 'value', label: 'Reason' }
      ]), oldHead);
    } else {
      table.replaceChild(tableHead(COLUMNS.map(function (c) { return { key: c.key, label: c.label, num: c.key === 'tvl' || c.key === 'change' || c.key === 'age' || c.key === 'value' }; }), state.tab === 'live' ? 'Market cap' : null), oldHead);
    }
    tableCaption.textContent = state.tab === 'live'
      ? 'Live-token protocols, largest market cap first. Real market caps — these already trade, so they are not ranked on the board.'
      : state.tab === 'traded'
        ? 'Every token that trades, largest market cap first. Blind price: what the fitted curve says it is worth, never having seen it.'
        : state.tab === 'aside'
          ? 'Pre-token protocols the board does not rank, largest TVL first. The ledger in the Method tab accounts for every one of the 758 protocols.'
          : 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.';

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    if (shown.length === 0) {
      var empty = el('tr');
      empty.appendChild(el('td', { colspan: '8', class: 'empty', text: 'No protocols match these filters.' }));
      tbody.appendChild(empty);
    }
    shown.forEach(function (row, i) {
      if (state.tab === 'traded') { tbody.appendChild(tradedRow(row, i + 1)); return; }
      if (state.tab === 'aside') { tbody.appendChild(asideRow(row, i + 1)); return; }
      tbody.appendChild(boardRow(row));
    });
    var liveNote = (state.ticket !== 1000 || state.share !== 0.10) && state.tab === 'pre'
      ? ' · live re-plan: ticket ' + fmtUsdPlain(state.ticket) + ', share ' + Math.round(state.share * 100) + '%'
      : '';
    countLine.textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' protocol' + (rows.length === 1 ? '' : 's') + liveNote;
  }

  function nameCell(row, sub) {
    var td = el('td');
    td.appendChild(el('span', { class: 'proto-name', text: row.name }));
    td.appendChild(el('span', { class: 'proto-sub', text: sub }));
    return td;
  }

  function tradedRow(row, i) {
    var tr = el('tr');
    tr.appendChild(el('td', { class: 'rank', text: String(i) }));
    tr.appendChild(nameCell(row, row.category || 'Other'));
    tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.tvl_usd), title: fmtUsd(row.tvl_usd) }));
    tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.mcap_usd), title: fmtUsd(row.mcap_usd) }));
    tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.blind_usd), title: fmtUsd(row.blind_usd) }));
    tr.appendChild(el('td', { class: 'num ' + (row.miss_x <= 3 ? 'pos' : row.miss_x <= 6 ? '' : 'neg'), text: '\u00D7' + row.miss_x.toFixed(2) }));
    return tr;
  }

  function asideRow(row, i) {
    var tr = el('tr');
    tr.appendChild(el('td', { class: 'rank', text: String(i) }));
    tr.appendChild(nameCell(row, row.category || 'Other'));
    tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.tvl_usd), title: fmtUsd(row.tvl_usd) }));
    tr.appendChild(el('td', { text: row.reason }));
    return tr;
  }

  function boardRow(row) {
    var tr = el('tr', { tabindex: '0' });
    var open = function () { openDialog(row); };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    var maxValue = 0;
    tabRows().forEach(function (r) { var v = rowValue(r); if (v !== null && v > maxValue) maxValue = v; });
    var rankCell = el('td', { class: 'rank' });
    rankCell.appendChild(document.createTextNode(String(row.rank)));
    if (!row.live) {
      rankCell.appendChild(el('span', { class: 'rank-range', text: 'likely ' + row.rank_lo + '–' + row.rank_hi, title: 'Rank range: P10–P90 over 200 bootstrap refits of the curve' }));
    }
    tr.appendChild(rankCell);
    tr.appendChild(nameCell(row, (row.category || 'Other') + ' · ' + row.chains.slice(0, 3).join(', ') + (row.chains.length > 3 ? ' +' + (row.chains.length - 3) : '')));
    tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.tvl_usd), title: fmtUsd(row.tvl_usd) }));
    tr.appendChild(el('td', { class: 'num ' + (row.change_7d === null ? 'muted' : row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) }));
    tr.appendChild(el('td', { class: 'num muted', text: fmtAge(row.age_days) }));
    var valueCell = el('td', { class: 'num' });
    var v = rowValue(row);
    valueCell.appendChild(document.createTextNode(fmtCompact(v)));
    valueCell.title = v === null ? '' : fmtUsd(v);
    var pct = maxValue > 0 && v !== null ? Math.max(1, Math.round((v / maxValue) * 100)) : 0;
    var bar = el('span', { class: 'bar' + (state.tab === 'live' ? ' live' : '') });
    bar.appendChild(el('i', {}));
    bar.firstChild.style.width = pct + '%';
    valueCell.appendChild(bar);
    tr.appendChild(valueCell);
    var verdictCell = el('td');
    if (row.live) {
      verdictCell.appendChild(el('span', { class: 'muted', text: '—' }));
    } else {
      var plan = livePlan(row);
      var vb = el('span', { class: 'badge verdict ' + plan.verdict.toLowerCase(), text: plan.verdict });
      vb.title = 'Farm verdict: ' + plan.verdict + ' — net ' + fmtSigned(plan.net) + ' on a ' + fmtUsdPlain(plan.capital) + ' ticket (slice ' + fmtUsdPlain(plan.slice) + ', fees ' + fmtUsdPlain(plan.fees) + ')';
      verdictCell.appendChild(vb);
    }
    tr.appendChild(verdictCell);
    var badge = el('span', { class: 'badge' + (row.live ? ' live' : ''), text: row.live ? 'Live token' : 'Pre-token' });
    if (!row.live) badge.title = 'Records no token in the snapshot';
    var statusCell = el('td');
    statusCell.appendChild(badge);
    tr.appendChild(statusCell);
    return tr;
  }

  function buildTable() {
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', { class: 'board' });
    tableCaption = el('caption', {});
    table.appendChild(tableCaption);
    table.appendChild(tableHead(COLUMNS.map(function (c) { return { key: c.key, label: c.label, num: c.key === 'tvl' || c.key === 'change' || c.key === 'age' || c.key === 'value' }; }), null));
    tbody = el('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ---------- detail dialog ---------- */

  var dialog = null;
  var dialogInner = null;

  function breakdownRow(label, valueNode) {
    var tr = el('tr');
    tr.appendChild(el('th', { scope: 'row', text: label }));
    var td = el('td');
    if (typeof valueNode === 'string') td.textContent = valueNode;
    else td.appendChild(valueNode);
    tr.appendChild(td);
    return tr;
  }

  function openDialog(row) {
    state.selected = row.slug;
    writeHash();
    dialogInner.innerHTML = '';
    var head = el('div');
    head.appendChild(el('h2', {}, '#' + row.rank + ' · ' + row.name));
    var meta = el('p', { class: 'detail-meta' });
    meta.appendChild(el('span', { class: 'badge' + (row.live ? ' live' : ''), text: row.live ? 'Live token · already trades' : 'Pre-token · records no token' }));
    meta.appendChild(document.createTextNode((row.category || 'Other') + ' · ' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's')));
    head.appendChild(meta);
    var chips = el('ul', { class: 'chips' });
    row.chains.forEach(function (c) { chips.appendChild(el('li', { text: c })); });
    head.appendChild(chips);
    dialogInner.appendChild(head);

    if (row.live) {
      dialogInner.appendChild(el('h3', { text: 'Market values' }));
      var liveTable = el('table', { class: 'breakdown' });
      liveTable.appendChild(breakdownRow('TVL', fmtUsd(row.tvl_usd)));
      liveTable.appendChild(breakdownRow('7-day change', fmtPct(row.change_7d)));
      liveTable.appendChild(breakdownRow('Market cap', fmtUsd(row.mcap_usd)));
      liveTable.appendChild(breakdownRow('Token status', 'Already trades — the market\u2019s own value, not a modelled one.'));
      dialogInner.appendChild(liveTable);
      dialogInner.appendChild(el('p', { class: 'model-note', text: 'This protocol already trades, so it is not ranked on the board and has no farm plan here: the board is pre-token only.' }));
    } else {
      var plan = livePlan(row);
      dialogInner.appendChild(el('h3', { text: 'Model breakdown' }));
      var table = el('table', { class: 'breakdown' });
      table.appendChild(breakdownRow('TVL', fmtUsd(row.tvl_usd)));
      table.appendChild(breakdownRow('7-day growth', fmtPct(row.change_7d) + ' — shown, not used: the blind test kept growth out of the value'));
      var ageText = row.age_days === null
        ? 'unknown (listed date not recorded) — shown, not used: the blind test kept age out of the value'
        : fmtInt(row.age_days) + ' days (listed ' + row.listed_at + ') — ' + fmtInt(row.age_days) + ' days with no token recorded';
      table.appendChild(breakdownRow('Age with no token', ageText));
      table.appendChild(breakdownRow('Size curve', fmtUsd(row.curve) + ' · 10^(' + DATA.curve_a.toFixed(3) + ' + ' + DATA.curve_b.toFixed(3) + ' · log10 TVL)'));
      table.appendChild(breakdownRow('Sector effect', '\u00D7' + Math.pow(10, row.sector_effect).toFixed(3) + ' · ' + row.sector + ' (log10 ' + fmtMult(row.sector_effect) + ')'));
      table.appendChild(breakdownRow('Kinship', row.kin === 'token'
        ? '\u00D70.25 · this name stem already carries a token on record, so the launch value is shared'
        : row.kin === 'parent'
          ? '\u00D7' + row.kinship.toFixed(3) + ' · filed under a parent listing, so its TVL is shared'
          : '\u00D71 · no token on this name stem'));
      table.appendChild(breakdownRow('Implied value', fmtUsd(row.implied_value_usd)));
      table.appendChild(breakdownRow('Rank range', '#' + row.rank_lo + '–' + row.rank_hi + ' · implied value ' + fmtUsd(row.implied_p10) + '–' + fmtUsd(row.implied_p90) + ' (P10–P90 over 200 bootstrap refits)'));
      table.appendChild(breakdownRow('Blind-miss range', fmtUsd(row.low) + '–' + fmtUsd(row.high) + ' · half the blind misses of tokens like it fall inside; the range held ' + DATA.validation.ranges.loo_holds + '/' + DATA.validation.ranges.loo_n + ' leave-one-out and ' + DATA.validation.ranges.o2n_holds + '/' + DATA.validation.ranges.o2n_n + ' older-to-newer'));
      dialogInner.appendChild(table);

      var recomputed = impliedOf(row);
      var recompute = el('p', { class: 'recompute' + (recomputed === row.implied_value_usd ? '' : ' diff') });
      recompute.textContent = recomputed === row.implied_value_usd
        ? 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.'
        : 'The page recomputes this row as ' + fmtUsd(recomputed) + '; board.json carries ' + fmtUsd(row.implied_value_usd) + '.';
      dialogInner.appendChild(recompute);

      dialogInner.appendChild(el('h3', { text: 'Plan economics — verdict: ' + plan.verdict }));
      var costTable = el('table', { class: 'breakdown' });
      costTable.appendChild(breakdownRow('Ticket', fmtUsdPlain(plan.capital) + (plan.capital === FARM.capital && plan.share === FARM.share ? ' · the board\u2019s plan' : ' · live re-plan: move the Ticket and Airdrop share knobs to change it')));
      costTable.appendChild(breakdownRow('Airdrop slice', fmtUsdPlain(plan.slice)));
      costTable.appendChild(breakdownRow('Fees', fmtUsdPlain(plan.fees) + ' · gas ' + fmtUsdPlain(plan.gas) + ' over ' + plan.hold + ' days'));
      costTable.appendChild(breakdownRow('T-bill forgone', fmtUsdPlain(plan.forgone) + ' · ' + Math.round(FARM.tbill * 100) + '% a year on the ticket'));
      costTable.appendChild(breakdownRow('Net', fmtSigned(plan.net) + ' · ' + fmtSigned(plan.per_hour) + ' per hour'));
      costTable.appendChild(breakdownRow('Break-even ticket', plan.break_even === null ? 'none: the net never turns positive' : fmtUsdPlain(plan.break_even)));
      dialogInner.appendChild(costTable);
      dialogInner.appendChild(el('p', { class: 'model-note', text: 'Verdict rule: FARM when the net is positive, THIN when the slice covers the fees, SKIP otherwise — on a fixed ticket, so the verdict is the plan\u2019s economics, not the protocol\u2019s size.' }));

      dialogInner.appendChild(el('h3', { text: 'Farm plan · ' + plan.label + ' on ' + plan.chain }));
      dialogInner.appendChild(el('p', { class: 'model-note', text: 'Eight steps, derived from this protocol\u2019s own record — its category, chains, TVL and age — and netted to the dollar in the claim step. Nothing here claims a token, an airdrop or a points program exists.' }));
      var steps = plan.steps.map(stepText);
      var ol = el('ol', { class: 'farm' });
      steps.forEach(function (s) { ol.appendChild(el('li', { text: s })); });
      dialogInner.appendChild(ol);
    }

    dialogInner.appendChild(el('button', { type: 'button', class: 'detail-close', text: 'Close', onclick: function () { dialog.close(); } }));
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  function findRow(slug) {
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) return DATA.rows[i];
    for (var j = 0; j < liveRows.length; j++) if (liveRows[j].slug === slug) return liveRows[j];
    return null;
  }

  /* ---------- method tab ---------- */

  function kvTable(caption, head, rows) {
    var t = el('table', { class: 'sectors' });
    t.appendChild(el('caption', { text: caption }));
    var hr = el('tr');
    head.forEach(function (h, i) { hr.appendChild(el('th', { scope: 'col', class: i > 0 ? 'num' : '', text: h })); });
    t.appendChild(hr);
    rows.forEach(function (r) {
      var tr = el('tr');
      r.forEach(function (c, i) { tr.appendChild(el('td', { class: i > 0 ? 'num' : '', text: String(c) })); });
      t.appendChild(tr);
    });
    return t;
  }

  function buildMethodTab() {
    var val = DATA.validation;
    var sec = el('section', { class: 'model-panel' });
    sec.appendChild(el('h2', { text: 'How the model works' }));
    sec.appendChild(el('p', { class: 'formula', text: 'implied value = 10^(' + DATA.curve_a.toFixed(3) + ' + ' + DATA.curve_b.toFixed(3) + ' · log10 TVL) · 10^sector effect · kinship' }));
    var ul = el('ul');
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Size curve: '), 'the Theil–Sen line of log10(market cap) on log10(TVL) over ', String(val.comps_n),
      ' comparables — one per token that trades, listings that share a ticker and a name stem merged into one family. A dollar of TVL is worth less in a big protocol (slope ',
      DATA.curve_b.toFixed(3), '), so the curve compresses the giants.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Sector effect: '), 'each sector\u2019s median residual off the curve, shrunk toward zero by ',
      String(MODEL.pseudo_comps), ' pseudo-comparables. The six sectors below are the fitted effects.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Kinship: '), 'a row whose name stem already carries a token on record is worth a quarter (\u00D70.25); a row above the floor but off the watchlist is filed under a parent listing, so its TVL is shared (\u00D72^(b−1)).'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'What was tested and dropped: '), '7-day growth and age. Adding them improves older-to-newer slightly and worsens leave-one-out, so the blind test does not keep them — the ladder below shows the dropped level in full.'
    ]));
    sec.appendChild(ul);

    sec.appendChild(kvTable('Sector effects actually used on this board, fitted from the snapshot\u2019s own traded tokens.',
      ['Sector', 'Effect (log10)', 'As a multiple'],
      Object.keys(DATA.sector_effects).sort().map(function (s) {
        return [s, (DATA.sector_effects[s] >= 0 ? '+' : '') + DATA.sector_effects[s].toFixed(3), '\u00D7' + Math.pow(10, DATA.sector_effects[s]).toFixed(3)];
      })));

    sec.appendChild(el('h3', { text: 'The ladder: every level tested blind' }));
    sec.appendChild(el('p', { class: 'model-note', text: 'Each level is priced blind two ways: leave-one-out (each comparable left out of its own fit) and older-to-newer (fit on tokens on record 900+ days, tested on the newer ones). Miss is the median factor the prediction is off by. The shipped level is 2.' }));
    sec.appendChild(kvTable('Validation ladder on the ' + val.comps_n + ' comparables. Level 3 is shown, not shipped: it improves older-to-newer and worsens leave-one-out.',
      ['Level', 'LOO miss', 'LOO within 3×', 'Older→newer miss', 'Older→newer within 3×'],
      val.ladder.map(function (r) {
        return [r.name, '\u00D7' + r.loo_miss.toFixed(3), (r.loo_within3 * 100).toFixed(1) + '%', '\u00D7' + r.o2n_miss.toFixed(3), (r.o2n_within3 * 100).toFixed(1) + '%'];
      })));
    sec.appendChild(el('p', { class: 'model-note' }, [
      el('strong', {}, 'Robustness: '), 'the same ladder on all ', String(val.comps_all_n),
      ' traded tokens (house categories and receipt tokens included) is L0 \u00D7' + val.ladder_all[0].loo_miss.toFixed(3) + '/\u00D7' + val.ladder_all[0].o2n_miss.toFixed(3),
      ', L1 \u00D7' + val.ladder_all[1].loo_miss.toFixed(3) + '/\u00D7' + val.ladder_all[1].o2n_miss.toFixed(3),
      ', L2 \u00D7' + val.ladder_all[2].loo_miss.toFixed(3) + '/\u00D7' + val.ladder_all[2].o2n_miss.toFixed(3),
      ', L3 \u00D7' + val.ladder_all[3].loo_miss.toFixed(3) + '/\u00D7' + val.ladder_all[3].o2n_miss.toFixed(3),
      ' — the curve beats flat there too, but the sector term worsens older-to-newer unfiltered, which is why those tokens are left out of the fit set.'
    ]));
    sec.appendChild(el('p', { class: 'model-note' }, [
      el('strong', {}, 'Other tests: '), 'blind holdout (every 4th comparable by slug) \u00D7' + val.blind.median_miss_x.toFixed(3),
      ' — the flat multiple on the same split is \u00D7' + val.blind_flat.median_miss_x.toFixed(3) + ', so the split is hard and the curve still beats it; walk-forward (fit pre-2025, test 2025+) \u00D7' + val.walk_forward.median_miss_x.toFixed(3),
      '. The top decile of the leave-one-out predictions holds protocols whose real market caps are ',
      el('strong', {}, (val.top_decile_median_mcap / val.bottom_decile_median_mcap).toFixed(1) + '\u00D7'),
      ' the bottom decile\u2019s (', fmtCompact(val.top_decile_median_mcap), ' vs ', fmtCompact(val.bottom_decile_median_mcap), ' median).'
    ]));
    sec.appendChild(el('p', { class: 'model-note' }, [
      el('strong', {}, 'The honest reading: '), 'the model ranks, it does not price. The typical held-out prediction is off by a factor of \u00D7' + val.ladder[2].loo_miss.toFixed(2),
      ' — but the fitted curve now beats the flat multiple on both blind tests, which the previous model did not. That model\u2019s blind holdout was \u00D76.97 (flat \u00D76.12 on the same split, so the split was hard for every model); this curve scores \u00D73.78 there against flat \u00D76.63. Read the board as a ranking with wide bands, not as a price.'
    ]));

    sec.appendChild(el('h3', { text: 'The ledger: all 758 protocols, each in exactly one group' }));
    sec.appendChild(kvTable('Every protocol in the snapshot, counted once.',
      ['Group', 'Count', 'Reason'],
      DATA.ledger.map(function (l) { return [l.group, String(l.count), l.reason]; })));
    sec.appendChild(el('p', { class: 'model-note', text: 'The 6 rows whose name stem already carries a token stay ranked, with the \u00D70.25 kinship discount stated on each row — they are not hidden in the set-aside tab.' }));

    sec.appendChild(el('h3', { text: 'Farm maths' }));
    sec.appendChild(el('p', { class: 'model-note' }, [
      'Every plan runs on a fixed ', el('strong', {}, fmtUsdPlain(FARM.capital)), ' ticket with a ',
      String(Math.round(FARM.share * 100)), '% airdrop share and a ', String(Math.round(FARM.tbill * 100)),
      '% T-bill rate. Slice = implied value \u00D7 share \u00D7 ticket / (TVL + ticket), spread over the hold against the days the protocol has already run with no token. Fees = every transaction\u2019s gas on the cheapest of the protocol\u2019s first three chains, plus the play\u2019s own fees and carry. Forgone = the T-bill yield the ticket gives up. Net = slice − fees − forgone. ',
      el('strong', {}, 'FARM'), ' when the net is positive, ', el('strong', {}, 'THIN'), ' when the slice covers the fees, ',
      el('strong', {}, 'SKIP'), ' otherwise. Each row also carries its break-even ticket and its dollars per hour. The Ticket and Airdrop share knobs re-plan every row live; the default is the plan board.json carries.'
    ]));
    return sec;
  }

  /* ---------- footer ---------- */

  function buildFooter() {
    return el('p', { class: 'footnote' }, [
      el('strong', {}, 'Disclaimer: '), 'Snapshot: ', sourceName, ', ', DATA.as_of,
      '. Implied value is this entry\u2019s own claim, computed from the snapshot by the ',
      DATA.model_version, ' model — not investment advice, and not a promise that a token will launch. ',
      'Gas figures in the farm plans are estimates; farm at your own risk, and claim only from links the protocol itself publishes.'
    ]);
  }

  /* ---------- assemble ---------- */

  var openSlug = readHash();
  app.textContent = '';
  app.appendChild(buildHeader());
  app.appendChild(buildKpi());
  app.appendChild(buildControls());
  tableWrap = buildTable();
  methodWrap = buildMethodTab();
  methodWrap.style.display = 'none';
  app.appendChild(tableWrap);
  app.appendChild(methodWrap);
  app.appendChild(buildFooter());

  dialog = el('dialog', { class: 'detail' });
  dialogInner = el('div', { class: 'detail-inner' });
  dialog.appendChild(dialogInner);
  dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', function () {
    if (state.selected) { state.selected = null; writeHash(); }
  });
  document.body.appendChild(dialog);

  rebuildFilterOptions();
  renderTable();
  // A deep-linked tab (from the hash) starts on that tab.
  if (state.tab === 'method') {
    tableWrap.style.display = 'none';
    methodWrap.style.display = '';
    countLine.textContent = 'Method: how the model works, how it was tested, and the ledger of all 758 protocols.';
  }
  if (openSlug) {
    var row = findRow(openSlug);
    if (row) {
      if (row.live && state.tab !== 'live') setTab('live');
      openDialog(row);
    }
  }

  // Verification hook: the build checks the page's own functions against board.json.
  window.__radarCheck = { impliedOf: impliedOf, farmPlan: farmPlan, stepText: stepText, digest: digest, checkBoard: checkBoard };
})();
