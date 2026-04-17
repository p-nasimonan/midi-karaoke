import { useState, useRef, useCallback, useEffect } from 'react'
import * as Tone from 'tone'
import { Midi } from '@tonejs/midi'
import { parseMidi, type ParsedMidi } from '../utils/midiUtils'

// ── LocalStorage persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'midi-karaoke:last-file'

function saveToStorage(name: string, buffer: ArrayBuffer) {
  try {
    const bytes = new Uint8Array(buffer)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, data: btoa(bin) }))
  } catch { /* quota exceeded — ignore */ }
}

function loadFromStorage(): { name: string; buffer: ArrayBuffer } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const { name, data } = JSON.parse(raw) as { name: string; data: string }
    const bin = atob(data)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    return { name, buffer: buf.buffer }
  } catch { return null }
}

// ── GM instrument → Tone.js synth options ────────────────────────────────────
type OscType = 'triangle' | 'triangle8' | 'triangle4' | 'sine' | 'square' | 'square2' | 'square4' | 'sawtooth' | 'sawtooth2'

interface SynthCfg {
  osc: OscType
  attack: number
  decay: number
  sustain: number
  release: number
  vol: number   // dB relative to master
}

function gmConfig(program: number, isDrum: boolean): SynthCfg {
  if (isDrum) return { osc: 'square', attack: 0.001, decay: 0.08, sustain: 0, release: 0.05, vol: 0 }
  if (program < 8)   return { osc: 'triangle8',  attack: 0.005, decay: 0.5,  sustain: 0.1,  release: 1.5, vol: 2  } // Piano
  if (program < 16)  return { osc: 'sine',        attack: 0.001, decay: 0.8,  sustain: 0.01, release: 0.4, vol: 0  } // Chromatic Perc
  if (program < 24)  return { osc: 'square4',     attack: 0.01,  decay: 0.01, sustain: 1,    release: 0.2, vol: -4 } // Organ
  if (program < 32)  return { osc: 'sawtooth2',   attack: 0.001, decay: 0.35, sustain: 0.05, release: 0.5, vol: 0  } // Guitar
  if (program < 40)  return { osc: 'triangle',    attack: 0.01,  decay: 0.2,  sustain: 0.4,  release: 0.4, vol: 4  } // Bass (loud)
  if (program < 48)  return { osc: 'sawtooth',    attack: 0.08,  decay: 0.1,  sustain: 0.9,  release: 0.4, vol: -2 } // Strings
  if (program < 56)  return { osc: 'sawtooth2',   attack: 0.05,  decay: 0.1,  sustain: 0.8,  release: 0.3, vol: -4 } // Ensemble
  if (program < 64)  return { osc: 'sawtooth',    attack: 0.03,  decay: 0.1,  sustain: 0.8,  release: 0.2, vol: 0  } // Brass
  if (program < 72)  return { osc: 'square2',     attack: 0.02,  decay: 0.1,  sustain: 0.75, release: 0.2, vol: -2 } // Reed
  if (program < 80)  return { osc: 'sine',        attack: 0.04,  decay: 0.1,  sustain: 0.8,  release: 0.3, vol: -4 } // Pipe
  if (program < 88)  return { osc: 'sawtooth',    attack: 0.01,  decay: 0.1,  sustain: 0.7,  release: 0.3, vol: -2 } // Synth Lead
  if (program < 96)  return { osc: 'triangle4',   attack: 0.15,  decay: 0.1,  sustain: 0.8,  release: 0.8, vol: -6 } // Synth Pad
  return                    { osc: 'triangle',    attack: 0.02,  decay: 0.1,  sustain: 0.5,  release: 0.5, vol: -4 }
}

function buildSynth(program: number, isDrum: boolean): Tone.PolySynth {
  const cfg = gmConfig(program, isDrum)
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: cfg.osc },
    envelope: { attack: cfg.attack, decay: cfg.decay, sustain: cfg.sustain, release: cfg.release },
  })
  synth.volume.value = cfg.vol
  return synth.toDestination()
}

// ── Hook ──────────────────────────────────────────────────────────────────────
interface UseMidiReturn {
  loadMidi: (file: File) => Promise<void>
  play: () => Promise<void>
  stop: () => void
  isPlaying: boolean
  currentTime: number
  parsed: ParsedMidi | null
  fileName: string | null
  error: string | null
  volume: number
  setVolume: (v: number) => void
}

export function useMidi(): UseMidiReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [parsed, setParsed] = useState<ParsedMidi | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [volume, setVolumeState] = useState(100)

  const rawMidiRef = useRef<Midi | null>(null)
  const synthsRef = useRef<Tone.PolySynth[]>([])
  const partsRef = useRef<Tone.Part[]>([])
  const rafRef = useRef<number>(0)

  // Volume: 0%→-40dB, 100%→+4dB (allows slight boost)
  const setVolume = useCallback((v: number) => {
    setVolumeState(v)
    Tone.getDestination().volume.value = v === 0 ? -60 : (v / 100) * 44 - 40 + 4
  }, [])

  // Apply initial volume
  useEffect(() => {
    Tone.getDestination().volume.value = 4  // +4 dB at 100%
  }, [])

  const clearParts = useCallback(() => {
    for (const p of partsRef.current) { try { p.stop(0); p.dispose() } catch { /* already disposed */ } }
    partsRef.current = []
    for (const s of synthsRef.current) { try { s.releaseAll(); s.dispose() } catch { /* already disposed */ } }
    synthsRef.current = []
  }, [])

  const applyMidi = useCallback((midi: Midi, name: string) => {
    const data = parseMidi(midi)
    rawMidiRef.current = midi
    setParsed(data)
    setFileName(name)
    setCurrentTime(0)
    Tone.getTransport().stop()
    Tone.getTransport().cancel(0)
    clearParts()
    setIsPlaying(false)
  }, [clearParts])

  const loadMidi = useCallback(async (file: File) => {
    try {
      setError(null)
      const buffer = await file.arrayBuffer()
      saveToStorage(file.name, buffer)
      applyMidi(new Midi(buffer), file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MIDIファイルの解析に失敗しました')
    }
  }, [applyMidi])

  // Restore last MIDI from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage()
    if (!stored) return
    try {
      applyMidi(new Midi(stored.buffer), stored.name)
    } catch { /* corrupted storage — ignore */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback(async () => {
    const midi = rawMidiRef.current
    const data = parsed
    if (!midi || !data) return

    // Unlock AudioContext (requires user gesture — play button click fulfills this)
    await Tone.start()
    const ctx = Tone.getContext()
    if (ctx.state !== 'running') await ctx.resume()

    Tone.getTransport().stop()
    Tone.getTransport().cancel(0)
    clearParts()

    const melodyTrackIdx = midi.tracks.indexOf(
      midi.tracks.find(t => t.notes.length > 0 &&
        data.notes.length > 0 &&
        t.notes[0]?.midi === data.notes[0]?.midi
      ) ?? midi.tracks[0]
    )

    const newSynths: Tone.PolySynth[] = []
    const newParts: Tone.Part[] = []

    for (let i = 0; i < midi.tracks.length; i++) {
      const track = midi.tracks[i]
      if (track.notes.length === 0) continue

      const isDrum = track.channel === 9
      const program = track.instrument.number ?? 0
      const isMelody = i === melodyTrackIdx

      const synth = buildSynth(program, isDrum)
      if (isMelody) synth.volume.value -= 8  // guide melody much quieter

      type NoteEvent = { freq: number; dur: number; vel: number }
      const events: Array<{ time: number } & NoteEvent> = track.notes.map(n => ({
        time: n.time,
        freq: Tone.Frequency(n.midi, 'midi').toFrequency(),
        dur: Math.max(n.duration, 0.03),
        vel: isMelody ? n.velocity * 0.35 : n.velocity,
      }))

      const part = new Tone.Part<NoteEvent>((time, { freq, dur, vel }) => {
        synth.triggerAttackRelease(freq, dur, time, vel)
      }, events)
      part.start(0)

      newSynths.push(synth)
      newParts.push(part)
    }

    synthsRef.current = newSynths
    partsRef.current = newParts

    // Small pre-roll gives browser time to set up before first notes
    Tone.getTransport().start('+0.1')
    setIsPlaying(true)

    // Time tracking loop
    const transport = Tone.getTransport()
    const tick = () => {
      const t = transport.seconds
      setCurrentTime(t)
      if (t < data.duration + 0.5) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setIsPlaying(false)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [parsed, clearParts])

  const stop = useCallback(() => {
    Tone.getTransport().stop()
    Tone.getTransport().cancel(0)
    clearParts()
    cancelAnimationFrame(rafRef.current)
    setIsPlaying(false)
    setCurrentTime(0)
  }, [clearParts])

  useEffect(() => () => {
    Tone.getTransport().stop()
    Tone.getTransport().cancel(0)
    clearParts()
    cancelAnimationFrame(rafRef.current)
  }, [clearParts])

  return { loadMidi, play, stop, isPlaying, currentTime, parsed, fileName, error, volume, setVolume }
}
