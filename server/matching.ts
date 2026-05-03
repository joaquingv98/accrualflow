// TODO: add embeddings for better semantic matching across supplier/service/period texto libre.

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface MatchScoreThresholds {
  high: number;
  medium: number;
}

export interface MatchScoreResult {
  score: number;
  confidence: ConfidenceBand;
}

function parseEnvFloat(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) ? v : fallback;
}

/** Umbrales de score (override con MATCH_SCORE_HIGH / MATCH_SCORE_MEDIUM). */
export function getMatchScoreThresholds(): MatchScoreThresholds {
  const high = parseEnvFloat('MATCH_SCORE_HIGH', 70);
  let medium = parseEnvFloat('MATCH_SCORE_MEDIUM', 40);
  const h = Math.max(1, Math.min(high, 100));
  medium = Math.max(1, Math.min(medium, h));
  return { high: h, medium: medium };
}

/** Tolerancia relativa y mínimo absoluto (€ o misma moneda del dato). */
export function getAmountTolerance(): { relative: number; absMin: number } {
  return {
    relative: parseEnvFloat('MATCH_AMOUNT_REL_TOLERANCE', 0.08),
    absMin: parseEnvFloat('MATCH_AMOUNT_ABS_MIN', 50),
  };
}

/** Diferencia material entre dos importes → revisión manual cuando ambos existen. */
export function amountsMaterialMismatch(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  const maxAbs = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  const diff = Math.abs(a - b);
  const rel = diff / maxAbs;
  const { relative, absMin } = getAmountTolerance();
  return rel > relative && diff > absMin;
}

/** Simple Levenshtein ratio in [0,1]. */
export function stringSimilarity(aRaw: string, bRaw: string): number {
  const a = normText(aRaw);
  const b = normText(bRaw);
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  const lev = levenshtein(a, b);
  const denom = Math.max(a.length, b.length);
  return denom === 0 ? 1 : 1 - lev / denom;
}

export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function pad2(n: string): string {
  return n.length >= 2 ? n.slice(-2) : n.padStart(2, '0');
}

/** Claves yyyy-mm y año único para mejorar cruces cuando el texto difiere pero el período coincide. */
export function canonicalPeriodKey(raw: string): string {
  if (!raw?.trim()) return '';
  const slots = new Set<string>();
  const s = raw.toLowerCase();

  let m: RegExpExecArray | null;
  const reYm = /\b(20\d{2}|19\d{2})-(\d{1,2})\b/g;
  while ((m = reYm.exec(s)) !== null) {
    slots.add(`${m[1]}-${pad2(m[2]!)}`);
  }
  const reMy = /\b(\d{1,2})[/-](20\d{2}|19\d{2})\b/g;
  while ((m = reMy.exec(s)) !== null) {
    slots.add(`${m[2]}-${pad2(m[1]!)}`);
  }
  const reDmy = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2}|19\d{2})\b/g;
  while ((m = reDmy.exec(s)) !== null) {
    slots.add(`${m[3]}-${pad2(m[2]!)}`);
  }

  const monthYear = [
    ['enero', '01'],
    ['febrero', '02'],
    ['marzo', '03'],
    ['abril', '04'],
    ['mayo', '05'],
    ['junio', '06'],
    ['julio', '07'],
    ['agosto', '08'],
    ['septiembre', '09'],
    ['octubre', '10'],
    ['noviembre', '11'],
    ['diciembre', '12'],
    ['january', '01'],
    ['february', '02'],
    ['march', '03'],
    ['april', '04'],
    ['may', '05'],
    ['june', '06'],
    ['july', '07'],
    ['august', '08'],
    ['september', '09'],
    ['october', '10'],
    ['november', '11'],
    ['december', '12'],
  ] as const;
  for (const [mon, mm] of monthYear) {
    const re = new RegExp(`\\b${mon}\\s+(20\\d{2}|19\\d{2})\\b`, 'g');
    while ((m = re.exec(s)) !== null) {
      slots.add(`${m[1]}-${mm}`);
    }
    const re2 = new RegExp(`\\b(20\\d{2}|19\\d{2})\\s+${mon}\\b`, 'g');
    while ((m = re2.exec(s)) !== null) {
      slots.add(`${m[1]}-${mm}`);
    }
  }

  const years = new Set<string>();
  const yearScan = /\b(20\d{2}|19\d{2})\b/g;
  while ((m = yearScan.exec(s)) !== null) {
    years.add(m[1]!);
  }

  const ordered = [...slots].sort();
  if (!ordered.length && years.size === 1) {
    return `y:${[...years][0]}`;
  }
  if (!ordered.length && years.size > 1) {
    return `y:${[...years].sort().join(',')}`;
  }
  return ordered.join('|');
}

function periodSimilarity(aRaw: string, bRaw: string): number {
  const base = stringSimilarity(aRaw, bRaw);
  const ckA = canonicalPeriodKey(aRaw);
  const ckB = canonicalPeriodKey(bRaw);
  if (!ckA || !ckB) return base;
  if (ckA === ckB) return Math.max(base, 0.97);
  const ckJoin = [ckA.replace(/\|/g, ' '), ckB.replace(/\|/g, ' ')];
  return Math.max(base, stringSimilarity(ckJoin[0]!, ckJoin[1]!) * 0.95);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

export function amountSimilarity(a: number | null, b: number | null): number {
  if (a == null || b == null) return 0;
  const x = Math.abs(a);
  const y = Math.abs(b);
  if (x < 1e-9 && y < 1e-9) return 1;
  const rel = Math.abs(a - b) / Math.max(x, y, 1e-9);
  if (rel < 0.005) return 1;
  if (rel < 0.02) return 0.85;
  if (rel < 0.05) return 0.5;
  if (rel < 0.15) return 0.25;
  return 0;
}

/**
 * Matching score weights (sum max 100):
 * + supplier 40 + service 30 + period 20 + amount 10
 */
export function computeEntityMatchScore(
  parts: {
    supplierA: string;
    serviceA: string;
    periodA: string;
    amountA: number | null;
    supplierB: string;
    serviceB: string;
    periodB: string;
    amountB: number | null;
  },
  thresholds?: Pick<MatchScoreThresholds, 'high' | 'medium'>,
): MatchScoreResult {
  const thr = thresholds ?? getMatchScoreThresholds();
  const supplier = stringSimilarity(parts.supplierA, parts.supplierB) * 40;
  const service = stringSimilarity(parts.serviceA, parts.serviceB) * 30;
  const period = periodSimilarity(parts.periodA, parts.periodB) * 20;
  const amount = amountSimilarity(parts.amountA, parts.amountB) * 10;
  const score = supplier + service + period + amount;
  const confidence: ConfidenceBand =
    score >= thr.high ? 'high' : score >= thr.medium ? 'medium' : 'low';
  return { score, confidence };
}

export function minConfidence(a: ConfidenceBand, b: ConfidenceBand): ConfidenceBand {
  const order: Record<ConfidenceBand, number> = { high: 2, medium: 1, low: 0 };
  return order[a] <= order[b] ? a : b;
}
