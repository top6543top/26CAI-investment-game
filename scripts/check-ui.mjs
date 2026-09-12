import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const baseURL = new URL(process.env.UI_BASE_URL || 'http://127.0.0.1:5173').origin
const output = path.resolve(process.env.UI_ARTIFACTS_DIR || '.ui-test')
const names = ['성균반도체', '동국필름', '이화패션', '경희한방', '숭실전자', '숙명디자인', '중앙미디어', '시립도시개발'];
const prices = [[50000,72000,60000,48000],[30000,33000,28000,32000],[80000,48000,56000,52000],[35000,38500,42000,40000],[60000,69000,63000,75000],[25000,27000,24500,28000],[15000,18000,21000,16500],[45000,49500,54000,58500]];


async function createPage(browser, options = {}) {
  const state = { round: 4, paused: false, cash: 842000, signedIn: true, buys: [], delay: 0, ...options };
  const context = await browser.newContext({ viewport: options.viewport || { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(signedIn => { if (signedIn) sessionStorage.setItem('cai-participant-id', 'team-1'); }, state.signedIn);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const teams = () => [
    { id: 'team-1', nickname: '불나방 투자단', cash: state.cash },
    { id: 'team-2', nickname: '복리의 마법', cash: 1678000 },
    { id: 'team-3', nickname: '상한가 메이커', cash: 1436000 },
    { id: 'team-4', nickname: '월가의 신입생', cash: 1152000 },
    { id: 'team-5', nickname: '가치투자 연구소', cash: 1080000 },
    { id: 'team-6', nickname: '내일은 부자', cash: 986000 },
  ];
  let holdings = state.emptyHoldings ? [] : [{ participant_id: 'team-1', stock_id: 1, quantity: 4 }, { participant_id: 'team-1', stock_id: 5, quantity: 3 }];
  await page.routeWebSocket(/supabase/, socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === baseURL) return route.continue();
    if (!url.pathname.includes('/rest/v1/')) return route.abort();
    let data;
    const table = url.pathname.split('/').at(-1);
    const single = (request.headers().accept || '').includes('vnd.pgrst.object');
    if (table === 'game_state') {
      if (state.connectionError) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Connection unavailable' }) });
      data = { current_round: state.round, is_paused: state.paused };
    } else if (table === 'participants') {
      data = url.searchParams.has('id') ? teams().filter(t => t.id === url.searchParams.get('id').replace('eq.', '')) : teams();
    } else if (table === 'stocks') {
      data = names.map((name, i) => ({ id: i + 1, name, display_order: i + 1, delisted_round: i === 6 ? 8 : i === 7 ? 9 : null }));
    } else if (table === 'stock_prices') {
      let roundLimit = Number((url.searchParams.get('round') || `lte.${state.round}`).split('.')[1]);
      data = prices.flatMap((series, i) => Array.from({ length: Math.min(roundLimit, 11) }, (_, j) => ({ stock_id: i + 1, round: j + 1, price: state.round >= 8 && i === 6 && j >= 7 ? 1000 : series[Math.min(j, 3)] })));
      if (url.searchParams.get('round')?.startsWith('eq.')) data = data.filter(row => row.round === roundLimit);
    } else if (table === 'rounds') {
      const limit = Number((url.searchParams.get('round') || 'lte.11').split('.')[1]);
      data = Array.from({ length: limit }, (_, i) => ({ round: i + 1, year_label: 2016 + i }));
    } else if (table === 'holdings') {
      data = holdings;
    } else if (table === 'asset_history') {
      data = teams().flatMap((team, i) => Array.from({ length: Math.max(0, Math.min(state.round, 11)) }, (_, j) => ({ round: j + 1, year_label: 2016 + j, participant_id: team.id, nickname: team.nickname, total_assets: Math.round(1200000 + (team.cash - 900000) * j / 3), round_profit: 176000 })));
      if (url.searchParams.has('participant_id')) data = data.filter(row => row.participant_id === 'team-1');
      if (url.searchParams.has('limit')) data = data.slice(-1);
    } else if (table === 'join_game') {
      const args = request.postDataJSON();
      if (state.joinError) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: '게임이 이미 종료되었습니다' }) });
      data = { ...teams()[0], nickname: args.p_nickname };
    } else if (table === 'buy_stock') {
      const args = request.postDataJSON();
      state.buys.push(args);
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      const price = prices[args.p_stock_id - 1][Math.min(state.round - 1, 3)];
      if (state.orderError) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: '장이 마감되었습니다' }) });
      state.cash -= price * args.p_quantity;
      const holding = holdings.find(h => h.stock_id === args.p_stock_id);
      if (holding) holding.quantity += args.p_quantity;
      else holdings.push({ participant_id: 'team-1', stock_id: args.p_stock_id, quantity: args.p_quantity });
      data = null;
    } else if (table.startsWith('host_')) {
      state.hostCalls = [...(state.hostCalls || []), { fn: table, args: request.postDataJSON() }];
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      data = null;
    } else {
      throw new Error(`Unhandled API request: ${table}`);
    }
    if (single && Array.isArray(data)) data = data[0] ?? null;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  return { page, context, state, errors };
}

async function capture(page, name) {
  fs.mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
}

async function assertFits(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(dimensions.content <= dimensions.viewport, `Horizontal overflow ${JSON.stringify(dimensions)}`);
}


const results = [];

async function main() {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined, headless: true });
  async function check(name, options, run) {
    const test = await createPage(browser, options);
    try {
      await run(test);
      assert.deepEqual(test.errors, [], 'Browser runtime errors');
      results.push({ name, passed: true });
      console.log('PASS ' + name);
    } catch (error) {
      await capture(test.page, 'failure-' + results.length);
      results.push({ name, passed: false, error: error.message });
      console.log('FAIL ' + name + ': ' + error.message);
    } finally { await test.context.close(); }
  }
  try {
    await check('Market and portfolio fit desktop, tablet, and mobile', {}, async ({ page }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row').first().waitFor();
      assert.match(await page.locator('.pp-total-asset strong').textContent(), /1,259,000/);
      for (const [width, height, name] of [[1440,1000,'market-desktop'],[1024,900,'market-tablet'],[768,1024,'market-small-tablet'],[390,844,'market-mobile'],[320,740,'market-small-mobile']]) {
        await page.setViewportSize({ width, height });
        await assertFits(page);
        const clipped = await page.locator('.pp-stock-name, .pp-stock-pricecol, .pp-brandbar-inner, .pp-asset-strip > div, .pp-tabs').evaluateAll(elements => elements.filter(element => element.scrollWidth > element.clientWidth + 2).map(element => element.className));
        assert.deepEqual(clipped, [], 'Clipped primary UI text');
        await capture(page, name);
      }
    });
    await check('Keyboard order, integer input, MAX and order totals', {}, async ({ page }) => {
      await page.goto(baseURL);
      const row = page.locator('.pp-stock-row-main').first();
      await row.focus();
      await page.keyboard.press('Enter');
      const input = page.getByRole('textbox', { name: '매수 수량' });
      await input.fill('3');
      assert.match(await page.locator('.order-summary').textContent(), /144,000/);
      assert.match(await page.locator('.order-summary').textContent(), /698,000/);
      await page.getByRole('button', { name: 'MAX', exact: true }).click();
      assert.equal(await input.inputValue(), '17');
      assert.match(await page.locator('.order-summary').textContent(), /816,000/);
      assert.match(await page.locator('.order-summary').textContent(), /26,000/);
      await page.setViewportSize({ width: 390, height: 844 });
      await assertFits(page);
      await capture(page, 'order-mobile');
    });
    await check('Buy sends one request and updates cash and holdings', { delay: 600 }, async ({ page, state }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row-main').first().click();
      await page.getByRole('textbox', { name: '매수 수량' }).fill('2');
      await page.locator('.order-submit').evaluate(button => { button.click(); button.click(); });
      assert.equal(await page.locator('.order-submit').isDisabled(), true);
      await page.getByRole('status').filter({ hasText: '매수 완료' }).waitFor();
      assert.equal(state.buys.length, 1);
      assert.deepEqual(state.buys[0], { p_nickname: '불나방 투자단', p_stock_id: 1, p_quantity: 2 });
      assert.match(await page.locator('.pp-cash-asset strong').textContent(), /746,000/);
      assert.match(await page.locator('.pp-stock-row-main').first().textContent(), /보유 6주/);
      assert.equal(await page.getByRole('textbox', { name: '매수 수량' }).inputValue(), '1');
    });
    await check('Insufficient cash disables both quantity and submit', { cash: 1000, emptyHoldings: true }, async ({ page, state }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row-main').first().click();
      assert.equal(await page.locator('.order-submit').isDisabled(), true);
      assert.equal(await page.getByRole('textbox', { name: '매수 수량' }).isDisabled(), true);
      await page.locator('.order-submit').evaluate(button => button.click());
      assert.equal(state.buys.length, 0);
    });
    await check('Paused and delisted stocks cannot be purchased', { paused: true }, async ({ page, state }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row-main').first().click();
      assert.equal(await page.locator('.order-submit').isDisabled(), true);
      state.paused = false; state.round = 8;
      await page.goto(baseURL + '/?stock=7');
      await page.locator('.order-submit').waitFor();
      assert.equal(await page.locator('.order-submit').isDisabled(), true);
      assert.match(await page.locator('.pp-detail-name').textContent(), /상장폐지/);
      await capture(page, 'delisted-desktop');
    });
    await check('Direct chart link, keyboard price inspection, and return navigation', {}, async ({ page, state }) => {
      await page.goto(baseURL + '/?stock=1');
      await page.getByRole('heading', { name: '성균반도체', exact: true }).waitFor();
      await page.getByRole('button', { name: '2017년 주가 72,000원', exact: true }).focus();
      assert.match(await page.locator('.price-chart-readout').textContent(), /72,000/);
      await capture(page, 'chart-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await assertFits(page);
      await capture(page, 'chart-mobile');
      state.round = 11;
      await page.goto(baseURL + '/?stock=1');
      await page.locator('.price-chart-years button').last().waitFor();
      assert.equal(await page.locator('.price-chart-years button').count(), 11);
      await page.setViewportSize({ width: 320, height: 740 });
      await assertFits(page);
      await page.getByRole('button', { name: '2026년 주가 48,000원', exact: true }).focus();
      await capture(page, 'chart-final-round-mobile');
      await page.getByRole('button', { name: '종목 리스트로', exact: true }).click();
      await page.locator('.pp-stock-row').first().waitFor();
      assert.equal(new URL(page.url()).pathname, '/');
    });
    await check('Invalid stock deep link has a recoverable screen', {}, async ({ page }) => {
      await page.goto(baseURL + '/?stock=99999');
      await page.getByRole('heading', { name: '종목을 찾을 수 없습니다' }).waitFor();
      await page.getByRole('button', { name: '종목 리스트로', exact: true }).first().click();
      await page.locator('.pp-stock-row').first().waitFor();
    });
    await check('Holdings filter, empty state, and price sorting', { emptyHoldings: true }, async ({ page }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row').first().waitFor();
      await page.getByRole('button', { name: /보유 종목/ }).click();
      await page.getByRole('heading', { name: '아직 보유한 종목이 없어요' }).waitFor();
      await page.getByRole('button', { name: '전체 종목 보기' }).click();
      await page.getByRole('combobox', { name: '종목 정렬' }).selectOption('price');
      assert.match(await page.locator('.pp-stock-row-main').first().textContent(), /중앙미디어/);
    });
    await check('Join form labels, Enter submit and waiting lobby', { signedIn: false, round: 0 }, async ({ page }) => {
      await page.goto(baseURL);
      await page.getByRole('heading', { name: 'Uni-D 투자 대회', exact: true }).waitFor();
      await capture(page, 'join-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, 'join-mobile');
      await page.getByRole('textbox', { name: '팀명', exact: true }).fill('불나방 투자단');
      await page.getByRole('textbox', { name: '팀명', exact: true }).press('Enter');
      await page.getByRole('heading', { name: '불나방 투자단', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => sessionStorage.getItem('cai-participant-id')), 'team-1');
      await assertFits(page);
      await capture(page, 'lobby-mobile');
    });
    await check('Join server error remains visible with reusable form', { signedIn: false, joinError: true }, async ({ page }) => {
      await page.goto(baseURL);
      await page.getByLabel('팀명', { exact: true }).fill('불나방 투자단');
      await page.getByRole('button', { name: '입장하기', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: '게임이 이미 종료되었습니다' }).waitFor();
      assert.equal(await page.getByRole('button', { name: '입장하기', exact: true }).isEnabled(), true);
    });
    await check('Order error preserves cash and permits correction', { orderError: true }, async ({ page }) => {
      await page.goto(baseURL);
      await page.locator('.pp-stock-row-main').first().click();
      await page.locator('.order-submit').click();
      await page.getByRole('alert').filter({ hasText: '장이 마감되었습니다' }).waitFor();
      assert.match(await page.locator('.pp-cash-asset strong').textContent(), /842,000/);
      assert.equal(await page.locator('.order-submit').isEnabled(), true);
    });
    await check('Connection failure has working retry', { connectionError: true }, async ({ page, state }) => {
      await page.goto(baseURL);
      await page.getByRole('heading', { name: '연결이 잠시 끊겼어요' }).waitFor();
      state.connectionError = false;
      await page.getByRole('button', { name: '다시 연결', exact: true }).click();
      await page.locator('.pp-stock-row').first().waitFor();
    });
    await check('Leaderboard and final results use actual fixture ranks and fit mobile', {}, async ({ page, state }) => {
      await page.goto(baseURL + '/display');
      await page.locator('.disp-podium-team').first().waitFor();
      assert.match(await page.locator('.disp-podium-team').first().textContent(), /복리의 마법/);
      assert.match(await page.locator('.disp-rank-me').textContent(), /1,259,000/);
      await capture(page, 'leaderboard-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await assertFits(page);
      await capture(page, 'leaderboard-mobile');
      await page.setViewportSize({ width: 320, height: 740 });
      await assertFits(page);
      state.round = 12;
      await page.goto(baseURL);
      await page.waitForURL('**/display');
      await page.getByRole('heading', { name: '최종 순위', exact: true }).waitFor();
      await capture(page, 'final-small-mobile');
    });
    await check('Host cancel confirmation and pending request guard', { delay: 600 }, async ({ page, state }) => {
      await page.goto(baseURL + '/host');
      const next = page.getByRole('button', { name: '5라운드로 진행', exact: true });
      await next.waitFor();
      assert.equal(await next.isDisabled(), false);
      await capture(page, 'host-desktop');
      page.once('dialog', dialog => dialog.dismiss());
      await page.getByRole('button', { name: '전체 초기화', exact: true }).click();
      assert.equal((state.hostCalls || []).length, 0);
      page.once('dialog', dialog => dialog.accept());
      await next.click();
      assert.equal(await page.getByRole('button', { name: '거래 일시정지', exact: true }).isDisabled(), true);
      await page.getByRole('status').filter({ hasText: '5라운드로 진행했습니다' }).waitFor();
      assert.deepEqual(state.hostCalls, [{ fn: 'host_next_year', args: {} }]);
      await page.setViewportSize({ width: 390, height: 844 });
      await assertFits(page);
      await capture(page, 'host-mobile');
      await page.setViewportSize({ width: 320, height: 740 });
      await assertFits(page);
    });
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify({ passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length }));
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });
