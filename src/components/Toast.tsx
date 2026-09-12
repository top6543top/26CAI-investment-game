import { useEffect } from 'react'
import { CircleCheck, X } from 'lucide-react'
import './Toast.css'

interface ToastProps {
  message: string
  onDismiss: () => void
  durationMs?: number
}

export default function Toast({ message, onDismiss, durationMs = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
  }, [message, onDismiss, durationMs])

  return (
    <div className="toast" role="status">
      <CircleCheck className="toast-check" />
      <span>{message}</span>
      <button onClick={onDismiss} aria-label="알림 닫기" title="알림 닫기"><X /></button>
    </div>
  )
}
