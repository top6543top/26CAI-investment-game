export default function BrandBar() {
  return (
    <div className="pp-brandbar">
      <img className="pp-mark" src="/unid-logo.webp" alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} />
      <span className="pp-word">
        Uni-D <b>거래소</b>
      </span>
    </div>
  )
}
