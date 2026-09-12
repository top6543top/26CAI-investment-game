import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { ChartNoAxesCombined, Trophy } from 'lucide-react'

export default function BrandBar({ children }: { children?: ReactNode }) {
  return (
    <header className="pp-brandbar">
      <div className="pp-brandbar-inner">
        <NavLink to="/" className="pp-brand" aria-label="Uni-D 거래소 홈">
          <img className="pp-mark" src="/unid-logo.webp" alt="" draggable={false} />
          <span className="pp-word">Uni-D <b>거래소</b></span>
        </NavLink>
        <nav className="pp-nav" aria-label="주 메뉴">
          <NavLink to="/" end><ChartNoAxesCombined />거래소</NavLink>
          <NavLink to="/display"><Trophy />순위 보기</NavLink>
        </nav>
        <div className="pp-brandbar-end">{children ?? <span className="pp-event-label">모의 투자 대회</span>}</div>
      </div>
    </header>
  )
}
