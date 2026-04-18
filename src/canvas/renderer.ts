import { freqToMidi, isOnPitch, midiToNoteName } from '../utils/pitchUtils'
import type { RendererState, RendererOptions, NoteBar } from './types'

const COLORS = {
  bg0: '#0f0f1e',
  bg1: '#080810',
  grid: 'rgba(0, 207, 255, 0.05)',
  gridC: 'rgba(0, 207, 255, 0.13)',
  barDim: 'rgba(0, 207, 255, 0.18)',
  barActive: 'rgba(0, 207, 255, 0.55)',
  barGold: '#e8b84b',
  barGoldGlow: 'rgba(232, 184, 75, 0.55)',
  userOnPitch: '#3a8fff',
  userOnPitchGlow: 'rgba(58, 143, 255, 0.8)',
  userOffPitch: '#ff3a3a',
  userOffPitchGlow: 'rgba(255, 58, 58, 0.7)',
  cursor: 'rgba(0, 207, 255, 0.55)',
  axisLabel: 'rgba(0, 207, 255, 0.3)',
  flash: 'rgba(0, 207, 255, 0.18)',
}

const HIT_PITCH_TOLERANCE_ST = 0.75
const HIT_THRESHOLD = 0.45
const TRAIL_DURATION = 3.5  // seconds of trail to keep

interface TrailPoint { time: number; midi: number; onPitch: boolean }
interface NoteHit { hit: number; total: number; finalFraction: number | null }

export class KaraokeRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private options: RendererOptions

  private trail: TrailPoint[] = []
  private smoothedMidi: number | null = null
  private wasPlaying = false
  private midiHistory: number[] = []
  private noteHits: Map<string, NoteHit> = new Map()

  private currentPage = -1
  private flashAlpha = 0  // 0–1, fades after page transition

  constructor(canvas: HTMLCanvasElement, options: Partial<RendererOptions> = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.options = {
      pageSeconds: 4,
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

    // ── Lifecycle ──────────────────────────────────────────────────────────
    if (!this.wasPlaying && state.isPlaying) {
      this.noteHits.clear()
      this.midiHistory = []
    }
    if (this.wasPlaying && !state.isPlaying) {
      this.trail = []
      this.smoothedMidi = null
      this.midiHistory = []
      this.currentPage = -1
    }
    this.wasPlaying = state.isPlaying

    // ── Page calculation ───────────────────────────────────────────────────
    const page = Math.floor(state.currentTime / options.pageSeconds)
    if (page !== this.currentPage) {
      if (this.currentPage >= 0) {
        // Page just flipped — clear trail, trigger flash
        this.trail = []
        this.flashAlpha = 1
      }
      this.currentPage = page
    }
    const pageStart = page * options.pageSeconds
    const pageEnd   = pageStart + options.pageSeconds

    // Fade flash over ~0.35 s (≈21 frames at 60 fps)
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.048)

    // ── Layout ─────────────────────────────────────────────────────────────
    const midiRange = options.maxMidi - options.minMidi
    const noteTop = H * 0.06          // small top margin for score HUD
    const noteH   = H * 0.84          // notes fill most of canvas
    const barH    = Math.max(6, noteH / midiRange - 1.5)

    const timeToX  = (t: number) => ((t - pageStart) / options.pageSeconds) * W
    const midiToY  = (m: number) => noteTop + (1 - (m - options.minMidi) / midiRange) * noteH
    const cursorX  = timeToX(state.currentTime)

    // ── Update smoothedMidi ────────────────────────────────────────────────
    const freq = state.userFrequency
    const hasFreq = freq !== null && freq > 0
    if (hasFreq) {
      const rawMidi = freqToMidi(freq!)
      if (this.smoothedMidi === null) {
        this.smoothedMidi = rawMidi
      } else if (Math.abs(rawMidi - this.smoothedMidi) > 0.35) {
        this.smoothedMidi = this.smoothedMidi * 0.88 + rawMidi * 0.12
      }
      this.midiHistory.push(this.smoothedMidi)
      if (this.midiHistory.length > 30) this.midiHistory.shift()
    } else {
      if (this.midiHistory.length > 0) this.midiHistory.shift()
    }

    // ── Pitch judgments ────────────────────────────────────────────────────
    const activeNote = state.notes.find(
      n => n.startTime <= state.currentTime && n.endTime >= state.currentTime
    ) ?? null

    const isHit = hasFreq && this.smoothedMidi !== null && activeNote !== null
      && Math.abs(this.smoothedMidi - activeNote.midi) < HIT_PITCH_TOLERANCE_ST

    const onPitch = hasFreq && freq !== null && activeNote !== null
      && isOnPitch(freq!, activeNote.midi, 50)

    const isVibrato = this.detectVibrato()

    // ── Hit tracking ───────────────────────────────────────────────────────
    if (state.isPlaying && activeNote) {
      const key = `${activeNote.startTime}_${activeNote.endTime}_${activeNote.midi}`
      let d = this.noteHits.get(key)
      if (!d) { d = { hit: 0, total: 0, finalFraction: null }; this.noteHits.set(key, d) }
      if (hasFreq) { d.total++; if (isHit) d.hit++ }
    }
    for (const note of state.notes) {
      if (note.endTime < state.currentTime) {
        const key = `${note.startTime}_${note.endTime}_${note.midi}`
        const d = this.noteHits.get(key)
        if (d && d.finalFraction === null && d.total > 0) d.finalFraction = d.hit / d.total
      }
    }

    // ── Draw ───────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, W, H)
    this.drawBackground(W, H)

    if (this.flashAlpha > 0) {
      ctx.save()
      ctx.globalAlpha = this.flashAlpha * 0.5
      ctx.fillStyle = COLORS.flash
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    this.drawGrid(W, options.minMidi, options.maxMidi, midiToY)
    this.drawCursor(cursorX, noteTop, noteH)

    // Notes visible on this page (allow slight overflow for notes starting just before/after)
    const pageNotes = state.notes.filter(
      n => n.endTime > pageStart - 0.05 && n.startTime < pageEnd + 0.05
    )
    for (const note of pageNotes) {
      this.drawPageNote(note, state.currentTime, pageStart, pageEnd, W, midiToY, barH, cursorX)
    }

    this.drawTrailRibbon(timeToX, midiToY, barH, pageStart)
    this.drawUserVoice(state, cursorX, midiToY, barH, onPitch, isVibrato)

    this.drawScoreHUD(state.scorePercent, W)
    this.drawAxisLabels(options.minMidi, options.maxMidi, midiToY)
    this.drawProgress(state.currentTime, pageStart, pageEnd, W, H)
  }

  // ── Per-note drawing (page-relative) ──────────────────────────────────────

  private drawPageNote(
    note: NoteBar,
    currentTime: number,
    pageStart: number,
    _pageEnd: number,
    W: number,
    midiToY: (m: number) => number,
    barH: number,
    cursorX: number,
  ) {
    const { options } = this
    const x1 = Math.max(0, ((note.startTime - pageStart) / options.pageSeconds) * W)
    const x2 = Math.min(W, ((note.endTime   - pageStart) / options.pageSeconds) * W)
    const w = x2 - x1
    if (w < 1) return
    const y = midiToY(note.midi) - barH / 2

    const isActive = note.startTime <= currentTime && note.endTime >= currentTime
    const isPast   = note.endTime < currentTime

    const key = `${note.startTime}_${note.endTime}_${note.midi}`
    const d = this.noteHits.get(key)
    const hitFrac = d ? (d.finalFraction ?? (d.total > 0 ? d.hit / d.total : 0)) : 0
    const gold = hitFrac >= HIT_THRESHOLD

    if (isActive) {
      const coveredW = Math.max(0, cursorX - x1)
      if (gold && coveredW > 0) {
        this.drawGoldBar(x1, y, coveredW, barH)
        const restW = w - coveredW
        if (restW > 2) this.drawNoteBar(x1 + coveredW, y, restW, barH, true)
      } else {
        this.drawNoteBar(x1, y, w, barH, true)
      }
    } else if (isPast) {
      gold ? this.drawGoldBar(x1, y, w, barH) : this.drawNoteBar(x1, y, w, barH, false)
    } else {
      this.drawNoteBar(x1, y, w, barH, false)
    }

    // Lyric label on note
    if (note.lyric) {
      const { ctx } = this
      ctx.save()
      ctx.font = `500 10px "Noto Sans JP", sans-serif`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(220,235,255,0.7)'
      ctx.fillText(note.lyric, x1 + 4, y + barH / 2)
      ctx.restore()
    }
  }

  // ── User voice ─────────────────────────────────────────────────────────────

  private drawUserVoice(
    state: RendererState,
    cursorX: number,
    midiToY: (m: number) => number,
    barH: number,
    onPitch: boolean,
    isVibrato: boolean,
  ) {
    const hasFreq = state.userFrequency !== null && state.userFrequency > 0

    if (hasFreq && state.isPlaying) {
      this.trail.push({
        time: state.currentTime,
        midi: this.smoothedMidi ?? freqToMidi(state.userFrequency!),
        onPitch,
      })
      const cutoff = state.currentTime - TRAIL_DURATION
      let start = 0
      while (start < this.trail.length && this.trail[start].time < cutoff) start++
      if (start > 0) this.trail = this.trail.slice(start)
    }

    if (hasFreq && this.smoothedMidi !== null) {
      const { ctx } = this
      const color = onPitch ? COLORS.userOnPitch : COLORS.userOffPitch
      const glow  = onPitch ? COLORS.userOnPitchGlow : COLORS.userOffPitchGlow
      const barW  = 56
      const x = cursorX - barW / 2
      const y = midiToY(this.smoothedMidi) - barH / 2

      if (isVibrato) {
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 90)
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        for (let ring = 1; ring <= 2; ring++) {
          const expand = ring * 5 + pulse * 3
          ctx.globalAlpha = (0.35 / ring) * pulse
          ctx.beginPath()
          this.roundRect(x - expand, y - expand, barW + expand * 2, barH + expand * 2, (barH + expand * 2) / 2)
          ctx.stroke()
        }
        ctx.restore()
      }

      ctx.save()
      ctx.shadowColor = glow
      ctx.shadowBlur = onPitch ? (isVibrato ? 26 : 18) : 10
      ctx.fillStyle = color
      ctx.globalAlpha = 0.92
      this.roundRect(x, y, barW, barH, barH / 2)
      ctx.fill()
      ctx.restore()
    }
  }

  private drawTrailRibbon(
    timeToX: (t: number) => number,
    midiToY: (m: number) => number,
    barH: number,
    pageStart: number,
  ) {
    // Only draw trail points on the current page
    const pts = this.trail.filter(p => p.time >= pageStart)
    if (pts.length < 2) return
    const { ctx } = this
    ctx.save()
    ctx.lineWidth = barH
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.55

    let i = 0
    while (i < pts.length) {
      const onPitch = pts[i].onPitch
      ctx.beginPath()
      ctx.strokeStyle = onPitch ? COLORS.userOnPitch : COLORS.userOffPitch
      ctx.moveTo(timeToX(pts[i].time), midiToY(pts[i].midi))
      let j = i + 1
      for (; j < pts.length; j++) {
        if (pts[j].time - pts[j - 1].time > 0.15) break
        ctx.lineTo(timeToX(pts[j].time), midiToY(pts[j].midi))
        if (pts[j].onPitch !== onPitch) { j++; break }
      }
      ctx.stroke()
      i = j
    }
    ctx.restore()
  }

  // ── Note bars ──────────────────────────────────────────────────────────────

  private drawNoteBar(x: number, y: number, w: number, h: number, isActive: boolean) {
    const { ctx } = this
    if (w < 1) return
    ctx.save()
    ctx.fillStyle = isActive ? COLORS.barActive : COLORS.barDim
    ctx.shadowColor = isActive ? 'rgba(0, 207, 255, 0.45)' : 'transparent'
    ctx.shadowBlur = isActive ? 7 : 0
    ctx.globalAlpha = isActive ? 1 : 0.85
    this.roundRect(x, y, w, h, h / 2)
    ctx.fill()
    ctx.restore()
  }

  private drawGoldBar(x: number, y: number, w: number, h: number) {
    const { ctx } = this
    if (w < 1) return
    ctx.save()
    const grad = ctx.createLinearGradient(x, 0, x + w, 0)
    grad.addColorStop(0, 'rgba(220, 165, 40, 0.75)')
    grad.addColorStop(1, 'rgba(255, 210, 80, 0.95)')
    ctx.fillStyle = grad
    ctx.shadowColor = COLORS.barGoldGlow
    ctx.shadowBlur = 9
    ctx.globalAlpha = 0.92
    this.roundRect(x, y, w, h, h / 2)
    ctx.fill()
    ctx.restore()
  }

  // ── Background, grid, cursor ───────────────────────────────────────────────

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

  private drawCursor(x: number, top: number, h: number) {
    const { ctx } = this
    ctx.save()
    ctx.strokeStyle = COLORS.cursor
    ctx.lineWidth = 2
    ctx.shadowColor = 'rgba(0,207,255,0.4)'
    ctx.shadowBlur = 8
    ctx.beginPath()
    ctx.moveTo(x, top - 4)
    ctx.lineTo(x, top + h + 4)
    ctx.stroke()
    ctx.restore()
  }

  // Small progress bar at the bottom showing position within the current page
  private drawProgress(currentTime: number, pageStart: number, pageEnd: number, W: number, H: number) {
    const { ctx } = this
    const frac = Math.min(1, (currentTime - pageStart) / (pageEnd - pageStart))
    const barY = H - 3
    ctx.save()
    ctx.fillStyle = 'rgba(0,207,255,0.12)'
    ctx.fillRect(0, barY, W, 3)
    ctx.fillStyle = 'rgba(0,207,255,0.45)'
    ctx.fillRect(0, barY, W * frac, 3)
    ctx.restore()
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  private drawScoreHUD(score: number, W: number) {
    const { ctx } = this
    ctx.save()
    ctx.font = `900 12px Orbitron, monospace`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(0, 207, 255, 0.4)'
    ctx.fillText(`SCORE ${String(Math.round(score * 100)).padStart(3, '0')}%`, W - 12, 10)
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

  // ── Vibrato detection ──────────────────────────────────────────────────────

  private detectVibrato(): boolean {
    if (this.midiHistory.length < 12) return false
    const mean = this.midiHistory.reduce((a, b) => a + b, 0) / this.midiHistory.length
    const variance = this.midiHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / this.midiHistory.length
    return Math.sqrt(variance) > 0.3
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

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
