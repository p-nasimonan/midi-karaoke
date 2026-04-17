import { Play, Square, Music, Volume2 } from 'lucide-react'

interface ControlsProps {
  isPlaying: boolean
  hasFile: boolean
  onPlay: () => void
  onStop: () => void
  onOpenFile: () => void
  fileName: string | null
  volume: number
  onVolumeChange: (v: number) => void
  transpose: number
  onTransposeChange: (semitones: number) => void
}

const btnBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid',
  background: 'transparent',
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '0.12em',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  whiteSpace: 'nowrap',
}

function Btn({ style, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button style={{ ...btnBase, ...style }} {...props} />
}

const iconBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  borderRadius: 6,
  border: '1px solid var(--border-dim)',
  background: 'transparent',
  color: 'rgba(0,207,255,0.6)',
  fontFamily: 'var(--font-display)',
  fontSize: 14,
  lineHeight: 1,
  cursor: 'pointer',
  transition: 'all 0.12s ease',
}

export function Controls({
  isPlaying, hasFile,
  onPlay, onStop, onOpenFile,
  fileName, volume, onVolumeChange,
  transpose, onTransposeChange,
}: ControlsProps) {
  const transposeLabel = transpose === 0 ? '±0' : transpose > 0 ? `+${transpose}` : `${transpose}`

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 20px',
      background: 'rgba(8, 8, 16, 0.9)',
      borderTop: '1px solid var(--border-dim)',
      backdropFilter: 'blur(12px)',
      flexWrap: 'wrap',
    }}>
      {/* File name */}
      <div style={{
        flex: 1,
        minWidth: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: hasFile ? 'rgba(0,207,255,0.7)' : 'var(--text-dim)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '0.05em',
      }}>
        {fileName ?? '— no file loaded —'}
      </div>

      {/* Volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Volume2 size={13} color="rgba(0,207,255,0.45)" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={e => onVolumeChange(Number(e.target.value))}
          style={{ width: 80, accentColor: 'var(--cyan)', cursor: 'pointer' }}
        />
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'rgba(0,207,255,0.45)',
          minWidth: 28,
          textAlign: 'right',
        }}>
          {volume}%
        </span>
      </div>

      {/* Key transpose */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 9,
          letterSpacing: '0.15em',
          color: 'rgba(0,207,255,0.45)',
        }}>
          KEY
        </span>
        <button
          style={iconBtn}
          onClick={() => onTransposeChange(transpose - 1)}
          disabled={transpose <= -12}
        >
          −
        </button>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: transpose !== 0 ? 'var(--cyan)' : 'rgba(0,207,255,0.45)',
          minWidth: 26,
          textAlign: 'center',
          letterSpacing: '0.05em',
        }}>
          {transposeLabel}
        </span>
        <button
          style={iconBtn}
          onClick={() => onTransposeChange(transpose + 1)}
          disabled={transpose >= 12}
        >
          +
        </button>
      </div>

      {/* Open file */}
      <Btn onClick={onOpenFile} style={{ color: 'rgba(0,207,255,0.6)', borderColor: 'var(--border-dim)' }}>
        <Music size={14} />
        OPEN
      </Btn>

      {/* Play / Stop */}
      {!isPlaying ? (
        <Btn
          onClick={onPlay}
          disabled={!hasFile}
          style={{
            color: hasFile ? 'var(--cyan)' : 'var(--text-dim)',
            borderColor: hasFile ? 'var(--border-bright)' : 'var(--border-dim)',
            boxShadow: hasFile ? '0 0 12px rgba(0,207,255,0.15)' : 'none',
          }}
        >
          <Play size={14} fill="currentColor" />
          PLAY
        </Btn>
      ) : (
        <Btn
          onClick={onStop}
          style={{
            color: 'var(--magenta)',
            borderColor: 'rgba(255,58,140,0.4)',
            boxShadow: '0 0 12px rgba(255,58,140,0.2)',
          }}
        >
          <Square size={14} fill="currentColor" />
          STOP
        </Btn>
      )}

    </div>
  )
}
