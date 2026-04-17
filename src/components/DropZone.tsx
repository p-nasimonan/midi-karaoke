import { useRef, useState, useCallback } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  isLoading?: boolean
}

export function DropZone({ onFile, isLoading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    if (!file.name.match(/\.midi?$/i)) return
    onFile(file)
  }, [onFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div
      className={`dropzone ${isDragging ? 'dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        border: `2px dashed ${isDragging ? 'var(--cyan)' : 'var(--border-dim)'}`,
        borderRadius: 16,
        background: isDragging
          ? 'rgba(0, 207, 255, 0.04)'
          : 'rgba(13, 13, 26, 0.6)',
        transition: 'all 0.2s ease',
        boxShadow: isDragging ? '0 0 40px rgba(0, 207, 255, 0.15) inset' : 'none',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi"
        style={{ display: 'none' }}
        onChange={onInputChange}
      />

      {/* MIDI icon */}
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="20" width="48" height="30" rx="4" stroke="var(--cyan)" strokeWidth="1.5" strokeOpacity="0.5" />
        {/* Piano keys */}
        {[0,1,2,3,4,5,6,7].map(i => (
          <rect key={i} x={10 + i * 5.5} y="22" width="4.5" height="18" rx="1"
            fill={[1,2,4,5,6].includes(i) ? 'rgba(0,207,255,0.08)' : 'rgba(0,207,255,0.18)'}
            stroke="var(--cyan)" strokeWidth="0.5" strokeOpacity="0.4" />
        ))}
        {/* Black keys */}
        {[0,1,3,4,5].map((i, idx) => (
          <rect key={idx} x={12 + i * 5.5} y="22" width="3" height="11" rx="1"
            fill="rgba(0,207,255,0.5)" />
        ))}
        {/* Note symbol */}
        <circle cx="44" cy="28" r="3" fill="var(--cyan)" fillOpacity="0.6" />
        <line x1="47" y1="28" x2="47" y2="20" stroke="var(--cyan)" strokeWidth="1.5" strokeOpacity="0.6" />
      </svg>

      <div style={{ textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: '0.15em',
          color: isDragging ? 'var(--cyan)' : 'rgba(0, 207, 255, 0.6)',
          marginBottom: 6,
        }}>
          {isLoading ? 'LOADING...' : 'DROP MIDI FILE'}
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 12,
          color: 'var(--text-dim)',
          letterSpacing: '0.05em',
        }}>
          .mid / .midi — クリックしてファイルを選択
        </div>
      </div>

      {isDragging && (
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 16,
          background: 'radial-gradient(ellipse at center, rgba(0,207,255,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
