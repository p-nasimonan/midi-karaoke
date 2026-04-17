import { useState, useRef, useCallback, useEffect } from 'react'
import { detectPitchYIN, computeRMS } from '../utils/pitchDetectorFallback'
import { freqToMidi } from '../utils/pitchUtils'

const FFT_SIZE = 2048
const SILENCE_THRESHOLD = 0.01
const MIN_FREQ = 80
const MAX_FREQ = 1200
const STABILITY_FRAMES = 5    // pitch must be consistent for ≥5 consecutive frames (~83ms)
const STABILITY_SEMITONES = 3 // consecutive frames must be within ±3 semitones of each other

interface PitchState {
  frequency: number | null
  midiNote: number | null
}

interface UsePitchDetectionReturn {
  startMic: () => Promise<void>
  stopMic: () => void
  isMicActive: boolean
  frequency: number | null
  midiNote: number | null
  error: string | null
}

// Module-level WASM cache
let wasmDetect: ((samples: Float32Array, sampleRate: number, threshold: number) => number) | null = null
let wasmLoadAttempted = false

async function loadWasm() {
  if (wasmLoadAttempted) return
  wasmLoadAttempted = true
  try {
    const mod = await import('../wasm/pitch_detector.js')
    await mod.default?.()
    if (typeof mod.detect_pitch === 'function') {
      wasmDetect = mod.detect_pitch
    }
  } catch {
    // WASM unavailable — TypeScript fallback active
  }
}

export function usePitchDetection(): UsePitchDetectionReturn {
  const [isMicActive, setIsMicActive] = useState(false)
  const [pitchState, setPitchState] = useState<PitchState>({ frequency: null, midiNote: null })
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const bufferRef = useRef<Float32Array<ArrayBuffer> | null>(null)

  // Stability filter state (not React state — mutated in RAF loop)
  const stableCountRef = useRef(0)
  const lastRawMidiRef = useRef(-1)

  useEffect(() => { loadWasm() }, [])

  const detectLoop = useCallback(() => {
    const analyser = analyserRef.current
    const buffer = bufferRef.current
    if (!analyser || !buffer) return

    analyser.getFloatTimeDomainData(buffer)
    const sampleRate = audioCtxRef.current!.sampleRate
    const rms = computeRMS(buffer)

    if (rms < SILENCE_THRESHOLD) {
      stableCountRef.current = 0
      lastRawMidiRef.current = -1
      setPitchState({ frequency: null, midiNote: null })
    } else {
      const rawFreq = wasmDetect
        ? wasmDetect(buffer, sampleRate, 0.15)
        : detectPitchYIN(buffer, sampleRate, 0.15)

      if (rawFreq > MIN_FREQ && rawFreq < MAX_FREQ) {
        const rawMidi = freqToMidi(rawFreq)

        // Stability: count consecutive frames within ±STABILITY_SEMITONES
        if (lastRawMidiRef.current >= 0 && Math.abs(rawMidi - lastRawMidiRef.current) < STABILITY_SEMITONES) {
          stableCountRef.current++
        } else {
          stableCountRef.current = 0
        }
        lastRawMidiRef.current = rawMidi

        if (stableCountRef.current >= STABILITY_FRAMES) {
          setPitchState({ frequency: rawFreq, midiNote: Math.round(rawMidi) })
        }
      } else {
        stableCountRef.current = 0
        lastRawMidiRef.current = -1
        setPitchState({ frequency: null, midiNote: null })
      }
    }

    rafRef.current = requestAnimationFrame(detectLoop)
  }, [])

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      await ctx.resume()

      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      analyserRef.current = analyser
      bufferRef.current = new Float32Array(FFT_SIZE)

      setIsMicActive(true)
      setError(null)
      rafRef.current = requestAnimationFrame(detectLoop)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'マイクへのアクセスに失敗しました')
    }
  }, [detectLoop])

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
    bufferRef.current = null
    stableCountRef.current = 0
    lastRawMidiRef.current = -1
    setIsMicActive(false)
    setPitchState({ frequency: null, midiNote: null })
  }, [])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
  }, [])

  return {
    startMic, stopMic, isMicActive,
    frequency: pitchState.frequency,
    midiNote: pitchState.midiNote,
    error,
  }
}
