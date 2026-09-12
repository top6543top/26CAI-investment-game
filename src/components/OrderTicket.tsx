import { ArrowUpRight, CircleAlert, LoaderCircle, LockKeyhole } from 'lucide-react'
import QuantityStepper from './QuantityStepper'

interface OrderTicketProps {
  price: number | undefined
  quantity: number
  cash: number
  paused: boolean
  delisted: boolean
  pending: boolean
  onChange: (next: number) => void
  onBuy: () => void
}

export default function OrderTicket({ price, quantity, cash, paused, delisted, pending, onChange, onBuy }: OrderTicketProps) {
  const affordable = price && price > 0 ? Math.max(0, Math.floor(cash / price)) : 0
  const cost = (price ?? 0) * quantity
  const unavailable = price === undefined || price <= 0
  const insufficient = !unavailable && cost > cash
  const disabled = paused || delisted || pending || unavailable || insufficient || affordable < 1
  const reason = delisted ? '상장폐지된 종목입니다.' : paused ? '거래가 일시정지되었습니다.' : unavailable ? '현재 가격을 확인하고 있습니다.' : insufficient ? '매수할 수 있는 잔액이 부족합니다.' : null

  return (
    <form className="order-ticket" onSubmit={(event) => { event.preventDefault(); if (!disabled) onBuy() }} aria-label="매수 주문">
      <div className="order-quantity">
        <div className="order-label"><span>매수 수량</span><span>최대 {affordable.toLocaleString()}주</span></div>
        <QuantityStepper value={quantity} max={affordable} disabled={paused || delisted || pending || unavailable} onChange={onChange} />
      </div>
      <dl className="order-summary">
        <div><dt>주문 금액</dt><dd>{unavailable ? '-' : cost.toLocaleString()}<small> 원</small></dd></div>
        <div><dt>매수 후 잔액</dt><dd className={insufficient ? 'negative' : ''}>{unavailable || insufficient ? '-' : (cash - cost).toLocaleString()}<small> 원</small></dd></div>
      </dl>
      <button className="primary-button order-submit" type="submit" disabled={disabled}>
        {pending ? <LoaderCircle className="spin" /> : paused || delisted ? <LockKeyhole /> : <ArrowUpRight />}
        {pending ? '매수 중' : delisted ? '거래 불가' : paused ? '거래 일시정지' : insufficient ? '잔액 부족' : '매수'}
      </button>
      {reason && <p className="order-reason" role="status"><CircleAlert />{reason}</p>}
    </form>
  )
}
