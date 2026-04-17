import type { Midi } from '@tonejs/midi'
import type { NoteBar, LyricEvent } from '../canvas/types'

export interface ParsedMidi {
  notes: NoteBar[]
  lyrics: LyricEvent[]
  accompanimentNotes: NoteBar[]
  duration: number
  tempos: Array<{ time: number; bpm: number }>
}

/**
 * Heuristic to identify the vocal melody track.
 * Prioritizes tracks with lyrics, then the track with most notes in vocal range (C3-C6, midi 48-84).
 */
function findMelodyTrackIndex(midi: Midi): number {
  // First: track with lyrics
  for (let i = 0; i < midi.tracks.length; i++) {
    if ((midi.tracks[i] as { lyrics?: unknown[] }).lyrics && ((midi.tracks[i] as { lyrics?: unknown[] }).lyrics as unknown[]).length > 0) {
      return i
    }
  }

  // Fallback: track with most notes in vocal range
  let bestIdx = 0
  let bestCount = 0
  for (let i = 0; i < midi.tracks.length; i++) {
    const count = midi.tracks[i].notes.filter(n => n.midi >= 48 && n.midi <= 84).length
    if (count > bestCount) {
      bestCount = count
      bestIdx = i
    }
  }
  return bestIdx
}

export function parseMidi(midi: Midi): ParsedMidi {
  const melodyIdx = findMelodyTrackIndex(midi)

  const notes: NoteBar[] = []
  const lyrics: LyricEvent[] = []

  const melodyTrack = midi.tracks[melodyIdx]
  for (const note of melodyTrack.notes) {
    notes.push({
      startTime: note.time,
      endTime: note.time + note.duration,
      midi: note.midi,
      velocity: note.velocity,
    })
  }

  // Extract lyrics from melody track or from MIDI header
  const rawLyrics = (melodyTrack as { lyrics?: Array<{ time: number; text: string }> }).lyrics
  if (rawLyrics) {
    for (const lyric of rawLyrics) {
      lyrics.push({ time: lyric.time, text: lyric.text })
    }
  }

  // Accompaniment: all other tracks merged
  const accompanimentNotes: NoteBar[] = []
  for (let i = 0; i < midi.tracks.length; i++) {
    if (i === melodyIdx) continue
    for (const note of midi.tracks[i].notes) {
      accompanimentNotes.push({
        startTime: note.time,
        endTime: note.time + note.duration,
        midi: note.midi,
        velocity: note.velocity,
      })
    }
  }

  // Attach lyrics to nearest note
  for (const lyric of lyrics) {
    let closest: NoteBar | null = null
    let minDist = Infinity
    for (const note of notes) {
      const dist = Math.abs(note.startTime - lyric.time)
      if (dist < minDist) {
        minDist = dist
        closest = note
      }
    }
    if (closest && minDist < 0.5) {
      closest.lyric = (closest.lyric ?? '') + lyric.text
    }
  }

  const tempos = midi.header.tempos.map(t => ({ time: t.time ?? 0, bpm: t.bpm }))

  return {
    notes,
    lyrics,
    accompanimentNotes,
    duration: midi.duration,
    tempos,
  }
}

/** Get MIDI note range with some padding */
export function getNoteRange(notes: NoteBar[]): { min: number; max: number } {
  if (notes.length === 0) return { min: 48, max: 72 }
  const midiVals = notes.map(n => n.midi)
  return {
    min: Math.max(0, Math.min(...midiVals) - 3),
    max: Math.min(127, Math.max(...midiVals) + 3),
  }
}
