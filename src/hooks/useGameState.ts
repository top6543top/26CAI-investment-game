import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { GameState } from '../lib/types'

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    async function load() {
      const { data, error } = await supabase
        .from('game_state')
        .select('current_round, is_paused')
        .eq('id', 1)
        .single()

      if (!active) return
      if (error) {
        setError('게임에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        setLoading(false)
        return
      }
      setGameState({ currentRound: data.current_round, isPaused: data.is_paused })
      setLoading(false)
    }

    load().catch(() => {
      if (!active) return
      setError('게임에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setLoading(false)
    })

    const channel = supabase
      .channel('game_state_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state' },
        (payload) => {
          const row = payload.new as { current_round: number; is_paused: boolean }
          setError(null)
          setGameState({ currentRound: row.current_round, isPaused: row.is_paused })
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [attempt])

  return { gameState, loading, error, retry: () => setAttempt((value) => value + 1) }
}
