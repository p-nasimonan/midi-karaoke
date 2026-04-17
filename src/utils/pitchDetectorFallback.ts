/**
 * Pure TypeScript YIN pitch detection algorithm.
 * Used as fallback when WASM is unavailable.
 * Reference: De Cheveigné & Kawahara (2002)
 */
export function detectPitchYIN(buffer: Float32Array, sampleRate: number, threshold = 0.15): number {
  const halfLen = Math.floor(buffer.length / 2)

  // Step 1: Difference function
  const diff = new Float32Array(halfLen)
  for (let tau = 1; tau < halfLen; tau++) {
    for (let j = 0; j < halfLen; j++) {
      const delta = buffer[j] - buffer[j + tau]
      diff[tau] += delta * delta
    }
  }

  // Step 2: Cumulative mean normalized difference
  const dPrime = new Float32Array(halfLen)
  dPrime[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += diff[tau]
    dPrime[tau] = runningSum === 0 ? 0 : diff[tau] * tau / runningSum
  }

  // Step 3: Find first minimum below threshold
  let tau = 2
  while (tau < halfLen) {
    if (dPrime[tau] < threshold) {
      // Walk to local minimum
      while (tau + 1 < halfLen && dPrime[tau + 1] < dPrime[tau]) {
        tau++
      }
      // Step 5: Parabolic interpolation
      const betterTau = parabolicInterpolation(dPrime, tau, halfLen)
      return sampleRate / betterTau
    }
    tau++
  }

  // Fallback: return absolute minimum
  let minVal = Infinity
  let minTau = -1
  for (let i = 2; i < halfLen; i++) {
    if (dPrime[i] < minVal) {
      minVal = dPrime[i]
      minTau = i
    }
  }
  if (minTau < 0) return -1
  return sampleRate / parabolicInterpolation(dPrime, minTau, halfLen)
}

function parabolicInterpolation(data: Float32Array, tau: number, len: number): number {
  if (tau <= 0 || tau >= len - 1) return tau
  const s0 = data[tau - 1]
  const s1 = data[tau]
  const s2 = data[tau + 1]
  const denom = 2 * (2 * s1 - s2 - s0)
  if (denom === 0) return tau
  return tau + (s2 - s0) / denom
}

/** Compute RMS power level of buffer (0-1). Used to gate pitch detection on silence. */
export function computeRMS(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i]
  }
  return Math.sqrt(sum / buffer.length)
}
