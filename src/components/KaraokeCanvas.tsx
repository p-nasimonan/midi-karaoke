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
  }, [])

  // Update MIDI note range and page size when MIDI changes
  useEffect(() => {
    if (!parsed || !rendererRef.current) return
    const { min, max } = getNoteRange(parsed.notes)
    // Estimate a good page size: aim for about 6–8 notes per page
    // Use the median note duration as a guide, or default to 4 s
    const pageSeconds = computePageSeconds(parsed)
    rendererRef.current.setOptions({ minMidi: min, maxMidi: max, pageSeconds })
  }, [parsed])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}

// Pick a page length that shows roughly one musical phrase.
// Uses tempo to compute measure length, then picks 2 or 4 measures per page.
function computePageSeconds(parsed: ParsedMidi): number {
  if (parsed.tempos.length === 0) return 4
  const bpm = parsed.tempos[0].bpm
  const measureSeconds = (60 / bpm) * 4  // 4/4 time assumed
  // Show 2 measures per page (adjust to keep pages between 3–8 s)
  const twoBar = measureSeconds * 2
  if (twoBar >= 3 && twoBar <= 8) return twoBar
  if (twoBar < 3) return measureSeconds * 4
  return measureSeconds
}
