export interface NoteBar {
  startTime: number   // seconds
  endTime: number     // seconds
  midi: number        // MIDI note number 0-127
  velocity: number    // 0-1
  lyric?: string
}

export interface LyricEvent {
  time: number
  text: string
}

export interface RendererState {
  currentTime: number
  notes: NoteBar[]
  lyrics: LyricEvent[]
  userFrequency: number | null  // Hz from mic
  isPlaying: boolean
  scorePercent: number
}

export interface RendererOptions {
  visibleTimeRange: number   // seconds of notes visible on screen (default 4)
  playheadX: number          // 0-1, fraction from left where playhead sits
  minMidi: number
  maxMidi: number
}
