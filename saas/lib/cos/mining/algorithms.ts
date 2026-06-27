// saas/lib/cos/mining/algorithms.ts
// Zero-dependency, deterministic mining primitives. Pure functions only — they run
// inside the Vercel cron job over Supabase data. For large-scale runs the same logic
// is mirrored in the external Databricks job (see saas/mining/databricks/).

// ── Deterministic RNG (seeded) so runs are reproducible ─────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function euclidean(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    s += d * d
  }
  return Math.sqrt(s)
}

export interface KMeansResult {
  k: number
  assignments: number[] // cluster index per input row
  distances: number[] // distance to assigned centroid
  centroids: number[][]
  iterations: number
}

/**
 * K-means with k-means++ seeding. `vectors` must all share the same dimensionality.
 * Standardize/scale upstream if feature ranges differ wildly (the pipeline does this).
 */
export function kmeans(
  vectors: number[][],
  k: number,
  opts: { maxIters?: number; seed?: number } = {},
): KMeansResult {
  const maxIters = opts.maxIters ?? 50
  const rng = mulberry32(opts.seed ?? 42)
  const n = vectors.length
  const dim = n > 0 ? vectors[0].length : 0
  const kk = Math.max(1, Math.min(k, n))

  if (n === 0) return { k: 0, assignments: [], distances: [], centroids: [], iterations: 0 }

  // k-means++ initialization
  const centroids: number[][] = []
  centroids.push(vectors[Math.floor(rng() * n)].slice())
  while (centroids.length < kk) {
    const d2 = vectors.map((v) => {
      let best = Infinity
      for (const c of centroids) best = Math.min(best, euclidean(v, c) ** 2)
      return best
    })
    const sum = d2.reduce((a, b) => a + b, 0) || 1
    let r = rng() * sum
    let idx = 0
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r <= 0) { idx = i; break }
    }
    centroids.push(vectors[idx].slice())
  }

  const assignments = new Array(n).fill(0)
  const distances = new Array(n).fill(0)
  let iterations = 0

  for (let iter = 0; iter < maxIters; iter++) {
    iterations = iter + 1
    let moved = false

    // Assign
    for (let i = 0; i < n; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const d = euclidean(vectors[i], centroids[c])
        if (d < bestD) { bestD = d; best = c }
      }
      if (assignments[i] !== best) moved = true
      assignments[i] = best
      distances[i] = bestD
    }

    // Update
    const sums = centroids.map(() => new Array(dim).fill(0))
    const counts = centroids.map(() => 0)
    for (let i = 0; i < n; i++) {
      const c = assignments[i]
      counts[c]++
      for (let d = 0; d < dim; d++) sums[c][d] += vectors[i][d]
    }
    for (let c = 0; c < centroids.length; c++) {
      if (counts[c] === 0) continue // keep empty centroid as-is
      for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c]
    }

    if (!moved && iter > 0) break
  }

  return { k: centroids.length, assignments, distances, centroids, iterations }
}

// ── Apriori association rules ───────────────────────────────────────────────
export interface AprioriRule {
  antecedent: string[]
  consequent: string[]
  support: number
  confidence: number
  lift: number
}

function key(items: string[]): string {
  return items.slice().sort().join('\u0001')
}

/**
 * Apriori over a list of transactions (each a set of item labels).
 * Returns rules with support >= minSupport and confidence >= minConfidence.
 * `maxLen` caps itemset size to keep the candidate space bounded.
 */
export function apriori(
  transactions: string[][],
  minSupport = 0.05,
  minConfidence = 0.5,
  maxLen = 3,
): AprioriRule[] {
  const T = transactions.map((t) => Array.from(new Set(t)))
  const N = T.length
  if (N === 0) return []

  const supportCount = new Map<string, number>()
  const itemsetsByLen: string[][][] = []

  // L1
  const singles = new Map<string, string[]>()
  for (const t of T) for (const it of t) singles.set(key([it]), [it])
  let current: string[][] = []
  for (const s of singles.values()) {
    const c = T.filter((t) => t.includes(s[0])).length
    if (c / N >= minSupport) { current.push(s); supportCount.set(key(s), c) }
  }
  itemsetsByLen[1] = current

  // Lk
  for (let len = 2; len <= maxLen && current.length > 0; len++) {
    const candidates = new Map<string, string[]>()
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const union = Array.from(new Set([...current[i], ...current[j]])).sort()
        if (union.length === len) candidates.set(key(union), union)
      }
    }
    const next: string[][] = []
    for (const cand of candidates.values()) {
      const c = T.filter((t) => cand.every((it) => t.includes(it))).length
      if (c / N >= minSupport) { next.push(cand); supportCount.set(key(cand), c) }
    }
    itemsetsByLen[len] = next
    current = next
  }

  // Rule generation from itemsets of size >= 2
  const rules: AprioriRule[] = []
  for (let len = 2; len < itemsetsByLen.length; len++) {
    for (const set of itemsetsByLen[len] || []) {
      const setSup = (supportCount.get(key(set)) || 0) / N
      // each non-empty proper subset -> complement
      const subsets = properSubsets(set)
      for (const ante of subsets) {
        const cons = set.filter((x) => !ante.includes(x))
        if (cons.length === 0) continue
        const anteSup = (supportCount.get(key(ante)) || 0) / N
        const consSup = (supportCount.get(key(cons)) || 0) / N
        if (anteSup <= 0) continue
        const confidence = setSup / anteSup
        if (confidence < minConfidence) continue
        const lift = consSup > 0 ? confidence / consSup : 0
        rules.push({ antecedent: ante, consequent: cons, support: setSup, confidence, lift })
      }
    }
  }
  rules.sort((a, b) => b.confidence - a.confidence || b.lift - a.lift)
  return rules
}

function properSubsets(items: string[]): string[][] {
  const out: string[][] = []
  const n = items.length
  for (let mask = 1; mask < (1 << n) - 1; mask++) {
    const s: string[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(items[i])
    out.push(s)
  }
  return out
}

// ── Linear regression (trend) ───────────────────────────────────────────────
export interface Trend {
  slope: number
  intercept: number
  r2: number
  n: number
}

/** Ordinary least squares over (x, y) points. Used for amount-over-time trends. */
export function linearRegression(points: Array<{ x: number; y: number }>): Trend {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0].y : 0, r2: 0, n }
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0
  for (const p of points) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y }
  const denom = n * sxx - sx * sx
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  const rDenom = Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy))
  const r = rDenom === 0 ? 0 : (n * sxy - sx * sy) / rDenom
  return { slope, intercept, r2: r * r, n }
}
