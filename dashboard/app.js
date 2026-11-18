// Token Radar dashboard. Renders window.RADAR (written beside this page by main.ts):
// the ranked pre-token board, the live-token contrast set, a per-protocol detail dialog
// with the model breakdown and a farm plan, and the model panel. No network: every
// byte shown comes from data.js. No framework, plain DOM.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  var MODEL = DATA.model;

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

  /* ---------- the model, mirrored from lib/model.ts ---------- */

  // The page recomputes a row from the snapshot figures and checks the number
  // board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d ?? 0));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days ?? model.unknown_age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_step * Math.min(Math.max(row.chains.length - 1, 0), model.breadth_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.sector_multiple * growthMult * maturity * breadth));
  }

  /** The first chain a protocol names, or a neutral phrase. */
  function chainOf(p) {
    return p.chains.length > 0 ? p.chains[0] : 'its main chain';
  }

  /** What one simple transaction costs on a chain, as an estimate: gas is not in the snapshot. */
  function gasFor(chain) {
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
  function capitalFor(p) {
    if (p.tvl_usd >= 5000000000) return 250;
    if (p.tvl_usd >= 1000000000) return 150;
    if (p.tvl_usd >= 100000000) return 100;
    return 50;
  }

  /** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
  function holdDaysFor(age) {
    if (age === null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  /** What one simple transaction costs on a chain, in whole dollars, as an estimate: gas is not in the snapshot. */
  function gasUsdFor(chain) {
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
  function planEconomics(p, age) {
    var capital = capitalFor(p);
    var gasEach = gasUsdFor(chainOf(p));
    var hold = holdDaysFor(age);
    var weeks = Math.ceil(hold / 7);
    // One transaction to set up, one a week while holding, one to unwind.
    var gas = Math.round(gasEach * (2 + weeks) * 100) / 100;
    var total = Math.round((capital + gas) * 100) / 100;
    return { capital: capital, gas: gas, total: total, weeks: weeks, gas_share: Math.round((gas / capital) * 1000) / 1000 };
  }

  /** The verdict's base band from the implied value, before the gas step-down. */
  function verdictBase(implied) {
    if (implied >= DATA.verdict_farm_min) return 'FARM';
    if (implied >= DATA.verdict_thin_min) return 'THIN';
    return 'SKIP';
  }

  /** One step down the verdict ladder: FARM to THIN, THIN to SKIP, SKIP stays SKIP. */
  function stepDown(v) {
    if (v === 'FARM') return 'THIN';
    return 'SKIP';
  }

  /**
   * A row's verdict and whether the gas stepped it down: the base band from the implied value,
   * then one step down when the plan's gas alone is more than DATA.verdict_gas_share of its capital.
   */
  function verdictFor(implied, economics) {
    var base = verdictBase(implied);
    if (economics.gas_share > DATA.verdict_gas_share) return { verdict: stepDown(base), downgraded: true };
    return { verdict: base, downgraded: false };
  }

  /** A dollar amount with thousands separators, deterministic and locale-free; cents kept when present. */
  function fmtUsdPlain(n) {
    var whole = Math.trunc(n);
    var cents = Math.round((n - whole) * 100);
    var intPart = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return cents === 0 ? '$' + intPart : '$' + intPart + '.' + String(cents).padStart(2, '0');
  }

  /** The category's one action, in the words a farmer can follow. */
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
      return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as collateral and borrow a small amount against it.';
    if (c.includes('dex'))
      return 'Provide $' + capital + ' of liquidity to ' + name + '\'s largest pool on ' + chain + ' and make one swap through it.';
    if (c.includes('yield') || c.includes('leveraged farm'))
      return 'Deposit $' + capital + ' of USDC into ' + name + '\'s highest-yield vault on ' + chain + ' and let it compound.';
    if (c.includes('bridge') || c.includes('cross chain'))
      return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.includes('restak') || c.includes('staking'))
      return 'Restake $' + capital + ' of the staking asset through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.includes('perpetual') || c.includes('derivative'))
      return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' on ' + chain + ' and open one small hedged position.';
    if (c.includes('prediction'))
      return 'Fund $' + capital + ' and place one position on a ' + name + ' market on ' + chain + '.';
    if (c.includes('curator') || c.includes('allocator') || c.includes('risk'))
      return 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and keep the shares.';
    if (c.includes('stable'))
      return 'Mint or hold $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.includes('rwa'))
      return 'Mint $' + capital + ' of the yield-bearing asset on ' + name + ' on ' + chain + ' and hold it through one distribution.';
    if (c.includes('insurance'))
      return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.includes('chain'))
      return 'Use $' + capital + ' across ' + name + '\'s own apps on its chain and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  /** The weekly qualifying action, flavored by category. */
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.includes('dex')) return 'Swap a small amount through ' + name + ' once a week to keep the position active.';
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral'))
      return 'Adjust the borrow or top up collateral on ' + name + ' once a week.';
    if (c.includes('yield') || c.includes('leveraged farm')) return 'Claim or compound the yield on ' + name + ' once a week.';
    if (c.includes('bridge') || c.includes('cross chain')) return 'Bridge a small amount through ' + name + ' once a week.';
    if (c.includes('perpetual') || c.includes('derivative')) return 'Rebalance the hedge on ' + name + ' once a week.';
    return 'Make one qualifying action each week, such as a deposit, a swap or a vote.';
  }

  /**
   * A protocol's farm plan: seven steps, each an action with a cost and a time. Derived from
   * the protocol's own record (category, chains, TVL, age), never from a hand-written list of
   * names. The seventh step nets the plan to the dollar — the capital, the gas of every
   * transaction, the total — and ends in the verdict. It never claims the protocol has a
   * token, an airdrop or a points program: the protocol records no token, and step 5 says so
   * by conditioning the claim on a page the protocol itself publishes.
   */
  function farmSteps(p, age) {
    var chain = chainOf(p);
    var gas = gasFor(chain);
    var capital = capitalFor(p);
    var hold = holdDaysFor(age);
    var action = actionFor(p, capital, chain);
    var economics = planEconomics(p, age);
    var implied = impliedOf(p, MODEL);
    var v = verdictFor(implied, economics);
    var gasPct = Math.round(economics.gas_share * 100);
    var reason =
      v.verdict === 'FARM'
        ? 'the implied value of ' + fmtUsdPlain(implied) + ' puts this in the board\'s top group, and the plan costs ' + fmtUsdPlain(economics.total)
        : v.verdict === 'THIN'
          ? 'the implied value of ' + fmtUsdPlain(implied) + ' is mid-board; farm it only with capital you can leave alone for ' + hold + ' days'
          : 'the implied value of ' + fmtUsdPlain(implied) + ' is near the board\'s tail, and the plan costs ' + fmtUsdPlain(economics.total) + ', which the value does not justify';
    return [
      {
        text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        cost: 'about ' + gas + ' of gas for the first transaction on ' + chain,
        time: '5 minutes'
      },
      {
        text: action,
        cost: '$' + capital + ' of capital and about ' + gas + ' of gas',
        time: '15 minutes to set up'
      },
      {
        text: weeklyFor(p),
        cost: 'about ' + gas + ' of gas a week',
        time: '10 minutes a week'
      },
      {
        text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
        cost: 'the $' + capital + ' stays in the position',
        time: hold + ' days'
      },
      {
        text: 'If the protocol ever publishes a points or rewards page, claim only from the link it publishes: never pay to claim, and never trust a claim link from a chat, an ad or a DM.',
        cost: 'no fee to check',
        time: '10 minutes'
      },
      {
        text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
        cost: 'nothing but the log',
        time: '5 minutes'
      },
      {
        text: 'Total plan cost: ' + fmtUsdPlain(economics.total) + ' — ' + fmtUsdPlain(economics.capital) + ' of capital stays in the position and ' + fmtUsdPlain(economics.gas) + ' of gas over ' + hold + ' days (about ' + economics.weeks + ' weekly actions). Net: the gas is ' + gasPct + '% of the capital. Verdict: ' + v.verdict + ' — ' + reason + (v.downgraded ? ' (Stepped down one level: the gas alone is ' + gasPct + '% of the capital.)' : ''),
        cost: fmtUsdPlain(economics.total) + ' in all',
        time: hold + ' days'
      }
    ];
  }

  /** A step as one string: its action, then its cost and time, within 20..600 characters. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  /* ---------- state + hash deep-linking ---------- */

  var state = { q: '', category: 'all', chain: 'all', tab: 'pre', sort: 'rank', dir: 1, limit: 50, selected: null };
  var SORT_DEFAULT_DIR = { rank: 1, name: 1, tvl: -1, change: -1, age: -1, value: -1, verdict: 1, status: 1 };

  function readHash() {
    var params = new URLSearchParams(window.location.hash.slice(1));
    var q = params.get('q');
    var category = params.get('category');
    var chain = params.get('chain');
    var tab = params.get('tab');
    var p = params.get('p');
    if (q !== null) state.q = q;
    if (category !== null) state.category = category;
    if (chain !== null) state.chain = chain;
    if (tab === 'pre' || tab === 'live') state.tab = tab;
    return p;
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre') params.set('tab', state.tab);
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
      sector_multiple: null, growth_multiplier: null, maturity_multiplier: null, breadth_multiplier: null,
      live: true
    };
  });

  function tabRows() { return state.tab === 'live' ? liveRows : DATA.rows; }
  function rowValue(row) { return state.tab === 'live' ? row.mcap_usd : row.implied_value_usd; }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return tabRows().filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
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
    else if (key === 'verdict') { var order = { FARM: 0, THIN: 1, SKIP: 2 }; av = a.live ? 3 : order[a.verdict]; bv = b.live ? 3 : order[b.verdict]; }
    else if (key === 'status') { av = a.live ? 1 : 0; bv = b.live ? 1 : 0; }
    else { av = a.rank; bv = b.rank; }
    if (av === null || av === undefined) return 1; // nulls last, either direction
    if (bv === null || bv === undefined) return -1;
    if (av < bv) return -1 * state.dir;
    if (av > bv) return 1 * state.dir;
    return a.rank - b.rank;
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
      'The watchlist is the floor, not the ceiling: all ', el('strong', {}, String(DATA.watchlist_size)),
      ' watchlist protocols are on the board, and the early radar adds ', el('strong', {}, String(DATA.early_size)),
      ' more rows below the ', el('strong', {}, fmtCompact(DATA.floor_usd)),
      ' floor, picked by implied value rather than by TVL. Every protocol on the board ',
      el('strong', {}, 'records no token'),
      ' in the snapshot. Implied value is a model — the live market\u2019s own multiples applied to locked value, growth, age and chain breadth — not a promise that a token will launch.'
    ]));
    head.appendChild(lede);
    return head;
  }

  function buildStats() {
    var vc = DATA.verdict_counts;
    var facts = [
      [covered + '/' + DATA.watchlist_size, 'Watchlist covered'],
      [String(DATA.board_size), 'Pre-token rows'],
      [String(vc.FARM) + ' FARM', 'Verdicts · ' + vc.THIN + ' THIN · ' + vc.SKIP + ' SKIP'],
      [String(DATA.live_size), 'Live-token set aside']
    ];
    var ul = el('ul', { class: 'stats' });
    facts.forEach(function (f) {
      ul.appendChild(el('li', { class: 'stat' }, [
        el('span', { class: 'num', text: f[0] }),
        el('span', { class: 'lbl', text: f[1] })
      ]));
    });
    return ul;
  }

  /* ---------- controls ---------- */

  var searchInput, categorySelect, chainSelect, limitSelect, countLine, tabPre, tabLive, tbody, tableCaption;

  function optionList(select, values, allLabel) {
    while (select.firstChild) select.removeChild(select.firstChild);
    select.appendChild(el('option', { value: 'all', text: allLabel }));
    values.forEach(function (v) { select.appendChild(el('option', { value: v, text: v })); });
  }

  function rebuildFilterOptions() {
    var rows = tabRows();
    var cats = distinct(rows.map(function (r) { return r.category || 'Other'; }));
    var chains = distinct(rows.reduce(function (acc, r) { return acc.concat(r.chains); }, []));
    optionList(categorySelect, cats, 'All categories');
    optionList(chainSelect, chains, 'All chains');
    if (cats.indexOf(state.category) < 0) state.category = 'all';
    if (chains.indexOf(state.chain) < 0) state.chain = 'all';
    categorySelect.value = state.category;
    chainSelect.value = state.chain;
  }

  function buildControls() {
    var box = el('div', { class: 'controls' });

    var searchField = el('div', { class: 'field' });
    searchField.appendChild(el('label', { for: 'q', text: 'Search' }));
    searchInput = el('input', { type: 'search', id: 'q', placeholder: 'Name, slug or category', value: state.q });
    searchInput.addEventListener('input', function () { state.q = searchInput.value; renderTable(); writeHash(); });
    searchField.appendChild(searchInput);
    box.appendChild(searchField);

    var catField = el('div', { class: 'field' });
    catField.appendChild(el('label', { for: 'category', text: 'Category' }));
    categorySelect = el('select', { id: 'category' });
    categorySelect.addEventListener('change', function () { state.category = categorySelect.value; renderTable(); writeHash(); });
    catField.appendChild(categorySelect);
    box.appendChild(catField);

    var chainField = el('div', { class: 'field' });
    chainField.appendChild(el('label', { for: 'chain', text: 'Chain' }));
    chainSelect = el('select', { id: 'chain' });
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; renderTable(); writeHash(); });
    chainField.appendChild(chainSelect);
    box.appendChild(chainField);

    var tabs = el('div', { class: 'tabs' });
    tabPre = el('button', { type: 'button', class: 'tab', text: 'Pre-token', 'aria-pressed': 'true', onclick: function () { setTab('pre'); } });
    tabLive = el('button', { type: 'button', class: 'tab', text: 'Live token', 'aria-pressed': 'false', onclick: function () { setTab('live'); } });
    tabs.appendChild(tabPre);
    tabs.appendChild(tabLive);
    box.appendChild(tabs);

    var limitField = el('div', { class: 'field' });
    limitField.appendChild(el('label', { for: 'limit', text: 'Rows shown' }));
    limitSelect = el('select', { id: 'limit' });
    [['25', '25'], ['50', '50'], ['all', 'All']].forEach(function (o) {
      limitSelect.appendChild(el('option', { value: o[0], text: o[1] }));
    });
    limitSelect.value = '50';
    limitSelect.addEventListener('change', function () {
      state.limit = limitSelect.value === 'all' ? Infinity : parseInt(limitSelect.value, 10);
      renderTable();
    });
    limitField.appendChild(limitSelect);
    box.appendChild(limitField);

    countLine = el('p', { class: 'rowcount' });
    box.appendChild(countLine);
    return box;
  }

  function setTab(tab) {
    if (state.tab === tab) return;
    state.tab = tab;
    state.sort = 'rank';
    state.dir = 1;
    tabPre.setAttribute('aria-pressed', tab === 'pre' ? 'true' : 'false');
    tabLive.setAttribute('aria-pressed', tab === 'live' ? 'true' : 'false');
    rebuildFilterOptions();
    renderTable();
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

  function buildTable() {
    var wrap = el('div', { class: 'table-wrap' });
    var table = el('table', { class: 'board' });
    tableCaption = el('caption', {});
    table.appendChild(tableCaption);
    var thead = el('thead');
    var tr = el('tr');
    COLUMNS.forEach(function (col) {
      var th = el('th', { scope: 'col' });
      if (col.key === 'tvl' || col.key === 'change' || col.key === 'age' || col.key === 'value') th.className = 'num';
      var label = col.label;
      if (col.key === 'value' && state.tab === 'live') label = 'Market cap';
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
    table.appendChild(thead);
    tbody = el('tbody');
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function sortBy(key) {
    if (state.sort === key) state.dir = -state.dir;
    else { state.sort = key; state.dir = SORT_DEFAULT_DIR[key] || -1; }
    renderTable();
  }

  function renderTable() {
    var rows = sortedRows();
    var shown = rows.slice(0, state.limit);
    var maxValue = 0;
    tabRows().forEach(function (r) { var v = rowValue(r); if (v !== null && v > maxValue) maxValue = v; });
    tableCaption.textContent = state.tab === 'live'
      ? 'Live-token protocols, largest market cap first. Real market caps — these already trade, so they are not ranked on the board.'
      : 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.';
    // Rebuild the header so the sort arrow and the value-column label follow the tab.
    var table = tbody.parentNode;
    var oldHead = table.querySelector('thead');
    var fresh = buildTableHead();
    table.replaceChild(fresh, oldHead);

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    if (shown.length === 0) {
      var empty = el('tr');
      empty.appendChild(el('td', { colspan: '8', class: 'empty', text: 'No protocols match these filters.' }));
      tbody.appendChild(empty);
    }
    shown.forEach(function (row) {
      var tr = el('tr', { tabindex: '0' });
      var open = function () { openDialog(row); };
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      var rankCell = el('td', { class: 'rank' });
      rankCell.appendChild(document.createTextNode(String(row.rank)));
      if (!row.live) {
        rankCell.appendChild(el('span', { class: 'rank-range', text: 'likely ' + row.rank_lo + '–' + row.rank_hi, title: 'Rank range: P10–P90 over 200 bootstrap refits of the sector multiples' }));
      }
      tr.appendChild(rankCell);
      var nameCell = el('td');
      nameCell.appendChild(el('span', { class: 'proto-name', text: row.name }));
      nameCell.appendChild(el('span', { class: 'proto-sub', text: (row.category || 'Other') + ' · ' + row.chains.slice(0, 3).join(', ') + (row.chains.length > 3 ? ' +' + (row.chains.length - 3) : '') }));
      tr.appendChild(nameCell);
      tr.appendChild(el('td', { class: 'num', text: fmtCompact(row.tvl_usd), title: fmtUsd(row.tvl_usd) }));
      var chg = el('td', { class: 'num ' + (row.change_7d === null ? 'muted' : row.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(row.change_7d) });
      tr.appendChild(chg);
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
        var vb = el('span', { class: 'badge verdict ' + row.verdict.toLowerCase(), text: row.verdict });
        vb.title = 'Farm verdict: ' + row.verdict + ' — plan costs ' + fmtUsdPlain(row.plan_cost_usd) + ' (' + fmtUsdPlain(row.capital_usd) + ' capital, ' + fmtUsdPlain(row.gas_usd) + ' gas)';
        verdictCell.appendChild(vb);
      }
      tr.appendChild(verdictCell);
      var badge = el('span', { class: 'badge' + (row.live ? ' live' : ''), text: row.live ? 'Live token' : 'Pre-token' });
      if (!row.live) badge.title = 'Records no token in the snapshot';
      var statusCell = el('td');
      statusCell.appendChild(badge);
      tr.appendChild(statusCell);
      tbody.appendChild(tr);
    });
    countLine.textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' protocol' + (rows.length === 1 ? '' : 's');
  }

  function buildTableHead() {
    var thead = el('thead');
    var tr = el('tr');
    COLUMNS.forEach(function (col) {
      var th = el('th', { scope: 'col' });
      if (col.key === 'tvl' || col.key === 'change' || col.key === 'age' || col.key === 'value') th.className = 'num';
      var label = col.label;
      if (col.key === 'value' && state.tab === 'live') label = 'Market cap';
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

  function stepListItem(stepString) {
    var li = el('li');
    var costAt = stepString.indexOf(' Cost: ');
    var timeAt = stepString.indexOf(' Time: ');
    if (costAt > 0 && timeAt > costAt) {
      li.appendChild(document.createTextNode(stepString.slice(0, costAt)));
      li.appendChild(document.createTextNode(' '));
      var rest = stepString.slice(costAt + 7, stepString.length);
      var timePart = rest.slice(rest.indexOf(' Time: ') + 7);
      var costPart = rest.slice(0, rest.indexOf(' Time: '));
      if (timePart.slice(-1) === '.') timePart = timePart.slice(0, -1);
      if (costPart.slice(-1) === '.') costPart = costPart.slice(0, -1);
      var line = el('span', { class: 'cost-time' }, [
        el('strong', {}, 'Cost: '), costPart + '. ',
        el('strong', {}, 'Time: '), timePart + '.'
      ]);
      li.appendChild(line);
    } else {
      li.textContent = stepString;
    }
    return li;
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
      dialogInner.appendChild(el('h3', { text: 'Model breakdown' }));
      var table = el('table', { class: 'breakdown' });
      table.appendChild(breakdownRow('TVL', fmtUsd(row.tvl_usd)));
      var growth = Math.min(MODEL.growth_cap, Math.max(MODEL.growth_floor, row.change_7d ?? 0));
      var growthText = fmtPct(row.change_7d);
      if (row.change_7d !== null && row.change_7d !== growth) growthText += ' (clamped to ' + fmtPct(growth) + ' by the model)';
      if (row.change_7d === null) growthText += ' (no 7-day change recorded; the model counts 0)';
      table.appendChild(breakdownRow('7-day growth', growthText));
      var ageText = row.age_days === null
        ? 'unknown (listed date not recorded; the model counts ' + MODEL.unknown_age_days + ' days)'
        : fmtInt(row.age_days) + ' days (listed ' + row.listed_at + ') — ' + fmtInt(row.age_days) + ' days with no token recorded';
      table.appendChild(breakdownRow('Age with no token', ageText));
      table.appendChild(breakdownRow('Sector multiple', fmtMult(row.sector_multiple) + ' · ' + (row.category || 'Other')));
      table.appendChild(breakdownRow('Growth multiplier', fmtMult(row.growth_multiplier)));
      table.appendChild(breakdownRow('Maturity multiplier', fmtMult(row.maturity_multiplier)));
      table.appendChild(breakdownRow('Breadth multiplier', fmtMult(row.breadth_multiplier) + ' · ' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's')));
      table.appendChild(breakdownRow('Implied value', fmtUsd(row.implied_value_usd)));
      table.appendChild(breakdownRow('Rank range', '#' + row.rank_lo + '–' + row.rank_hi + ' · implied value ' + fmtUsd(row.implied_p10) + '–' + fmtUsd(row.implied_p90) + ' (P10–P90 over 200 bootstrap refits)'));
      dialogInner.appendChild(table);

      var recomputed = impliedOf(row, MODEL);
      var recompute = el('p', { class: 'recompute' + (recomputed === row.implied_value_usd ? '' : ' diff') });
      if (recomputed === row.implied_value_usd) {
        recompute.textContent = 'The page recomputes this row as ' + fmtUsd(recomputed) + ', the same number board.json carries.';
      } else {
        recompute.textContent = 'The page recomputes this row as ' + fmtUsd(recomputed) + '; board.json carries ' + fmtUsd(row.implied_value_usd) + '. The gap is rounding: the sector multiple above is shown to four decimals, while board.json was computed from the full-precision multiple.';
      }
      dialogInner.appendChild(recompute);

      dialogInner.appendChild(el('h3', { text: 'Plan cost — verdict: ' + row.verdict }));
      var costTable = el('table', { class: 'breakdown' });
      costTable.appendChild(breakdownRow('Capital in the position', fmtUsdPlain(row.capital_usd)));
      costTable.appendChild(breakdownRow('Gas over the whole plan', fmtUsdPlain(row.gas_usd)));
      costTable.appendChild(breakdownRow('Total plan cost', fmtUsdPlain(row.plan_cost_usd)));
      costTable.appendChild(breakdownRow('Gas as a share of capital', Math.round((row.gas_usd / row.capital_usd) * 100) + '%'));
      dialogInner.appendChild(costTable);
      dialogInner.appendChild(el('p', { class: 'model-note', text: 'Verdict rule: FARM at an implied value of ' + fmtUsdPlain(DATA.verdict_farm_min) + ' or more, THIN at ' + fmtUsdPlain(DATA.verdict_thin_min) + ' or more, SKIP below that — stepped down one level when the gas alone is more than ' + Math.round(DATA.verdict_gas_share * 100) + '% of the capital.' }));

      dialogInner.appendChild(el('h3', { text: 'Farm plan' }));
      dialogInner.appendChild(el('p', { class: 'model-note', text: 'Seven steps, derived from this protocol\u2019s own record — its category, chains, TVL and age — and netted to the dollar in the last step. Nothing here claims a token, an airdrop or a points program exists.' }));
      var steps = farmSteps(row, row.age_days).map(stepText);
      var ol = el('ol', { class: 'farm' });
      steps.forEach(function (s) { ol.appendChild(stepListItem(s)); });
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

  /* ---------- model panel ---------- */

  function buildModelPanel() {
    var panel = el('section', { class: 'model-panel' });
    panel.appendChild(el('h2', { text: 'How the model works' }));
    panel.appendChild(el('p', { class: 'formula', text: 'implied value = TVL \u00D7 sector multiple \u00D7 growth multiplier \u00D7 maturity multiplier \u00D7 breadth multiplier' }));
    var ul = el('ul');
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Sector multiple: '), 'the median market-cap-per-TVL of the snapshot\u2019s live-token protocols in the same category. Categories with fewer than ',
      String(MODEL.sector_min_live), ' live protocols use the global live median instead.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Growth multiplier: '), '1 + (7-day change \u00F7 100) \u00D7 ', String(MODEL.growth_weight),
      ', with the 7-day change clamped to ', String(MODEL.growth_floor), '% … +', String(MODEL.growth_cap),
      '%. No 7-day change recorded counts as 0.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Maturity multiplier: '), String(MODEL.maturity_floor), ' + (min(age in days, ',
      String(MODEL.maturity_days), ') \u00F7 ', String(MODEL.maturity_days), ') \u00D7 ', String(MODEL.maturity_range),
      '. Unknown age counts as ', String(MODEL.unknown_age_days), ' days. Longer with no token, more pent-up launch value, with diminishing returns.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Breadth multiplier: '), '1 + ', String(MODEL.breadth_step), ' \u00D7 min(chains \u2212 1, ',
      String(MODEL.breadth_cap), '), at most 1.20. More chains, more users and TVL sources a launch reaches.'
    ]));
    ul.appendChild(el('li', {}, [
      el('strong', {}, 'Implied value: '), 'rounded to a whole dollar, at least $1. Each sector multiple is clamped to ',
      String(MODEL.sector_floor), ' … ', String(MODEL.sector_cap), '.'
    ]));
    panel.appendChild(ul);

    var cats = distinct(DATA.rows.map(function (r) { return r.category || 'Other'; }));
    var table = el('table', { class: 'sectors' });
    table.appendChild(el('caption', { text: 'Sector multiples actually used on this board, from the snapshot\u2019s own live market.' }));
    var headRow = el('tr');
    headRow.appendChild(el('th', { scope: 'col', text: 'Category' }));
    headRow.appendChild(el('th', { scope: 'col', class: 'num', text: 'Multiple' }));
    headRow.appendChild(el('th', { scope: 'col', text: 'Basis' }));
    table.appendChild(headRow);
    cats.forEach(function (cat) {
      var own = DATA.sectors[cat];
      var multiple = own !== undefined ? own : DATA.sector_fallback;
      var isFallback = own === undefined || own === DATA.sector_fallback;
      var tr = el('tr');
      tr.appendChild(el('td', { text: cat }));
      tr.appendChild(el('td', { class: 'num', text: fmtMult(multiple) }));
      var basis = el('td');
      if (isFallback) basis.appendChild(el('span', { class: 'fallback-tag', text: 'global fallback' }));
      else basis.textContent = 'category median';
      tr.appendChild(basis);
      table.appendChild(tr);
    });
    panel.appendChild(table);
    panel.appendChild(el('p', { class: 'model-note' }, [
      'Categories with fewer than ', String(MODEL.sector_min_live),
      ' live protocols use the global live median of ', el('strong', {}, DATA.sector_fallback.toFixed(3)),
      ' as their sector multiple. Every row on the board ', el('strong', {}, 'records no token'),
      ' in the snapshot. Implied value is this entry\u2019s model, not a promise: it does not mean a token will launch, that there will be an airdrop, or that any price will follow.'
    ]));

    // --- validation: three tests on the snapshot's own live protocols, plus the flat baseline.
    var val = DATA.validation;
    panel.appendChild(el('h3', { text: 'How the model was tested' }));
    panel.appendChild(el('p', { class: 'model-note', text: 'Each test predicts a live protocol\u2019s market cap with the same formula the board uses, the calibration fit without the protocol being predicted. Error is the log error ln(predicted / actual): 0 is exact, 0.69 is a factor of two.' }));
    var vtable = el('table', { class: 'sectors' });
    vtable.appendChild(el('caption', { text: 'Validation on the snapshot\u2019s live-token protocols. The numbers are the model\u2019s, not a target it was tuned to hit.' }));
    var vhead = el('tr');
    vhead.appendChild(el('th', { scope: 'col', text: 'Test' }));
    vhead.appendChild(el('th', { scope: 'col', class: 'num', text: 'Tested' }));
    vhead.appendChild(el('th', { scope: 'col', class: 'num', text: 'Median |log error|' }));
    vhead.appendChild(el('th', { scope: 'col', class: 'num', text: 'Within 2\u00D7' }));
    vhead.appendChild(el('th', { scope: 'col', class: 'num', text: 'Spearman \u03C1' }));
    vtable.appendChild(vhead);
    [
      [val.loo, 'Leave-one-out'],
      [val.walk_forward, 'Walk-forward (fit pre-2025, test 2025+)'],
      [val.blind, 'Blind holdout (every 4th by slug)'],
      [val.flat_loo, 'Flat 0.25 multiple (baseline)']
    ].forEach(function (pair) {
      var t = pair[0];
      var tr = el('tr');
      tr.appendChild(el('td', { text: pair[1], title: t.method }));
      tr.appendChild(el('td', { class: 'num', text: String(t.n_test) }));
      tr.appendChild(el('td', { class: 'num', text: t.median_abs_log_error.toFixed(3) }));
      tr.appendChild(el('td', { class: 'num', text: (t.within_2x * 100).toFixed(1) + '%' }));
      tr.appendChild(el('td', { class: 'num', text: t.spearman.toFixed(2) }));
      vtable.appendChild(tr);
    });
    panel.appendChild(vtable);
    var errFactor = Math.exp(val.loo.median_abs_log_error);
    var decileRatio = val.top_decile_median_mcap / val.bottom_decile_median_mcap;
    panel.appendChild(el('p', { class: 'model-note' }, [
      el('strong', {}, 'What the tests show: '), 'the model ranks, it does not price. The typical leave-one-out prediction is off by a factor of ',
      el('strong', {}, '\u00D7' + errFactor.toFixed(1)),
      '; only ', String((val.loo.within_2x * 100).toFixed(1)), '% land within 2\u00D7 of the real market cap. A flat 0.25 multiple does about as well on live tokens (median error ',
      String(val.flat_loo.median_abs_log_error.toFixed(3)), ', Spearman ', String(val.flat_loo.spearman.toFixed(2)), ' vs ', String(val.loo.spearman.toFixed(2)),
      ') — the fitted curve\u2019s job is not to beat TVL at pricing, it is to stop a bridge\u2019s TVL being scored like a DEX\u2019s. What the ranking does do: the top decile of the leave-one-out predictions holds protocols whose real market caps are ',
      el('strong', {}, decileRatio.toFixed(0) + '\u00D7'),
      ' the bottom decile\u2019s (', fmtCompact(val.top_decile_median_mcap), ' vs ', fmtCompact(val.bottom_decile_median_mcap), ' median). The walk-forward test under-predicts the newer cohort (mean log error ',
      String(val.walk_forward.bias_log.toFixed(2)), '): protocols listed since 2025 trade richer than the old calibration expects. Read the board as a ranking with wide bands — the rank range on every row is the P10–P90 over 200 bootstrap refits of the sector multiples — not as a price.'
    ]));
    panel.appendChild(el('p', { class: 'model-note' }, [
      el('strong', {}, 'Verdicts: '), 'FARM at an implied value of ', fmtUsdPlain(DATA.verdict_farm_min),
      ' or more, THIN at ', fmtUsdPlain(DATA.verdict_thin_min), ' or more, SKIP below that — stepped down one level when a plan\u2019s gas alone is more than ',
      String(Math.round(DATA.verdict_gas_share * 100)), '% of its capital. The farm plan on every row is netted to the dollar in its last step: the capital, the gas of every transaction, and the total.'
    ]));
    return panel;
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
  app.appendChild(buildStats());
  app.appendChild(buildControls());
  var tableWrap = buildTable();
  app.appendChild(tableWrap);
  app.appendChild(buildModelPanel());
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
  // A deep-linked tab (from the hash) starts on that tab: the buttons are built pressed for
  // Pre-token, so sync them when the hash said Live token.
  if (state.tab === 'live') {
    tabPre.setAttribute('aria-pressed', 'false');
    tabLive.setAttribute('aria-pressed', 'true');
  }
  if (openSlug) {
    var row = findRow(openSlug);
    if (row) {
      if (row.live && state.tab !== 'live') setTab('live');
      openDialog(row);
    }
  }
})();
