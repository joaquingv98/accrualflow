import OpenAI from 'openai';
import type { ConfidenceBand } from './matching';

export interface NormalizedOpenAccrual {
  supplier: string;
  service: string;
  period: string;
  amount: number | null;
  owner: string;
  account: string;
  status: string;
  raw_comment: string;
  normalization_confidence: ConfidenceBand;
}

export interface NormalizedProvisionRequest {
  supplier: string;
  service: string;
  period: string;
  requested_amount: number | null;
  owner: string;
  department: string;
  comment: string;
  normalization_confidence: ConfidenceBand;
}

const OPEN_SCHEMA = `
Cada objeto debe tener exactamente:
supplier (string),
service (string),
period (string) — período/devengo o mes en formato legible si se deduce,
amount (number|null) — importe abierto/acumulador del devengo,
owner (string),
account (string),
status (string) — usar "open" si no está claro,
raw_comment (string) — texto libre/colillas relevantes del origen,
normalization_confidence: "high" | "medium" | "low"
`.trim();

const PROVISION_SCHEMA = `
Cada objeto debe tener exactamente:
supplier (string),
service (string),
period (string),
requested_amount (number|null),
owner (string),
department (string),
comment (string),
normalization_confidence: "high" | "medium" | "low"
`.trim();

const SYS_OPEN = `Eres analista financiero normalizando filas sobre devengos contables ABIERTOS (provisiones/registros pendientes).
Las columnas del CSV/Excel pueden tener nombres distintos — infiere el campo correcto sin inventar importes ni proveedores inexistentes.
Si un dato no está en la fila, usa "" o null según aplique.

${OPEN_SCHEMA}

Responde SOLO JSON: { "normalized": [ ... ] } con el MISMO número de elementos y orden que las filas de entrada.
`;

const SYS_PROVISION = `Eres analista financiero normalizando SOLICITUDES de provisión/devengo.
Las columnas pueden variar — mapea a los campos canónicos sin inventar datos económicos.

${PROVISION_SCHEMA}

Responde SOLO JSON: { "normalized": [ ... ] } con el MISMO número de elementos y orden que las filas de entrada.
`;

function parseJson(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return JSON.parse(t) as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

function confOrMed(v: unknown): ConfidenceBand {
  const s = String(v ?? '').toLowerCase();
  if (s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

function coerceOpen(raw: Record<string, unknown>): NormalizedOpenAccrual {
  return {
    supplier: String(raw.supplier ?? ''),
    service: String(raw.service ?? ''),
    period: String(raw.period ?? ''),
    amount: numOrNull(raw.amount),
    owner: String(raw.owner ?? ''),
    account: String(raw.account ?? ''),
    status: String(raw.status ?? 'open') || 'open',
    raw_comment: String(raw.raw_comment ?? ''),
    normalization_confidence: confOrMed(raw.normalization_confidence),
  };
}

function coerceProvision(raw: Record<string, unknown>): NormalizedProvisionRequest {
  return {
    supplier: String(raw.supplier ?? ''),
    service: String(raw.service ?? ''),
    period: String(raw.period ?? ''),
    requested_amount: numOrNull(raw.requested_amount ?? raw.amount),
    owner: String(raw.owner ?? ''),
    department: String(raw.department ?? ''),
    comment: String(raw.comment ?? ''),
    normalization_confidence: confOrMed(raw.normalization_confidence),
  };
}

const DEFAULT_OPEN: NormalizedOpenAccrual = {
  supplier: '',
  service: '',
  period: '',
  amount: null,
  owner: '',
  account: '',
  status: 'open',
  raw_comment: '',
  normalization_confidence: 'low',
};

const DEFAULT_PROV: NormalizedProvisionRequest = {
  supplier: '',
  service: '',
  period: '',
  requested_amount: null,
  owner: '',
  department: '',
  comment: '',
  normalization_confidence: 'low',
};

const CHUNK = 22;

export async function normalizeOpenAccrualsWithOpenAI(
  client: OpenAI,
  rows: Record<string, string>[],
): Promise<NormalizedOpenAccrual[]> {
  if (!rows.length) return [];
  const out: NormalizedOpenAccrual[] = [];
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const user = JSON.stringify({ rows: slice });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYS_OPEN },
        {
          role: 'user',
          content: `Filas entrada (Índices relativos al bloque):\n${user}`,
        },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(content);
    const arr = Array.isArray(parsed.normalized) ? (parsed.normalized as Record<string, unknown>[]) : [];
    for (let j = 0; j < slice.length; j++) {
      out.push(arr[j] ? coerceOpen(arr[j]) : { ...DEFAULT_OPEN, raw_comment: 'Normalización incompleta' });
    }
  }
  return out;
}

export async function normalizeProvisionRequestsWithOpenAI(
  client: OpenAI,
  rows: Record<string, string>[],
): Promise<NormalizedProvisionRequest[]> {
  if (!rows.length) return [];
  const out: NormalizedProvisionRequest[] = [];
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const user = JSON.stringify({ rows: slice });
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYS_PROVISION },
        { role: 'user', content: `Filas entrada:\n${user}` },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJson(content);
    const arr = Array.isArray(parsed.normalized) ? (parsed.normalized as Record<string, unknown>[]) : [];
    for (let j = 0; j < slice.length; j++) {
      out.push(arr[j] ? coerceProvision(arr[j]) : { ...DEFAULT_PROV, comment: 'Normalización incompleta' });
    }
  }
  return out;
}

const SYS_AMBIGUOUS = `Comparas un registro objetivo vs un candidato (factura, devengo abierto u otra solicitud).
Decides si económicamente describen EL MISMO hecho (mismo proveedor/concepto-período razonable).
Responde SOLO JSON: { "same_entity": boolean, "match_confidence": "high"|"medium"|"low", "reason": string corto }.`;

export async function resolveAmbiguousMatchWithOpenAI(
  client: OpenAI,
  kind: string,
  target: Record<string, unknown>,
  candidate: Record<string, unknown>,
): Promise<{ same_entity: boolean; match_confidence: ConfidenceBand; reason: string }> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYS_AMBIGUOUS },
      {
        role: 'user',
        content: `Contexto: ${kind}\nObjetivo:\n${JSON.stringify(target)}\nCandidato:\n${JSON.stringify(candidate)}`,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content ?? '{}';
  const p = parseJson(content);
  const match_confidence = confOrMed(p.match_confidence);
  return {
    same_entity: Boolean(p.same_entity),
    match_confidence,
    reason: String(p.reason ?? ''),
  };
}
