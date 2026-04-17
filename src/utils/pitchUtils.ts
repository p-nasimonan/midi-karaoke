/** Convert frequency (Hz) to MIDI note number (float for sub-semitone precision) */
export function freqToMidi(freq: number): number {
  return 12 * Math.log2(freq / 440) + 69
}

/** Convert MIDI note number to frequency (Hz) */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[Math.round(midi) % 12]
  const octave = Math.floor(Math.round(midi) / 12) - 1
  return `${note}${octave}`
}

/** Returns cents deviation of freq from the nearest MIDI note (-50 to +50) */
export function centsDeviation(freq: number): number {
  const midi = freqToMidi(freq)
  const nearest = Math.round(midi)
  return (midi - nearest) * 100
}

/** Check if user frequency matches target MIDI note within tolerance (cents) */
export function isOnPitch(userFreq: number | null, targetMidi: number, toleranceCents = 40): boolean {
  if (userFreq === null || userFreq <= 0) return false
  const userMidi = freqToMidi(userFreq)
  return Math.abs(userMidi - targetMidi) * 100 < toleranceCents
}
