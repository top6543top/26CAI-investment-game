import { useEffect, useId, useRef, useState } from 'react'

interface PricePoint { round: number; yearLabel: number; price: number }
interface StockPriceChartProps { series: PricePoint[]; compact?: boolean }

export default function StockPriceChart({ series, compact = false }: StockPriceChartProps) {
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [chartWidth, setChartWidth] = useState(640)
  const containerRef = useRef<HTMLDivElement>(null)
  const clipId = useId()
  useEffect(() => {
    if (compact || !containerRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setChartWidth(Math.max(240, Math.round(entry.contentRect.width)))
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [compact])
  if (series.length === 0) return <div ref={containerRef} className="price-chart-empty">가격 정보가 없습니다.</div>

  const width = compact ? 100 : chartWidth
  const height = compact ? 32 : 240
  const left = compact ? 2 : 48
  const right = compact ? 3 : 14
  const top = compact ? 3 : 12
  const bottom = compact ? 3 : 12
  const min = Math.min(...series.map(point => point.price))
  const max = Math.max(...series.map(point => point.price))
  const padding = (max - min) * 0.15 || Math.max(max * 0.08, 1)
  const low = Math.max(0, min - padding)
  const high = max + padding
  const range = high - low || 1
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const points = series.map((point, index) => ({
    ...point,
    x: series.length === 1 ? left + plotWidth / 2 : left + index / (series.length - 1) * plotWidth,
    y: top + (high - point.price) / range * plotHeight,
  }))
  const last = points[points.length - 1]
  const selected = points.find(point => point.round === selectedRound) ?? last
  const color = last.price >= (points[points.length - 2]?.price ?? last.price) ? 'var(--pp-buy)' : 'var(--pp-loss)'
  const line = points.map((point, index) => (index === 0 ? 'M' : 'L') + point.x + ',' + point.y).join(' ')

  if (compact) return <svg viewBox="0 0 100 32" width="100%" height="32" aria-hidden="true"><path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /><circle cx={last.x} cy={last.y} r="2" fill={color} /></svg>

  return <div className="price-chart" ref={containerRef}>
    <div className="price-chart-readout" aria-live="polite"><span>{selected.yearLabel}년 · {selected.round}라운드</span><strong style={{ color }}>{selected.price.toLocaleString()}원</strong></div>
    <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="종목 가격 추이 차트" onPointerMove={event => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width * width
      const index = Math.max(0, Math.min(points.length - 1, Math.round((x - left) / plotWidth * (points.length - 1))))
      setSelectedRound(points[index].round)
    }} onPointerLeave={() => setSelectedRound(null)}>
      <defs><clipPath id={clipId}><rect x={left} y="0" width={plotWidth + 4} height={height} /></clipPath></defs>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
        const y = top + fraction * plotHeight
        const value = high - fraction * range
        return <g key={fraction}><line x1={left} y1={y} x2={width - right} y2={y} stroke="var(--pp-line)" strokeWidth="0.6" strokeDasharray="3 5" /><text x={left - 10} y={y + 4} fill="var(--pp-ink-dim)" textAnchor="end" fontSize="10">{value >= 10000 ? (value / 10000).toFixed(1) + '만' : Math.round(value).toLocaleString()}</text></g>
      })}
      <g clipPath={'url(#' + clipId + ')'}>
        <path d={line + ' L' + last.x + ',' + (height - bottom) + ' L' + points[0].x + ',' + (height - bottom) + ' Z'} fill={color} opacity="0.06" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </g>
      <line x1={selected.x} y1={top} x2={selected.x} y2={height - bottom} stroke={color} opacity="0.35" strokeDasharray="3 4" />
      {points.map(point => <circle key={point.round} cx={point.x} cy={point.y} r={point.round === selected.round ? 4.5 : 2.5} fill={point.round === selected.round ? color : 'var(--pp-bg)'} stroke={color} strokeWidth="1.5" />)}
    </svg>
    <div className="price-chart-years" role="group" aria-label="라운드별 주가">
      {points.map(point => <button key={point.round} type="button" aria-label={point.yearLabel + '년 주가 ' + point.price.toLocaleString() + '원'} aria-pressed={point.round === selected.round} onClick={() => setSelectedRound(point.round)} onFocus={() => setSelectedRound(point.round)}>{point.yearLabel}</button>)}
    </div>
  </div>
}
