import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react'
import { useMidi } from './hooks/useMidi'
import { usePitchDetection } from './hooks/usePitchDetection'
import { DropZone } from './components/DropZone'
import { Controls } from './components/Controls'
import { KaraokeCanvas } from './components/KaraokeCanvas'
import { isOnPitch } from './utils/pitchUtils'

export default function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [hitCount, setHitCount] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const scorePercent = totalFrames > 0 ? hitCount / totalFrames : 0

  const midi = useMidi()
  const pitch = usePitchDetection()

  // Auto-start mic on mount
  useEffect(() => {
    pitch.startMic()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs current for score interval and keyboard handlers
  const currentTimeRef = useRef(midi.currentTime)
  const frequencyRef = useRef(pitch.frequency)
  const parsedRef = useRef(midi.parsed)
  const isPlayingRef = useRef(midi.isPlaying)
  useLayoutEffect(() => {
    currentTimeRef.current = midi.currentTime
    frequencyRef.current = pitch.frequency
    parsedRef.current = midi.parsed
    isPlayingRef.current = midi.isPlaying
  })

  // Score tracking
  useEffect(() => {
    if (!midi.isPlaying) return
    const id = setInterval(() => {
      const parsed = parsedRef.current
      if (!parsed) return
      setTotalFrames(f => f + 1)
      const active = parsed.notes.find(
        n => n.startTime <= currentTimeRef.current && n.endTime >= currentTimeRef.current
      )
      if (active && isOnPitch(frequencyRef.current, active.midi, 50)) {
        setHitCount(h => h + 1)
      }
    }, 100)
    return () => clearInterval(id)
  }, [midi.isPlaying])

  const handleFile = useCallback((file: File) => {
    midi.loadMidi(file)
    setHitCount(0)
    setTotalFrames(0)
  }, [midi])

  const handleOpenFile = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handlePlay = useCallback(() => {
    setHitCount(0)
    setTotalFrames(0)
    midi.play()
  }, [midi])

  const handleStop = useCallback(() => {
    midi.stop()
  }, [midi])

  const handleTogglePlayback = useCallback(() => {
    if (isPlayingRef.current) {
      handleStop()
    } else if (parsedRef.current) {
      handlePlay()
    }
  }, [handlePlay, handleStop])

  // Space key → play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        handleTogglePlayback()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleTogglePlayback])

  // Media Session API (mobile hardware/software media buttons)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', handlePlay)
    navigator.mediaSession.setActionHandler('pause', handleStop)
    navigator.mediaSession.setActionHandler('stop', handleStop)
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('stop', null)
    }
  }, [handlePlay, handleStop])

  // Sync media session playback state
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = midi.isPlaying ? 'playing' : 'paused'
  }, [midi.isPlaying])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: 'var(--bg-deep)', overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid var(--border-dim)',
        background: 'rgba(8, 8, 16, 0.95)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 900,
          letterSpacing: '0.25em', color: 'var(--cyan)',
          textShadow: '0 0 20px rgba(0,207,255,0.5)',
        }}>
          MIDI KARAOKE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Mic status */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: pitch.frequency ? '#3a8fff' : 'var(--text-dim)',
            letterSpacing: '0.08em',
          }}>
            {pitch.error
              ? `⚠ ${pitch.error}`
              : pitch.frequency
                ? `${Math.round(pitch.frequency)} Hz`
                : 'MIC'}
          </div>
          {/* Time */}
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: midi.isPlaying ? 'var(--cyan)' : 'var(--text-dim)',
            letterSpacing: '0.1em',
          }}>
            {formatTime(midi.currentTime)}
            {midi.parsed && (
              <span style={{ color: 'var(--text-dim)' }}>
                {' / '}{formatTime(midi.parsed.duration)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {midi.parsed ? (
          <KaraokeCanvas
            parsed={midi.parsed}
            currentTime={midi.currentTime}
            userFrequency={pitch.frequency}
            isPlaying={midi.isPlaying}
            scorePercent={scorePercent}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', padding: 32, position: 'relative' }}>
            <DropZone onFile={handleFile} />
          </div>
        )}

        {midi.error && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255, 58, 140, 0.12)',
            border: '1px solid rgba(255,58,140,0.3)',
            borderRadius: 8, padding: '8px 16px',
            fontFamily: 'var(--font-mono)', fontSize: 12,
            color: 'var(--magenta)',
          }}>
            {midi.error}
          </div>
        )}

        {midi.parsed && !midi.isPlaying && (
          <button
            onClick={handleOpenFile}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'rgba(8,8,16,0.8)', border: '1px solid var(--border-dim)',
              borderRadius: 6, padding: '6px 12px',
              fontFamily: 'var(--font-display)', fontSize: 10,
              letterSpacing: '0.1em', color: 'rgba(0,207,255,0.5)', cursor: 'pointer',
            }}
          >
            CHANGE FILE
          </button>
        )}
      </main>

      <Controls
        isPlaying={midi.isPlaying}
        hasFile={!!midi.parsed}
        onPlay={handlePlay}
        onStop={handleStop}
        onOpenFile={handleOpenFile}
        fileName={midi.fileName}
        volume={midi.volume}
        onVolumeChange={midi.setVolume}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
