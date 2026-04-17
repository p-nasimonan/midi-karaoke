import { freqToMidi, isOnPitch, midiToNoteName } from '../utils/pitchUtils'
import type { RendererState, RendererOptions, LyricEvent, NoteBar } from './types'

const COLORS = {
  bg0: '#0f0f1e',
  bg1: '#080810',
  grid: 'rgba(0, 207, 255, 0.05)',
  gridC: 'rgba(0, 207, 255, 0.13)',
  barDim: 'rgba(0, 207, 255, 0.18)',
  barActive: 'rgba(0, 207, 255, 0.55)',
  userOnPitch: '#3a8fff',
  userOnPitchGlow: 'rgba(58, 143, 255, 0.8)',
  userOffPitch: '#ff3a3a',
  userOffPitchGlow: 'rgba(255, 58, 58, 0.7)',
  playhead: 'rgba(0, 207, 255, 0.4)',
  lyricDim: '#3a3a5a',
  lyricCurrent: '#e8eaf6',
  lyricHighlight: '#00cfff',
  axisLabel: 'rgba(0, 207, 255, 0.3)',
}

const DISTANCE_GATE_SEMITONES = 24
const TRAIL_DURATION = 2.5   // seconds of trail to keep

interface TrailPoint {
  time: number
  midi: number
  onPitch: boolean
}

export class KaraokeRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private options: RendererOptions

  private trail: TrailPoint[] = []
  private smoothedMidi: number | null = null

  constructor(canvas: HTMLCanvasElement, options: Partial<RendererOptions> = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.options = {
      visibleTimeRange: 4,
      playheadX: 0.28,
      minMidi: 48,
      maxMidi: 72,
      ...options,
    }
  }

  setOptions(options: Partial<RendererOptions>) {
    this.options = { ...this.options, ...options }
  }

  render(state: RendererState) {
    const { canvas, ctx, options } = this
    const W = canvas.width
    const H = canvas.height

    ctx.clearRect(0, 0, W, H)
    this.drawBackground(W, H)

    const playheadPx = W * options.playheadX
    const timeStart = state.currentTime - options.playheadX * options.visibleTimeRange
    const timeEnd = timeStart + options.visibleTimeRange
    const midiRange = options.maxMidi - options.minMidi
    const noteTop = H * 0.12
    const noteH = H * 0.68
    const barH = Math.max(6, noteH / midiRange - 2)

    const timeToX = (t: number) => ((t - timeStart) / options.visibleTimeRange) * W
    const midiToY = (m: number) => noteTop + (1 - (m - options.minMidi) / midiRange) * noteH

    this.drawGrid(W, options.minMidi, options.maxMidi, midiToY)
    this.drawPlayhead(playheadPx, noteTop, noteH)

    const visibleNotes = state.notes.filter(
      n => n.endTime > timeStart - 0.1 && n.startTime < timeEnd + 0.1
    )

    for (const note of visibleNotes) {
      const x1 = timeToX(note.startTime)
      const w = timeToX(note.endTime) - x1
      const y = midiToY(note.midi)
      const isActive = note.startTime <= state.currentTime && note.endTime >= state.currentTime
      this.drawNoteBar(x1, y - barH / 2, w, barH, isActive)
    }

    this.drawUserVoice(state, W, playheadPx, timeToX, midiToY, barH, visibleNotes)

    this.drawLyrics(state.lyrics, state.currentTime, W, H)
    this.drawScoreHUD(state.scorePercent, W)
    this.drawAxisLabels(options.minMidi, options.maxMidi, midiToY)
  }

  // ── User voice: trail + current bar ──────────────────────────────────────

  private drawUserVoice(
    state: RendererState,
    W: number,
    playheadPx: number,
    timeToX: (t: number) => number,
    midiToY: (m: number) => number,
    barH: number,
    visibleNotes: NoteBar[],
  ) {
    const { ctx } = this
    const freq = state.userFrequency
    if (freq === null || freq <= 0) {
      this.smoothedMidi = null
      return
    }

    const rawMidi = freqToMidi(freq)

    // Distance gate: ignore if too far from any note near current time
    let minDist = Infinity
    let activeNote: NoteBar | null = null
    for (const n of visibleNotes) {
      if (n.endTime < state.currentTime - 1 || n.startTime > state.currentTime + 1) continue
      const d = Math.abs(n.midi - rawMidi)
      if (d < minDist) { minDist = d; activeNote = n }
    }
    if (minDist > DISTANCE_GATE_SEMITONES) {
      this.smoothedMidi = null
      return
    }

    // Blue only when a guide note is CURRENTLY active AND user is on pitch
    const isNoteActiveNow = activeNote !== null
      && activeNote.startTime <= state.currentTime
      && activeNote.endTime >= state.currentTime
    const onPitch = isNoteActiveNow && isOnPitch(freq, activeNote!.midi, 50)

    // Exponential smoothing for vertical position
    this.smoothedMidi = this.smoothedMidi === null
      ? rawMidi
      : this.smoothedMidi * 0.72 + rawMidi * 0.28
    const displayMidi = this.smoothedMidi

    // Accumulate trail while playing
    if (state.isPlaying) {
      this.trail.push({ time: state.currentTime, midi: displayMidi, onPitch })
      const cutoff = state.currentTime - TRAIL_DURATION
      let start = 0
      while (start < this.trail.length && this.trail[start].time < cutoff) start++
      if (start > 0) this.trail = this.trail.slice(start)
    }

    // Draw trail as fading dots scrolling with the timeline
    for (const pt of this.trail) {
      const tx = timeToX(pt.time)
      if (tx < 0 || tx > W) continue
      const ty = midiToY(pt.midi)
      const age = state.currentTime - pt.time
      const alpha = (1 - age / TRAIL_DURATION) * 0.55
      const dotR = Math.max(2, barH * 0.28)

      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = pt.onPitch ? COLORS.userOnPitch : COLORS.userOffPitch
      ctx.beginPath()
      ctx.arc(tx, ty, dotR, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // Draw current bar at playhead
    const color = onPitch ? COLORS.userOnPitch : COLORS.userOffPitch
    const glow = onPitch ? COLORS.userOnPitchGlow : COLORS.userOffPitchGlow
    const barW = 56
    const x = playheadPx - barW / 2
    const y = midiToY(displayMidi) - barH / 2

    ctx.save()
    ctx.shadowColor = glow
    ctx.shadowBlur = onPitch ? 18 : 10
    ctx.fillStyle = color
    ctx.globalAlpha = 0.92
    this.roundRect(x, y, barW, barH, barH / 2)
    ctx.fill()
    ctx.restore()
  }

  // ── Guide bars ────────────────────────────────────────────────────────────

  private drawNoteBar(x: number, y: number, w: number, h: number, isActive: boolean) {
    const { ctx } = this
    if (w < 1) return
    ctx.save()
    ctx.fillStyle = isActive ? COLORS.barActive : COLORS.barDim
    ctx.shadowColor = isActive ? 'rgba(0, 207, 255, 0.45)' : 'transparent'
    ctx.shadowBlur = isActive ? 7 : 0
    ctx.globalAlpha = isActive ? 1 : 0.85
    this.roundRect(x, y, Math.max(w, 3), h, h / 2)
    ctx.fill()
    ctx.restore()
  }

  // ── Background & grid ─────────────────────────────────────────────────────

  private drawBackground(W: number, H: number) {
    const { ctx } = this
    const grd = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.7)
    grd.addColorStop(0, COLORS.bg0)
    grd.addColorStop(1, COLORS.bg1)
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, W, H)
  }

  private drawGrid(W: number, minMidi: number, maxMidi: number, midiToY: (m: number) => number) {
    const { ctx } = this
    for (let m = minMidi; m <= maxMidi; m++) {
      const y = midiToY(m)
      ctx.strokeStyle = m % 12 === 0 ? COLORS.gridC : COLORS.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  private drawPlayhead(x: number, top: number, h: number) {
    const { ctx } = this
    ctx.strokeStyle = COLORS.playhead
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(x, top - 8)
    ctx.lineTo(x, top + h + 8)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // ── HUD ───────────────────────────────────────────────────────────────────

  private drawLyrics(lyrics: LyricEvent[], currentTime: number, W: number, H: number) {
    const { ctx } = this
    let idx = -1
    for (let i = 0; i < lyrics.length; i++) {
      const next = i + 1 < lyrics.length ? lyrics[i + 1].time : Infinity
      if (lyrics[i].time <= currentTime && currentTime < next) { idx = i; break }
    }
    if (idx < 0) return

    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (idx > 0) {
      ctx.font = `400 18px "Noto Sans JP", sans-serif`
      ctx.fillStyle = COLORS.lyricDim
      ctx.fillText(lyrics[idx - 1].text, W / 2, H * 0.80)
    }

    ctx.font = `700 32px "Noto Sans JP", sans-serif`
    ctx.shadowColor = COLORS.lyricHighlight
    ctx.shadowBlur = 18
    ctx.fillStyle = COLORS.lyricCurrent
    ctx.fillText(lyrics[idx].text, W / 2, H * 0.86)

    if (idx + 1 < lyrics.length) {
      ctx.shadowBlur = 0
      ctx.font = `400 18px "Noto Sans JP", sans-serif`
      ctx.fillStyle = COLORS.lyricDim
      ctx.fillText(lyrics[idx + 1].text, W / 2, H * 0.92)
    }
    ctx.restore()
  }

  private drawScoreHUD(score: number, W: number) {
    const { ctx } = this
    ctx.save()
    ctx.font = `900 13px Orbitron, monospace`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0, 207, 255, 0.4)'
    ctx.fillText(`SCORE ${String(Math.round(score * 100)).padStart(3, '0')}%`, W - 16, 14)
    ctx.restore()
  }

  private drawAxisLabels(minMidi: number, maxMidi: number, midiToY: (m: number) => number) {
    const { ctx } = this
    ctx.save()
    ctx.font = `400 9px "Space Mono", monospace`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = COLORS.axisLabel
    for (let m = minMidi; m <= maxMidi; m++) {
      if (m % 3 === 0) ctx.fillText(midiToNoteName(m), 4, midiToY(m))
    }
    ctx.restore()
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.lineTo(x + w, y + h - r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.lineTo(x + r, y + h)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.lineTo(x, y + r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
}
