import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BriefcaseBusiness, ChartNoAxesCombined, Check, ChevronDown, ChevronRight, CircleAlert, Flag, Layers3, LoaderCircle, Radio, RefreshCw, Trophy, Users, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import StockPriceChart from '../components/StockPriceChart'
import StockAvatar from '../components/StockAvatar'
import OrderTicket from '../components/OrderTicket'
import Toast from '../components/Toast'
import type { Stock, StockPrice } from '../lib/types'
import './ParticipantPage.css'

const SEED_MONEY = 1200000
const SESSION_KEY = 'cai-participant-id'
interface Me { id: string; nickname: string; cash: number }
interface RoundInfo { round: number; yearLabel: number }
type StockFilter = 'all' | 'held'

function PriceChange({ price, previous }: { price: number; previous?: number }) {
  if (previous === undefined || previous <= 0) return <span className="pp-change muted">첫 거래</span>
  const delta = price - previous
  return <span className={'pp-change ' + (delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'muted')}>
    {delta > 0 ? <ArrowUpRight /> : delta < 0 ? <ArrowDownRight /> : null}
    {delta > 0 ? '+' : ''}{((delta / previous) * 100).toFixed(1)}%
  </span>
}

export default function ParticipantPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const chartStockId = searchParams.get('stock')
  const { gameState, loading, error: connectionError, retry } = useGameState()
  const [nicknameInput, setNicknameInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [restoring, setRestoring] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [stocks, setStocks] = useState<Stock[]>([])
  const [prices, setPrices] = useState<StockPrice[]>([])
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [marketLoading, setMarketLoading] = useState(false)
  const [marketError, setMarketError] = useState(false)
  const [marketAttempt, setMarketAttempt] = useState(0)
  const [holdings, setHoldings] = useState<Record<number, number>>({})
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [expandedStockId, setExpandedStockId] = useState<number | null>(null)
  const [lastRoundProfit, setLastRoundProfit] = useState<number | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [participantList, setParticipantList] = useState<{ id: string; nickname: string }[]>([])
  const [filter, setFilter] = useState<StockFilter>('all')
  const [sort, setSort] = useState('default')
  const [pendingStockId, setPendingStockId] = useState<number | null>(null)
  const buying = useRef(false)
  const joinPending = useRef(false)

  useEffect(() => { document.title = '거래소 | Uni-D 투자 대회' }, [])

  useEffect(() => {
    let active = true
    const savedId = sessionStorage.getItem(SESSION_KEY)
    if (!savedId) { setRestoring(false); return }
    supabase.from('participants').select('id, nickname, cash').eq('id', savedId).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (data) setMe({ id: data.id, nickname: data.nickname, cash: data.cash })
        else if (!error) sessionStorage.removeItem(SESSION_KEY)
        setRestoring(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!me || !gameState || gameState.currentRound >= 1) { setParticipantList([]); return }
    let active = true
    async function loadParticipants() {
      const { data } = await supabase.from('participants').select('id, nickname').order('created_at')
      if (active) setParticipantList(data ?? [])
    }
    loadParticipants()
    const channel = supabase.channel('participant_list_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, loadParticipants).subscribe()
    return () => { active = false; supabase.removeChannel(channel) }
  }, [me?.id, gameState?.currentRound])

  useEffect(() => {
    let active = true
    setQuantities({})
    setExpandedStockId(null)
    setError(null)
    setStocks([])
    setPrices([])
    setRounds([])
    setMarketError(false)
    if (!gameState || gameState.currentRound < 1 || gameState.currentRound > 11) {
      setMarketLoading(false)
      // Clear revealed market data on reset, including deep links.
      if (gameState) setSearchParams({}, { replace: true })
      return
    }
    const currentRound = gameState.currentRound
    setMarketLoading(true)
    async function loadMarket() {
      const [stockResult, priceResult, roundResult] = await Promise.all([
        supabase.from('stocks').select('id, name, display_order, delisted_round').order('display_order'),
        supabase.from('stock_prices').select('stock_id, round, price').lte('round', currentRound).order('round'),
        supabase.from('rounds').select('round, year_label').lte('round', currentRound).order('round'),
      ])
      if (!active) return
      if (stockResult.error || priceResult.error || roundResult.error) {
        setMarketError(true)
      } else {
        setStocks((stockResult.data ?? []).map(s => ({ id: s.id, name: s.name, displayOrder: s.display_order, delistedRound: s.delisted_round })))
        setPrices((priceResult.data ?? []).map(p => ({ stockId: p.stock_id, round: p.round, price: p.price })))
        setRounds((roundResult.data ?? []).map(r => ({ round: r.round, yearLabel: r.year_label })))
      }
      setMarketLoading(false)
    }
    loadMarket().catch(() => { if (active) { setMarketError(true); setMarketLoading(false) } })
    return () => { active = false }
  }, [gameState?.currentRound, marketAttempt])

  useEffect(() => {
    if (gameState?.currentRound === 12) navigate('/display', { replace: true })
  }, [gameState?.currentRound, navigate])

  async function refreshPortfolio(participantId: string) {
    const [person, positions, history] = await Promise.all([
      supabase.from('participants').select('id, nickname, cash').eq('id', participantId).maybeSingle(),
      supabase.from('holdings').select('stock_id, quantity').eq('participant_id', participantId),
      supabase.from('asset_history').select('round_profit').eq('participant_id', participantId).order('round', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (person.error || positions.error) return false
    if (!person.data) {
      setMe(null)
      setHoldings({})
      sessionStorage.removeItem(SESSION_KEY)
      return false
    }
    setMe({ id: person.data.id, nickname: person.data.nickname, cash: person.data.cash })
    const next: Record<number, number> = {}
    for (const holding of positions.data ?? []) next[holding.stock_id] = holding.quantity
    setHoldings(next)
    if (!history.error) setLastRoundProfit(history.data?.round_profit ?? null)
    return true
  }

  useEffect(() => {
    if (me) refreshPortfolio(me.id)
  }, [me?.id, gameState?.currentRound])

  async function join() {
    if (joinPending.current || !nicknameInput.trim()) return
    joinPending.current = true
    setJoining(true)
    setError(null)
    try {
      const { data, error } = await supabase.rpc('join_game', { p_nickname: nicknameInput.trim() }).single()
      if (error) { setError(error.message); return }
      if (!data) { setError('입장 정보를 확인하지 못했습니다. 다시 시도해 주세요.'); return }
      setMe(data as Me)
      sessionStorage.setItem(SESSION_KEY, (data as Me).id)
    } catch {
      setError('연결을 확인한 뒤 다시 입장해 주세요.')
    } finally {
      joinPending.current = false
      setJoining(false)
    }
  }

  function priceForRound(stockId: number, round: number) {
    return prices.find(p => p.stockId === stockId && p.round === round)?.price
  }
  function isDelisted(stock: Stock) {
    return stock.delistedRound !== null && (gameState?.currentRound ?? 0) >= stock.delistedRound
  }
  function quantityFor(stockId: number) {
    const price = priceForRound(stockId, gameState?.currentRound ?? 0) ?? 0
    const max = price > 0 && me ? Math.floor(me.cash / price) : 0
    return Math.max(1, Math.min(Math.floor(quantities[stockId] ?? 1), Math.max(1, max)))
  }

  async function buy(stock: Stock) {
    if (!me || !gameState || buying.current || gameState.isPaused || isDelisted(stock)) return
    const price = priceForRound(stock.id, gameState.currentRound)
    const quantity = quantityFor(stock.id)
    if (!price || price <= 0 || quantity < 1 || !Number.isSafeInteger(quantity) || price * quantity > me.cash) return
    buying.current = true
    setPendingStockId(stock.id)
    setError(null)
    try {
      const { error } = await supabase.rpc('buy_stock', { p_nickname: me.nickname, p_stock_id: stock.id, p_quantity: quantity })
      if (error) { setError(error.message); return }
      setQuantities(prev => ({ ...prev, [stock.id]: 1 }))
      const refreshed = await refreshPortfolio(me.id)
      setToastMessage(stock.name + ' ' + quantity.toLocaleString() + '주 매수 완료, ' + (price * quantity).toLocaleString() + '원')
      if (!refreshed) setError('매수는 완료되었지만 잔액을 갱신하지 못했습니다. 새로고침해 주세요.')
    } catch {
      setError('주문 결과를 확인하지 못했습니다. 다시 매수하기 전에 잔액을 새로고침해 주세요.')
    } finally {
      buying.current = false
      setPendingStockId(null)
    }
  }

  const brand = <BrandBar>{me ? <div className="pp-brand-team"><Users /><span title={me.nickname}>{me.nickname}</span></div> : undefined}</BrandBar>
  const errorNotice = error && <div className="inline-error" role="alert"><CircleAlert /><span>{error}</span></div>

  if (connectionError) return <main>{brand}<div className="loading-screen"><Radio /><h1>연결이 잠시 끊겼어요</h1><p>{connectionError}</p><button className="secondary-button" onClick={retry}><RefreshCw />다시 연결</button></div></main>
  if (loading || !gameState || restoring || gameState.currentRound === 12) return <main>{brand}<div className="loading-screen" role="status"><img src="/unid-logo.webp" alt="Uni-D" /><LoaderCircle className="spin" /><p>거래소에 연결하고 있습니다</p></div></main>

  if (!me) return (
    <main className="pp-page pp-entry-page">
      {brand}
      <div className="pp-entry">
        <div className="pp-entry-topline"><span className="eyebrow">팀 대항 모의 투자</span><span className="status-badge">{gameState.currentRound < 1 ? '참가 접수 중' : '대회 진행 중'}</span></div>
        <img className="pp-entry-logo" src="/unid-logo.webp" alt="Uni-D" draggable={false} />
        <h1>Uni-D 투자 대회</h1>
        <p className="pp-entry-sub">우리 팀의 다음 투자는?</p>
        <dl className="pp-entry-stats">
          <div><dt>시작 자금</dt><dd>120<span>만원</span></dd></div>
          <div><dt>투자 라운드</dt><dd>11<span>라운드</span></dd></div>
        </dl>
        <form className="pp-join-form" onSubmit={event => { event.preventDefault(); join() }}>
          <div className="pp-form-heading"><h2>팀 입장</h2><span>팀명만 입력하면 바로 입장합니다</span></div>
          <label htmlFor="team-name">팀명</label>
          <input id="team-name" name="nickname" autoComplete="username" placeholder="팀명을 입력하세요" value={nicknameInput} onChange={event => setNicknameInput(event.target.value)} required disabled={joining} />
          {errorNotice}
          <button type="submit" className="primary-button" disabled={joining || !nicknameInput.trim()}>{joining ? <LoaderCircle className="spin" /> : null}{joining ? '입장 중' : '입장하기'}<ArrowRight /></button>
        </form>
        <div className="pp-entry-footer"><span>Uni-D 모의 투자 대회</span><span>제작 정유현</span></div>
      </div>
    </main>
  )

  if (gameState.currentRound < 1) return (
    <main className="pp-page pp-entry-page">
      {brand}
      <div className="pp-lobby">
        <div className="pp-lobby-status"><Check /><span>참가 등록 완료</span></div>
        <h1>{me.nickname}</h1>
        <p className="pp-lobby-sub">진행자의 시작을 기다리고 있어요.</p>
        <div className="pp-lobby-funds"><Wallet /><span>준비된 투자금</span><strong>{me.cash.toLocaleString()}<small> 원</small></strong></div>
        <section className="pp-lobby-teams">
          <div className="pp-section-heading"><h2>참가자 목록</h2><span>{participantList.length}팀</span></div>
          <ul className="pp-team-list">{participantList.map((participant, index) => (
            <li key={participant.id} className={participant.id === me.id ? 'is-me' : ''}><span className="pp-team-index">{String(index + 1).padStart(2, '0')}</span><span>{participant.nickname}</span>{participant.id === me.id && <b>우리 팀</b>}<Check /></li>
          ))}</ul>
        </section>
        <div className="pp-lobby-bottom"><Radio /><span>게임이 시작되면 거래소가 열립니다</span></div>
      </div>
    </main>
  )

  const currentHoldingsValue = Object.entries(holdings).reduce((sum, [id, quantity]) => sum + quantity * (priceForRound(Number(id), gameState.currentRound) ?? 0), 0)
  const totalAssets = me.cash + currentHoldingsValue
  const returnRate = ((totalAssets - SEED_MONEY) / SEED_MONEY) * 100
  const heldStocks = stocks.filter(stock => holdings[stock.id] > 0)
  const currentYear = rounds.find(round => round.round === gameState.currentRound)?.yearLabel
  const upCount = stocks.filter(stock => {
    const previous = priceForRound(stock.id, gameState.currentRound - 1)
    return previous !== undefined && (priceForRound(stock.id, gameState.currentRound) ?? 0) > previous
  }).length
  const downCount = stocks.filter(stock => {
    const previous = priceForRound(stock.id, gameState.currentRound - 1)
    return previous !== undefined && (priceForRound(stock.id, gameState.currentRound) ?? 0) < previous
  }).length
  const roundHeader = <section className="pp-round-header">
    <div className="pp-round-title"><p className="eyebrow">Uni-D 투자 대회</p><h1>{currentYear ? currentYear + '년' : '투자'} <span>거래소</span></h1><div className={'status-badge' + (gameState.isPaused ? ' paused' : '')}>{gameState.isPaused ? '거래 일시정지' : '거래 진행 중'}</div></div>
    <div className="pp-round-progress"><div><span><Flag />현재 라운드</span><strong>{String(gameState.currentRound).padStart(2, '0')}<small> / 11</small></strong></div><div className="pp-round-steps" role="progressbar" aria-label="대회 라운드" aria-valuemin={0} aria-valuemax={11} aria-valuenow={gameState.currentRound}>{Array.from({ length: 11 }, (_, index) => <span key={index} className={index + 1 === gameState.currentRound ? 'current' : index < gameState.currentRound ? 'complete' : ''} />)}</div><p>{11 - gameState.currentRound > 0 ? '최종 정산까지 ' + (11 - gameState.currentRound) + '라운드' : '마지막 투자 라운드'}</p></div>
  </section>

  function orderTicket(stock: Stock) {
    return <OrderTicket price={priceForRound(stock.id, gameState!.currentRound)} quantity={quantityFor(stock.id)} cash={me!.cash} paused={gameState!.isPaused} delisted={isDelisted(stock)} pending={pendingStockId !== null} onChange={next => setQuantities(prev => ({ ...prev, [stock.id]: next }))} onBuy={() => buy(stock)} />
  }
  const marketStatus = marketError ? <div className="pp-market-empty"><CircleAlert /><h3>종목을 불러오지 못했어요</h3><button className="secondary-button" onClick={() => setMarketAttempt(value => value + 1)}><RefreshCw />다시 불러오기</button></div> : marketLoading ? <div className="pp-market-empty" role="status"><LoaderCircle className="spin" /><p>시장 정보를 불러오는 중</p></div> : null

  if (chartStockId !== null) {
    const stock = stocks.find(item => item.id === Number(chartStockId))
    const price = stock ? priceForRound(stock.id, gameState.currentRound) : undefined
    const previous = stock ? priceForRound(stock.id, gameState.currentRound - 1) : undefined
    const series = stock ? rounds.flatMap(round => {
      const value = priceForRound(stock.id, round.round)
      return value === undefined ? [] : [{ ...round, price: value }]
    }) : []
    return <main className="pp-page">{brand}<div className="pp-shell">
      <button className="pp-back" onClick={() => { setSearchParams({}); setError(null) }}><ArrowLeft />종목 리스트로</button>
      {roundHeader}
      {marketStatus || !stock ? marketStatus || <div className="pp-market-empty"><ChartNoAxesCombined /><h2>종목을 찾을 수 없습니다</h2><button className="secondary-button" onClick={() => setSearchParams({})}>종목 리스트로<ArrowRight /></button></div> : (
        <div className="pp-detail-layout">
          <section className="pp-detail-main">
            <div className="pp-detail-stock"><StockAvatar name={stock.name} order={stock.displayOrder} large /><div><div className="pp-detail-name"><h2>{stock.name}</h2>{isDelisted(stock) && <span className="pp-delisted-badge">상장폐지</span>}</div><p className="eyebrow">종목번호 {String(stock.displayOrder).padStart(3, '0')}</p></div></div>
            <div className="pp-detail-quote"><strong>{price === undefined ? '-' : price.toLocaleString()}<small> 원</small></strong><PriceChange price={price ?? 0} previous={previous} /><span>전 라운드 대비</span></div>
            <div className="pp-chart-heading"><h3>주가 추이</h3><span>{series.length}개 라운드 전체</span></div>
            <StockPriceChart series={series} />
            <dl className="pp-detail-stats"><div><dt>직전 가격</dt><dd>{previous === undefined ? '-' : previous.toLocaleString() + '원'}</dd></div><div><dt>현재 보유</dt><dd>{(holdings[stock.id] ?? 0).toLocaleString()}주</dd></div><div><dt>보유 평가금액</dt><dd>{((holdings[stock.id] ?? 0) * (price ?? 0)).toLocaleString()}원</dd></div></dl>
          </section>
          <aside className="pp-detail-order"><div className="pp-section-heading"><h2>매수 주문</h2></div><div className="pp-order-cash"><span>주문 가능 잔액</span><strong>{me.cash.toLocaleString()}원</strong></div>{orderTicket(stock)}{errorNotice}<p className="pp-order-note"><CircleAlert />장중에는 매도할 수 없습니다. 라운드가 끝나면 자동으로 매도됩니다.</p></aside>
        </div>
      )}
    </div>{toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}</main>
  }

  const visibleStocks = stocks.filter(stock => filter === 'all' || holdings[stock.id] > 0).sort((a, b) => {
    if (sort === 'price') return (priceForRound(a.id, gameState.currentRound) ?? 0) - (priceForRound(b.id, gameState.currentRound) ?? 0)
    if (sort === 'change') {
      const change = (stock: Stock) => {
        const previous = priceForRound(stock.id, gameState.currentRound - 1)
        return previous && previous > 0 ? ((priceForRound(stock.id, gameState.currentRound) ?? 0) - previous) / previous : 0
      }
      return change(b) - change(a)
    }
    return a.displayOrder - b.displayOrder
  })

  return <main className="pp-page">
    {brand}
    <div className="pp-shell">
      {roundHeader}
      <section className="pp-asset-strip" aria-label="내 투자 자산">
        <div className="pp-total-asset"><p><BriefcaseBusiness />총 자산</p><strong>{marketLoading || marketError ? '-' : totalAssets.toLocaleString()}<small> 원</small></strong><span className={returnRate >= 0 ? 'positive' : 'negative'}>{marketLoading || marketError ? '시장 정보 확인 중' : (returnRate >= 0 ? '+' : '') + returnRate.toFixed(1) + '%'}<em>처음 대비</em></span></div>
        <div className="pp-cash-asset"><p><Wallet />주문 가능 잔액</p><strong>{me.cash.toLocaleString()}<small> 원</small></strong><span>시작 자금 1,200,000원</span></div>
        <div className="pp-stock-asset"><p><Layers3 />보유 주식 평가금액</p><strong>{marketLoading || marketError ? '-' : currentHoldingsValue.toLocaleString()}<small> 원</small></strong><span>{heldStocks.length}개 종목 보유</span></div>
      </section>
      <div className={'pp-rulebar' + (gameState.isPaused ? ' is-paused' : '')}><CircleAlert /><span>{gameState.isPaused ? '거래가 일시정지되었습니다. 진행자의 재개를 기다려주세요.' : '장중에는 매도할 수 없습니다. 라운드가 끝나면 새 가격으로 자동 매도됩니다.'}</span><span className="pp-rule-tag">대회 규칙</span></div>
      {errorNotice}
      <div className="pp-layout">
        <section className="pp-market">
          <div className="pp-section-heading"><h2>종목</h2><div className="pp-market-direction"><span className="positive"><ArrowUpRight />{upCount}</span><span className="negative"><ArrowDownRight />{downCount}</span></div></div>
          <div className="pp-market-toolbar"><div className="pp-tabs" role="group" aria-label="종목 필터"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>전체 종목 <span>{stocks.length}</span></button><button aria-pressed={filter === 'held'} onClick={() => setFilter('held')}>보유 종목 <span>{heldStocks.length}</span></button></div><label className="pp-sort"><span className="sr-only">종목 정렬</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="default">기본순</option><option value="change">등락률순</option><option value="price">낮은 가격순</option></select><ChevronDown /></label></div>
          <div className="pp-stock-columns" aria-hidden="true"><span>종목명</span><span>주가 추이</span><span>현재가 / 등락률</span><span /></div>
          {marketStatus || <ul className="pp-stocklist">{visibleStocks.map(stock => {
            const price = priceForRound(stock.id, gameState.currentRound)
            const previous = priceForRound(stock.id, gameState.currentRound - 1)
            const expanded = expandedStockId === stock.id
            const series = prices.filter(point => point.stockId === stock.id).map(point => ({ ...point, yearLabel: rounds.find(round => round.round === point.round)?.yearLabel ?? point.round }))
            return <li key={stock.id} className={'pp-stock-row' + (expanded ? ' is-expanded' : '')}>
              <button className="pp-stock-row-main" aria-expanded={expanded} aria-controls={'order-' + stock.id} onClick={() => { setExpandedStockId(expanded ? null : stock.id); setError(null) }}>
                <div className="pp-stock-identity"><StockAvatar name={stock.name} order={stock.displayOrder} /><div><span className="pp-stock-name">{stock.name}</span><span className="pp-stock-meta">{isDelisted(stock) ? <span className="pp-delisted-badge">상장폐지</span> : holdings[stock.id] > 0 ? <span className="pp-holding-badge">보유 {holdings[stock.id].toLocaleString()}주</span> : '종목번호 ' + String(stock.displayOrder).padStart(3, '0')}</span></div></div>
                <div className="pp-sparkline"><StockPriceChart series={series} compact /></div>
                <div className="pp-stock-pricecol"><strong>{price === undefined ? '-' : price.toLocaleString()}<small> 원</small></strong><PriceChange price={price ?? 0} previous={previous} /></div>
                <ChevronDown className="pp-expand-icon" />
              </button>
              {expanded && <div className="pp-expanded-order" id={'order-' + stock.id}><div className="pp-expanded-heading"><span>매수 주문</span><button onClick={() => { setSearchParams({ stock: String(stock.id) }); setError(null) }}><ChartNoAxesCombined />차트 보기<ArrowRight /></button></div>{orderTicket(stock)}</div>}
            </li>
          })}</ul>}
          {!marketLoading && !marketError && visibleStocks.length === 0 && <div className="pp-market-empty"><BriefcaseBusiness /><h3>{filter === 'held' ? '아직 보유한 종목이 없어요' : '등록된 종목이 없습니다'}</h3>{filter === 'held' && <button className="secondary-button" onClick={() => setFilter('all')}>전체 종목 보기<ArrowRight /></button>}</div>}
          <div className="pp-market-footer"><span><Radio />라운드별 확정 가격</span><span>단위 원</span></div>
        </section>
        <aside className="pp-portfolio">
          <div className="pp-section-heading"><h2>내 포트폴리오</h2></div>
          <div className="pp-allocation" aria-label="자산 구성"><div style={{ width: (totalAssets > 0 ? Math.min(100, currentHoldingsValue / totalAssets * 100) : 0) + '%' }} /></div>
          <div className="pp-allocation-legend"><span><i />주식 {totalAssets > 0 ? (currentHoldingsValue / totalAssets * 100).toFixed(0) : 0}%</span><span><i />현금 {totalAssets > 0 ? (me.cash / totalAssets * 100).toFixed(0) : 0}%</span></div>
          <ul className="pp-position-list">{heldStocks.map(stock => <li key={stock.id}><button onClick={() => setSearchParams({ stock: String(stock.id) })}><StockAvatar name={stock.name} order={stock.displayOrder} /><span><strong>{stock.name}</strong><small>{holdings[stock.id].toLocaleString()}주 보유</small></span><b>{(holdings[stock.id] * (priceForRound(stock.id, gameState.currentRound) ?? 0)).toLocaleString()}<small>원</small></b><ChevronRight /></button></li>)}</ul>
          {heldStocks.length === 0 && <p className="pp-portfolio-empty">보유 중인 주식이 없습니다.</p>}
          {lastRoundProfit !== null && <div className="pp-last-profit"><span>직전 라운드 수익</span><strong className={lastRoundProfit >= 0 ? 'positive' : 'negative'}>{lastRoundProfit > 0 ? '+' : ''}{lastRoundProfit.toLocaleString()}원</strong></div>}
          <button className="pp-leaderboard-link" onClick={() => navigate('/display')}><span className="pp-trophy-icon"><Trophy /></span><span><strong>지금 우리 팀 순위는?</strong><small>대회 순위 보기</small></span><ArrowUpRight /></button>
          <div className="pp-portfolio-foot"><img src="/unid-logo.webp" alt="" /><span>Uni-D 모의 투자 대회<br /><small>제작 정유현</small></span></div>
        </aside>
      </div>
    </div>
    {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
  </main>
}
