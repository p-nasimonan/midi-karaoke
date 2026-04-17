import { useRef, useEffect, useLayoutEffect } from 'react'
import { KaraokeRenderer } from '../canvas/renderer'
import { getNoteRange } from '../utils/midiUtils'
import type { RendererState } from '../canvas/types'
import type { ParsedMidi } from '../utils/midiUtils'

interface KaraokeCanvasProps {
  parsed: ParsedMidi | null
  currentTime: number
  userFrequency: number | null
  isPlaying: boolean
  scorePercent: number
}

export function KaraokeCanvas({
  parsed, currentTime, userFrequency, isPlaying, scorePercent,
}: KaraokeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<KaraokeRenderer | null>(null)
  const rafRef = useRef<number>(0)

  // Keep latest render state in a ref so the RAF loop always reads fresh values
  // without needing to restart the loop on every prop change.
  const stateRef = useRef<RendererState>({
    currentTime, notes: parsed?.notes ?? [], lyrics: parsed?.lyrics ?? [],
    userFrequency, isPlaying, scorePercent,
  })
  useLayoutEffect(() => {
    stateRef.current = {
      currentTime,
      notes: parsed?.notes ?? [],
      lyrics: parsed?.lyrics ?? [],
      userFrequency,
      isPlaying,
      scorePercent,
    }
  })

  // Init renderer and RAF loop once
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      if (canvas.width !== r.width || canvas.height !== r.height) {
        canvas.width = r.width
        canvas.height = r.height
      }
    }

    resize()
    rendererRef.current = new KaraokeRenderer(canvas)

    const loop = () => {
      resize()
      rendererRef.current?.render(stateRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
    }
  }, [])  // intentionally empty — loop reads stateRef which is always current

  // Update note range when MIDI changes
  useEffect(() => {
    if (!parsed || !rendererRef.current) return
    const { min, max } = getNoteRange(parsed.notes)
    rendererRef.current.setOptions({ minMidi: min, maxMidi: max })
  }, [parsed])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
