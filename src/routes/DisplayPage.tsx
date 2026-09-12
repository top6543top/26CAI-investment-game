import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChartNoAxesCombined, CircleAlert, Flag, LoaderCircle, Pause, Radio, RotateCcw, Trophy, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import { useLeaderboard } from '../hooks/useLeaderboard'
import BrandBar from '../components/BrandBar'
import AssetHistoryChart from '../components/AssetHistoryChart'
import type { AssetHistoryEntry } from '../lib/types'
import './DisplayPage.css'

const SERIES_COLORS = ['#d3f879', '#80c9f5', '#ff9fbc', '#76dbb0', '#c5aff4', '#f3f5f6', '#76dadd', '#ffb18b']

export default function DisplayPage() {
  const navigate = useNavigate()
  const { gameState, loading } = useGameState()
  const entries = useLeaderboard(gameState?.currentRound ?? null)
  const [rounds, setRounds] = useState<{ round: number; yearLabel: number }[]>([])
  const [history, setHistory] = useState<AssetHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [myNickname, setMyNickname] = useState<string | null>(null)

  useEffect(() => {
    document.title = '순위 | Uni-D 투자 대회'
  }, [])

  useEffect(() => {
    let active = true
    supabase
      .from('rounds')
      .select('round, year_label')
      .order('round')
      .then(({ data }) => {
        if (active) setRounds((data ?? []).map((r) => ({ round: r.round, yearLabel: r.year_label })))
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setHistoryLoading(true)
      setHistoryError(false)
      try {
        const { data, error } = await supabase
          .from('asset_history')
          .select('round, year_label, participant_id, nickname, total_assets, round_profit')
          .order('round')
        if (!active) return
        setHistoryError(Boolean(error))
        setHistory((data ?? []).map((d) => ({
          round: d.round,
          yearLabel: d.year_label,
          participantId: d.participant_id,
          nickname: d.nickname,
          totalAssets: d.total_assets,
          roundProfit: d.round_profit,
        })))
      } catch {
        if (active) { setHistoryError(true); setHistory([]) }
      } finally {
        if (active) setHistoryLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [gameState?.currentRound, historyRefresh])

  useEffect(() => {
    let active = true
    async function resolveParticipant() {
      try {
        const savedId = sessionStorage.getItem('cai-participant-id')
        if (!savedId) return
        const { data } = await supabase.from('participants').select('nickname').eq('id', savedId).maybeSingle()
        if (active) setMyNickname(data?.nickname ?? null)
      } catch {
        if (active) setMyNickname(null)
      }
    }
    resolveParticipant()
    return () => { active = false }
  }, [gameState?.currentRound])

  const series = useMemo(() => {
    const byNickname = new Map<string, { round: number; yearLabel: number; totalAssets: number }[]>()
    for (const h of history) {
      if (!byNickname.has(h.nickname)) byNickname.set(h.nickname, [])
      byNickname.get(h.nickname)!.push({ round: h.round, yearLabel: h.yearLabel, totalAssets: h.totalAssets })
    }
    return Array.from(byNickname.entries()).map(([nickname, points], i) => ({
      nickname,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
      points: [...points].sort((a, b) => a.round - b.round),
    }))
  }, [history])

  if (loading || !gameState) {
    return (
      <main className="disp-page">
        <BrandBar />
        <div className="disp-loading" role={loading ? 'status' : 'alert'}>
          {loading ? <LoaderCircle className="disp-spin" size={24} aria-hidden="true" /> : <CircleAlert size={24} aria-hidden="true" />}
          <p>{loading ? '대회 순위를 불러오는 중입니다.' : '대회 정보를 불러오지 못했습니다.'}</p>
          {!loading && <button className="disp-back" onClick={() => window.location.reload()}><RotateCcw size={16} aria-hidden="true" />다시 불러오기</button>}
        </div>
      </main>
    )
  }

  const isWaiting = gameState.currentRound === 0
  const isEnded = gameState.currentRound === 12
  const yearLabel = rounds.find((r) => r.round === (isEnded ? 11 : gameState.currentRound))?.yearLabel
  const StatusIcon = isEnded ? Flag : isWaiting ? Users : gameState.isPaused ? Pause : Radio
  const myRank = entries.findIndex((entry) => entry.nickname === myNickname)

  return (
    <main className="disp-page">
      <BrandBar />
      <div className="disp-body">
        <div className="disp-toolbar">
          {!isEnded && <button className="disp-back" onClick={() => navigate('/')}>
            <ArrowLeft size={16} aria-hidden="true" />투자 화면
          </button>}
          <span className={`disp-state ${gameState.isPaused && !isWaiting && !isEnded ? 'is-paused' : ''}`}>
            <StatusIcon size={15} aria-hidden="true" />
            {isWaiting ? '대회 시작 대기' : isEnded ? '대회 종료' : gameState.isPaused ? '거래 일시정지' : '거래 진행 중'}
          </span>
        </div>

        <header className="disp-heading">
          <div>
            <p className="disp-kicker">Uni-D 투자 대회</p>
            <h1>{isWaiting ? '대회 시작 대기' : isEnded ? '최종 순위' : '실시간 순위'}</h1>
          </div>
          <div className="disp-round">
            <span>{isWaiting ? '대기 중' : isEnded ? '11라운드 완료' : `ROUND ${String(gameState.currentRound).padStart(2, '0')} / 11`}</span>
            {yearLabel !== undefined && <strong>{yearLabel}<small>년</small></strong>}
          </div>
        </header>

        {entries.length > 0 && (
          <div className="disp-summary">
            <span><Users size={16} aria-hidden="true" />참가 <strong>{entries.length}팀</strong></span>
            {!isWaiting && <span><Trophy size={16} aria-hidden="true" />{isEnded ? '최종 1위' : '현재 1위'} <strong>{entries[0].nickname}</strong></span>}
            {!isWaiting && myRank >= 0 && <span className="disp-my-summary">내 팀 <strong>{myRank + 1}위</strong></span>}
          </div>
        )}

        {!isWaiting && entries.length > 0 && (
          <ol className="disp-podium" aria-label={isEnded ? '최종 상위 세 팀' : '현재 상위 세 팀'}>
            {entries.slice(0, 3).map((entry, i) => (
              <li key={entry.nickname} className={`disp-podium-team disp-podium-place-${i + 1}`}>
                <div className="disp-podium-position">
                  {i === 0 && <Trophy size={22} aria-hidden="true" />}
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <small>{i === 0 ? isEnded ? '최종 1위' : '현재 1위' : `${i + 1}위`}</small>
                </div>
                <h2>{entry.nickname}{entry.nickname === myNickname && <span className="disp-me">내 팀</span>}</h2>
                <p>{entry.totalAssets.toLocaleString()}<span>원</span></p>
              </li>
            ))}
          </ol>
        )}

        <div className="disp-results">
          <section className="disp-ranking" aria-labelledby="disp-ranking-title">
            <div className="disp-section-heading">
              <h2 id="disp-ranking-title">{isWaiting ? '참가 팀' : '전체 순위'}</h2>
              {entries.length > 0 && <span>총자산 기준</span>}
            </div>
            {entries.length > 0 ? (
              <table className="disp-rank-table">
                <thead>
                  <tr><th scope="col">{isWaiting ? '번호' : '순위'}</th><th scope="col">팀</th><th scope="col">총자산</th></tr>
                </thead>
                <tbody>
                  {entries.map((entry, i) => (
                    <tr key={entry.nickname} className={entry.nickname === myNickname ? 'disp-rank-me' : undefined}>
                      <td className={`disp-rank-number ${i === 0 && !isWaiting ? 'disp-rank-first' : ''}`}>{String(i + 1).padStart(2, '0')}</td>
                      <th scope="row"><span className="disp-rank-name">{entry.nickname}</span>{entry.nickname === myNickname && <span className="disp-me">내 팀</span>}</th>
                      <td className="disp-rank-amount">{entry.totalAssets.toLocaleString()}<span>원</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="disp-empty">
                <Users size={28} aria-hidden="true" />
                <p>아직 참가한 팀이 없습니다.</p>
              </div>
            )}
          </section>

          <section className="disp-chart-section" aria-labelledby="disp-chart-title">
            <div className="disp-section-heading">
              <h2 id="disp-chart-title"><ChartNoAxesCombined size={18} aria-hidden="true" />자산 레이스</h2>
              {history.length > 0 && !historyLoading && !historyError && <span>라운드별 총자산</span>}
            </div>
            {historyLoading ? (
              <div className="disp-empty" role="status"><LoaderCircle className="disp-spin" size={24} aria-hidden="true" /><p>자산 기록을 불러오는 중입니다.</p></div>
            ) : historyError ? (
              <div className="disp-empty" role="alert">
                <CircleAlert size={26} aria-hidden="true" /><p>자산 기록을 불러오지 못했습니다.</p>
                <button className="disp-back" onClick={() => setHistoryRefresh((value) => value + 1)}><RotateCcw size={16} aria-hidden="true" />다시 불러오기</button>
              </div>
            ) : <AssetHistoryChart series={series} />}
          </section>
        </div>
      </div>
    </main>
  )
}
