import { useState, useRef, useCallback, useEffect } from 'react'
import { PitchDetector } from 'pitchy'
import { freqToMidi } from '../utils/pitchUtils'

const FFT_SIZE = 2048
const MIN_FREQ = 80
const MAX_FREQ = 1200
// pitchy clarity: 0–1, 0.9+ = confident pitch, below = noise/silence
const CLARITY_THRESHOLD = 0.9
const STABILITY_FRAMES = 4
const STABILITY_SEMITONES = 3

interface UsePitchDetectionReturn {
  startMic: () => Promise<void>
  stopMic: () => void
  isMicActive: boolean
  frequency: number | null
  midiNote: number | null
  error: string | null
}

export function usePitchDetection(): UsePitchDetectionReturn {
  const [isMicActive, setIsMicActive] = useState(false)
  const [frequency, setFrequency] = useState<number | null>(null)
  const [midiNote, setMidiNote] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  // typed as number[] to avoid Float32Array<ArrayBufferLike> vs Float32Array<ArrayBuffer> mismatch
  const detectorRef = useRef<PitchDetector<number[]> | null>(null)
  const inputBufRef = useRef<number[]>([])

  const stableCountRef = useRef(0)
  const lastRawMidiRef = useRef(-1)

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

      const detector = PitchDetector.forNumberArray(FFT_SIZE)
      detector.minVolumeDecibels = -40
      detectorRef.current = detector
      inputBufRef.current = new Array<number>(detector.inputLength).fill(0)

      setIsMicActive(true)
      setError(null)

      const f32 = new Float32Array(FFT_SIZE)

      const loop = () => {
        const an = analyserRef.current
        const det = detectorRef.current
        if (!an || !det) return

        an.getFloatTimeDomainData(f32)
        for (let i = 0; i < f32.length; i++) inputBufRef.current[i] = f32[i]

        const sampleRate = audioCtxRef.current!.sampleRate
        const [rawFreq, clarity] = det.findPitch(inputBufRef.current, sampleRate)

        if (clarity >= CLARITY_THRESHOLD && rawFreq >= MIN_FREQ && rawFreq <= MAX_FREQ) {
          const rawMidi = freqToMidi(rawFreq)

          const octaveDist = Math.abs(rawMidi - lastRawMidiRef.current) % 12
          if (lastRawMidiRef.current >= 0 && octaveDist < STABILITY_SEMITONES) {
            stableCountRef.current++
          } else {
            stableCountRef.current = 0
          }
          lastRawMidiRef.current = rawMidi

          if (stableCountRef.current >= STABILITY_FRAMES) {
            setFrequency(rawFreq)
            setMidiNote(Math.round(rawMidi))
          }
        } else {
          stableCountRef.current = 0
          lastRawMidiRef.current = -1
          setFrequency(null)
          setMidiNote(null)
        }

        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'マイクへのアクセスに失敗しました')
    }
  }, [])

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    streamRef.current = null
    audioCtxRef.current = null
    analyserRef.current = null
    detectorRef.current = null
    stableCountRef.current = 0
    lastRawMidiRef.current = -1
    setIsMicActive(false)
    setFrequency(null)
    setMidiNote(null)
  }, [])

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
  }, [])

  return { startMic, stopMic, isMicActive, frequency, midiNote, error }
}
