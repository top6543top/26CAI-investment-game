import type { CSSProperties } from 'react'
import { logoForStock } from '../lib/stockLogos'

const COLORS = ['#9ecce9', '#efbd83', '#e8a6c6', '#acd5a0', '#b4b3ed', '#e1c57f', '#91d1ce', '#bcc5ce']

export default function StockAvatar({ name, order, large = false }: { name: string; order: number; large?: boolean }) {
  const className = `stock-avatar${large ? ' large' : ''}`
  const logo = logoForStock(name)
  if (logo) return <img className={className} src={logo} alt="" draggable={false} />
  return <span className={className} aria-hidden="true" style={{ '--stock-color': COLORS[(Math.max(1, order) - 1) % COLORS.length] } as CSSProperties}>{name.slice(0, 2)}</span>
}
