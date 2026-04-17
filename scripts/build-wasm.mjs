#!/usr/bin/env node
/**
 * Build the Rust WASM pitch detector via wasm-pack.
 * Requires: wasm-pack  https://rustwasm.github.io/wasm-pack/installer/
 *   cargo install wasm-pack
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const wasmSrc = resolve(root, 'wasm-src')
const outDir = resolve(root, 'src', 'wasm')

// Check wasm-pack is available
try {
  execSync('wasm-pack --version', { stdio: 'ignore' })
} catch {
  console.error('Error: wasm-pack not found.')
  console.error('Install with:  cargo install wasm-pack')
  process.exit(1)
}

if (!existsSync(wasmSrc)) {
  console.error(`Error: wasm-src directory not found at ${wasmSrc}`)
  process.exit(1)
}

console.log('Building Rust WASM pitch detector…')
execSync(
  `wasm-pack build --target web --out-dir "${outDir}" --out-name pitch_detector`,
  { cwd: wasmSrc, stdio: 'inherit' }
)

console.log(`\nWASM build complete → src/wasm/`)
