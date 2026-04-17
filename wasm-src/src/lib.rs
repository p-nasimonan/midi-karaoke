use wasm_bindgen::prelude::*;

/// YIN pitch detection algorithm with frequency bounds.
#[wasm_bindgen]
pub fn detect_pitch(
    samples: &[f32], 
    sample_rate: f32, 
    threshold: f32, 
    min_freq: f32, // 例: 80.0 (Hz)
    max_freq: f32  // 例: 1000.0 (Hz)
) -> f32 {
    let half_len = samples.len() / 2;
    if half_len < 2 {
        return -1.0;
    }

    // 周波数から探索すべき周期(tau)の範囲を計算
    let min_tau = (sample_rate / max_freq).max(2.0) as usize;
    let max_tau = (sample_rate / min_freq).min(half_len as f32) as usize;

    if min_tau >= max_tau {
        return -1.0;
    }

    // Step 1: Difference function (必要な範囲だけ計算して最適化)
    let mut diff = vec![0.0f32; max_tau];
    for tau in 1..max_tau {
        for j in 0..half_len {
            let delta = samples[j] - samples[j + tau];
            diff[tau] += delta * delta;
        }
    }

    // Step 2: Cumulative mean normalized difference
    let mut d_prime = vec![0.0f32; max_tau];
    d_prime[0] = 1.0;
    let mut running_sum = 0.0f32;
    for tau in 1..max_tau {
        running_sum += diff[tau];
        d_prime[tau] = if running_sum == 0.0 {
            0.0
        } else {
            diff[tau] * tau as f32 / running_sum
        };
    }

    // Step 3: Absolute threshold (制限した範囲内のみを探索)
    let mut tau = min_tau;
    while tau < max_tau {
        if d_prime[tau] < threshold {
            while tau + 1 < max_tau && d_prime[tau + 1] < d_prime[tau] {
                tau += 1;
            }
            let better_tau = parabolic_interpolation(&d_prime, tau, max_tau);
            return sample_rate / better_tau;
        }
        tau += 1;
    }

    // Fallback: 指定範囲内での絶対的な最小値を探す
    let (best_tau, _) = d_prime[min_tau..max_tau]
        .iter()
        .enumerate()
        .min_by(|a, b| a.1.partial_cmp(b.1).unwrap())
        .map(|(i, v)| (i + min_tau, *v))
        .unwrap_or((0, 1.0));

    if best_tau == 0 {
        return -1.0;
    }
    
    sample_rate / parabolic_interpolation(&d_prime, best_tau, max_tau)
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