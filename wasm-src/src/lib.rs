use wasm_bindgen::prelude::*;

/// YIN pitch detection with harmonic disambiguation.
/// When strong harmonics cause two candidate taus in a 2:1 or 3:1 ratio,
/// the lower frequency (larger tau = fundamental) is preferred.
#[wasm_bindgen]
pub fn detect_pitch(
    samples: &[f32],
    sample_rate: f32,
    threshold: f32,
    min_freq: f32,
    max_freq: f32,
) -> f32 {
    let half_len = samples.len() / 2;
    if half_len < 2 {
        return -1.0;
    }

    let min_tau = (sample_rate / max_freq).max(2.0) as usize;
    let max_tau = (sample_rate / min_freq).min(half_len as f32) as usize;

    if min_tau >= max_tau {
        return -1.0;
    }

    // Step 1: Difference function
    let mut diff = vec![0.0f32; max_tau + 1];
    for tau in 1..=max_tau {
        for j in 0..half_len {
            let delta = samples[j] - samples[j + tau];
            diff[tau] += delta * delta;
        }
    }

    // Step 2: Cumulative mean normalized difference
    let mut d_prime = vec![0.0f32; max_tau + 1];
    d_prime[0] = 1.0;
    let mut running_sum = 0.0f32;
    for tau in 1..=max_tau {
        running_sum += diff[tau];
        d_prime[tau] = if running_sum == 0.0 {
            0.0
        } else {
            diff[tau] * tau as f32 / running_sum
        };
    }

    // Step 3: Collect all local-minimum dips below threshold
    let candidates = collect_candidates(&d_prime, min_tau, max_tau, threshold);

    if candidates.is_empty() {
        // Fallback: absolute minimum in range
        let best = d_prime[min_tau..=max_tau]
            .iter()
            .enumerate()
            .min_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i + min_tau)
            .unwrap_or(0);
        if best == 0 {
            return -1.0;
        }
        return sample_rate / parabolic_interpolation(&d_prime, best, max_tau + 1);
    }

    // Step 4: Prefer fundamental over harmonic when 2:1 / 3:1 ratio detected
    let best_tau = select_fundamental(&candidates, &d_prime);
    sample_rate / parabolic_interpolation(&d_prime, best_tau, max_tau + 1)
}

/// Scan for dip minima that fall below `threshold`.
/// Each contiguous below-threshold region contributes exactly one candidate
/// (the sample at the deepest point of that dip).
fn collect_candidates(d_prime: &[f32], min_tau: usize, max_tau: usize, threshold: f32) -> Vec<usize> {
    let mut candidates = Vec::new();
    let mut tau = min_tau;

    while tau < max_tau {
        if d_prime[tau] < threshold {
            // Descend to the minimum of this dip
            while tau + 1 < max_tau && d_prime[tau + 1] < d_prime[tau] {
                tau += 1;
            }
            candidates.push(tau);
            // Advance past this dip (wait for d_prime to rise back above threshold)
            tau += 1;
            while tau < max_tau && d_prime[tau] < threshold {
                tau += 1;
            }
        } else {
            tau += 1;
        }
    }

    candidates
}

/// Given multiple tau candidates (sorted ascending = descending frequency),
/// detect 2:1 or 3:1 harmonic pairs and return the larger tau (lower freq =
/// the fundamental).  Falls back to the candidate with the lowest d' value.
fn select_fundamental(candidates: &[usize], d_prime: &[f32]) -> usize {
    if candidates.len() == 1 {
        return candidates[0];
    }

    // candidates[i] < candidates[j] when i < j  (ascending tau)
    for i in 0..candidates.len() {
        for j in (i + 1)..candidates.len() {
            let tau_hi = candidates[i]; // smaller tau → higher frequency
            let tau_lo = candidates[j]; // larger tau  → lower frequency (likely fundamental)
            let ratio = tau_lo as f32 / tau_hi as f32;
            if (ratio - 2.0).abs() < 0.20 || (ratio - 3.0).abs() < 0.25 {
                // tau_lo is the fundamental; tau_hi is a harmonic
                return tau_lo;
            }
        }
    }

    // No harmonic relationship detected — pick the most confident candidate
    candidates
        .iter()
        .copied()
        .min_by(|&a, &b| d_prime[a].partial_cmp(&d_prime[b]).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or(candidates[0])
}

fn parabolic_interpolation(data: &[f32], tau: usize, len: usize) -> f32 {
    if tau == 0 || tau >= len - 1 {
        return tau as f32;
    }
    let s0 = data[tau - 1];
    let s1 = data[tau];
    let s2 = data[tau + 1];
    let denom = 2.0 * (2.0 * s1 - s2 - s0);
    if denom == 0.0 {
        return tau as f32;
    }
    tau as f32 + (s2 - s0) / denom
}
