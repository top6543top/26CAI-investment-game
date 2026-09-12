import { useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleAlert, CircleCheck, Flag, LoaderCircle, Pause, Play, RotateCcw, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useGameState } from '../hooks/useGameState'
import BrandBar from '../components/BrandBar'
import './HostPage.css'

export default function HostPage() {
  const { gameState, loading } = useGameState()
  const [pending, setPending] = useState<string | null>(null)
  const requestInFlight = useRef(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    document.title = '진행자 | Uni-D 투자 대회'
  }, [])

  async function callHostRpc(
    confirmMessage: string,
    fn: string,
    successMessage: string,
    extraArgs: Record<string, unknown> = {},
  ) {
    if (requestInFlight.current || loading || !gameState) return
    if (!window.confirm(confirmMessage)) return
    requestInFlight.current = true
    setPending(fn)
    setMessage(null)
    try {
      const { error } = await supabase.rpc(fn, extraArgs)
      setMessage(error ? { text: error.message, ok: false } : { text: successMessage, ok: true })
    } catch {
      setMessage({ text: '요청 결과를 확인하지 못했습니다. 현재 라운드를 확인한 뒤 다시 시도해 주세요.', ok: false })
    } finally {
      requestInFlight.current = false
      setPending(null)
    }
  }

  if (loading || !gameState) {
    return (
      <main className="host-page">
        <BrandBar />
        <div className="host-loading" role={loading ? 'status' : 'alert'}>
          {loading ? <LoaderCircle className="host-spin" size={24} aria-hidden="true" /> : <CircleAlert size={24} aria-hidden="true" />}
          <p>{loading ? '대회 정보를 불러오는 중입니다.' : '대회 정보를 불러오지 못했습니다.'}</p>
          {!loading && <button className="host-btn host-btn-secondary" onClick={() => window.location.reload()}><RotateCcw size={16} aria-hidden="true" />다시 불러오기</button>}
        </div>
      </main>
    )
  }

  const round = gameState.currentRound
  const isWaiting = round === 0
  const isEnded = round === 12
  const isActive = round >= 1 && round <= 11
  const controlsDisabled = pending !== null
  const statusText = isWaiting ? '시작 대기' : isEnded ? '대회 종료' : gameState.isPaused ? '거래 일시정지' : '거래 진행 중'
  const StatusIcon = isEnded ? Flag : isWaiting ? Play : gameState.isPaused ? Pause : CircleCheck
  const action = isWaiting
    ? { fn: 'host_start_game', label: '게임 시작', confirm: '게임을 시작할까요? (1라운드부터 거래가 열립니다)', success: '게임을 시작했습니다. 1라운드 거래가 열립니다.' }
    : round === 11
      ? { fn: 'host_end_game', label: '게임 종료 · 최종 청산', confirm: '게임을 종료할까요? 남은 보유 주식이 최종 청산됩니다.', success: '최종 청산을 완료했습니다. 대회가 종료되었습니다.' }
      : { fn: 'host_next_year', label: `${round + 1}라운드로 진행`, confirm: '다음 해로 넘어갈까요? 보유 주식이 새 가격에 자동 매도됩니다.', success: `${round + 1}라운드로 진행했습니다. 보유 주식을 새 가격에 자동 매도했습니다.` }

  return (
    <main className="host-page">
      <BrandBar />
      <div className="host-body">
        <header className="host-heading">
          <div>
            <p className="host-kicker"><ShieldCheck size={16} aria-hidden="true" />대회 운영</p>
            <h1>진행자 콘솔</h1>
          </div>
          <span className={`host-status-label ${isActive && !gameState.isPaused ? 'host-status-open' : isWaiting || isEnded ? '' : 'host-status-paused'}`}>
            <StatusIcon size={16} aria-hidden="true" />{statusText}
          </span>
        </header>

        <section className="host-round-section" aria-labelledby="host-round-title">
          <div className="host-round-top">
            <div>
              <p className="host-section-label" id="host-round-title">현재 라운드</p>
              <div className="host-round-number">
                {isWaiting ? <strong>대기</strong> : isEnded ? <strong>FINISH</strong> : <><strong>{String(round).padStart(2, '0')}</strong><span>/ 11</span></>}
              </div>
            </div>
            <p className="host-round-caption">{isWaiting ? '11라운드의 투자 대회' : isEnded ? '11개 라운드 완료' : round === 11 ? '마지막 투자 라운드' : `남은 라운드 ${11 - round}`}</p>
          </div>
          <ol className="host-round-track" aria-label="전체 11라운드 진행 상황">
            {Array.from({ length: 11 }, (_, i) => i + 1).map((item) => (
              <li key={item} className={item < round ? 'is-complete' : item === round ? 'is-current' : ''} aria-current={item === round ? 'step' : undefined}>
                <span>{String(item).padStart(2, '0')}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="host-console">
          <div className="host-operations" aria-busy={pending !== null}>
            <section className="host-action-section" aria-labelledby="host-action-title">
              <h2 id="host-action-title">{isWaiting ? '대회 시작' : isEnded ? '대회 종료' : '라운드 진행'}</h2>
              <p className="host-operation-note">
                {isWaiting ? '1라운드부터 참가자의 주식 거래가 열립니다.' : isEnded ? '보유 주식의 최종 청산이 완료되었습니다.' : round === 11 ? '남은 보유 주식을 최종 청산하고 순위를 확정합니다.' : '다음 해의 새 가격으로 보유 주식이 자동 매도됩니다.'}
              </p>
              {!isEnded && (
                <button
                  className="host-btn host-btn-primary"
                  onClick={() => callHostRpc(action.confirm, action.fn, action.success)}
                  disabled={controlsDisabled || (!isWaiting && !isActive)}
                >
                  {pending === action.fn ? <LoaderCircle className="host-spin" size={20} aria-hidden="true" /> : isWaiting ? <Play size={20} aria-hidden="true" /> : round === 11 ? <Flag size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
                  {pending === action.fn ? '처리 중...' : action.label}
                </button>
              )}
            </section>

            <section className="host-pause-section" aria-labelledby="host-pause-title">
              <div>
                <h2 id="host-pause-title">거래 제어</h2>
                <p className="host-operation-note">{isActive ? gameState.isPaused ? '참가자의 거래가 잠시 멈춰 있습니다.' : '현재 라운드의 거래를 일시정지합니다.' : '진행 중인 라운드가 없습니다.'}</p>
              </div>
              <button
                className={`host-btn host-btn-secondary ${gameState.isPaused && isActive ? 'host-btn-resume' : ''}`}
                onClick={() => callHostRpc(
                  gameState.isPaused ? '거래를 재개할까요?' : '거래를 일시정지할까요?',
                  'host_toggle_pause',
                  gameState.isPaused ? '거래를 재개했습니다.' : '거래를 일시정지했습니다.',
                  { p_paused: !gameState.isPaused },
                )}
                disabled={controlsDisabled || !isActive}
              >
                {pending === 'host_toggle_pause' ? <LoaderCircle className="host-spin" size={18} aria-hidden="true" /> : gameState.isPaused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
                {pending === 'host_toggle_pause' ? '처리 중...' : gameState.isPaused ? '거래 재개' : '거래 일시정지'}
              </button>
            </section>

            {message && (
              <p className={`host-message ${message.ok ? 'host-message-ok' : 'host-message-error'}`} role={message.ok ? 'status' : 'alert'}>
                {message.ok ? <CircleCheck size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
                <span>{message.text}</span>
              </p>
            )}
          </div>
        </div>

        <section className="host-danger" aria-labelledby="host-reset-title">
          <div>
            <h2 id="host-reset-title">대회 초기화</h2>
            <p>모든 참가자와 투자 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
          </div>
          <button
            className="host-btn host-btn-danger"
            onClick={() => callHostRpc(
              '정말 새 게임을 시작할까요? 모든 참가자와 기록이 완전히 삭제됩니다. 되돌릴 수 없습니다.',
              'host_reset_game',
              '참가자와 투자 기록을 초기화했습니다. 새 대회 시작 대기 상태입니다.',
            )}
            disabled={controlsDisabled}
          >
            {pending === 'host_reset_game' ? <LoaderCircle className="host-spin" size={17} aria-hidden="true" /> : <RotateCcw size={17} aria-hidden="true" />}
            {pending === 'host_reset_game' ? '초기화 중...' : '전체 초기화'}
          </button>
        </section>
      </div>
    </main>
  )
}
