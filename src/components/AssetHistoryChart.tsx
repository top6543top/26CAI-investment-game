import { useEffect, useId, useRef, useState } from 'react'
import { ChartNoAxesCombined } from 'lucide-react'

interface SeriesPoint {
  round: number
  yearLabel: number
  totalAssets: number
}

interface Series {
  nickname: string
  color: string
  points: SeriesPoint[]
}

interface AssetHistoryChartProps {
  series: Series[]
}

const HEIGHT = 280
const PAD_LEFT = 62
const PAD_RIGHT = 20
const PAD_TOP = 20
const PAD_BOTTOM = 38

function formatAxis(value: number) {
  if (Math.abs(value) >= 100000000) return `${Number((value / 100000000).toFixed(1))}억`
  if (Math.abs(value) >= 10000) return `${Number((value / 10000).toFixed(1))}만`
  return Math.round(value).toLocaleString()
}

export default function AssetHistoryChart({ series }: AssetHistoryChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [width, setWidth] = useState(680)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.max(240, Math.round(entry.contentRect.width)))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const allPoints = series.flatMap((s) => s.points)
  const rounds = Array.from(new Set(allPoints.map((p) => p.round))).sort((a, b) => a - b)
  const values = allPoints.map((p) => p.totalAssets)
  const minValue = Math.min(0, ...values)
  const maxValue = Math.max(1, ...values) * 1.08
  const range = maxValue - minValue
  const plotW = width - PAD_LEFT - PAD_RIGHT
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM
  const stepX = rounds.length > 1 ? plotW / (rounds.length - 1) : 0
  const tickStep = Math.max(1, Math.ceil(rounds.length / Math.max(2, Math.floor(plotW / 58))))
  const labelRounds = rounds.filter((_, i) => i % tickStep === 0 && i < rounds.length - 1)
  if (rounds.length > 0) {
    const lastRound = rounds[rounds.length - 1]
    if (labelRounds.length > 0 && rounds.indexOf(lastRound) - rounds.indexOf(labelRounds[labelRounds.length - 1]) < tickStep) labelRounds.pop()
    labelRounds.push(lastRound)
  }

  function xFor(round: number) {
    return rounds.length === 1 ? PAD_LEFT + plotW / 2 : PAD_LEFT + rounds.indexOf(round) * stepX
  }

  function yFor(value: number) {
    return PAD_TOP + (1 - (value - minValue) / range) * plotH
  }

  return (
    <div ref={containerRef} style={{ minWidth: 0 }}>
      {allPoints.length === 0 ? (
        <div style={{ minHeight: HEIGHT, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--pp-ink-dim)', textAlign: 'center', padding: 20, boxSizing: 'border-box', borderTop: '1px solid var(--pp-line)' }}>
          <ChartNoAxesCombined size={28} aria-hidden="true" />
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>아직 저장된 자산 기록이 없습니다.</p>
        </div>
      ) : (
        <>
          <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} role="img" aria-labelledby={titleId} style={{ display: 'block', overflow: 'visible', fontVariantNumeric: 'tabular-nums' }}>
            <title id={titleId}>팀별 라운드 총자산 추이, 단위 원</title>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const y = PAD_TOP + fraction * plotH
              return (
                <g key={fraction}>
                  <line x1={PAD_LEFT} y1={y} x2={width - PAD_RIGHT} y2={y} stroke="var(--pp-line)" strokeWidth={1} strokeDasharray={fraction === 1 ? undefined : '3 5'} />
                  <text x={PAD_LEFT - 10} y={y + 4} textAnchor="end" fontSize={11} fill="var(--pp-ink-dim)">{formatAxis(maxValue - fraction * range)}</text>
                </g>
              )
            })}
            {labelRounds.map((round) => (
              <text key={round} x={xFor(round)} y={HEIGHT - 12} textAnchor="middle" fontSize={11} fill="var(--pp-ink-dim)">
                {allPoints.find((point) => point.round === round)?.yearLabel ?? round}
              </text>
            ))}
            {series.map((s, seriesIndex) => {
              const linePath = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.round)},${yFor(p.totalAssets)}`).join(' ')
              return (
                <g key={s.nickname}>
                  <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={seriesIndex >= 8 ? '6 4' : undefined} vectorEffect="non-scaling-stroke" />
                  {s.points.map((p) => (
                    <circle key={p.round} cx={xFor(p.round)} cy={yFor(p.totalAssets)} r={s.points.length === 1 ? 4.5 : 3} fill={s.color} stroke="var(--pp-bg)" strokeWidth={1.5}>
                      <title>{s.nickname} · {p.yearLabel}년 · {p.totalAssets.toLocaleString()}원</title>
                    </circle>
                  ))}
                </g>
              )
            })}
          </svg>
          <ul aria-label="팀별 그래프 범례" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 18px', padding: '16px 0 0', margin: 0, listStyle: 'none', borderTop: '1px solid var(--pp-line)' }}>
            {series.map((s, i) => (
              <li key={s.nickname} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, maxWidth: '100%', fontSize: 12, lineHeight: 1.5, color: 'var(--pp-ink-dim)' }}>
                <span aria-hidden="true" style={{ width: 18, flexShrink: 0, borderTop: `3px ${i >= 8 ? 'dashed' : 'solid'} ${s.color}` }} />
                <span style={{ overflowWrap: 'anywhere' }}>{s.nickname}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
