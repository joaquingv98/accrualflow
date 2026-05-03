/**
 * Derivados del MVP: antigüedad, preguntas a owners, marcadores de política.
 * TODO: permitir que el usuario configure reglas de política.
 * TODO: enviar preguntas a owners por email o Slack.
 * TODO: workflow aprobación/rechazo sobre acciones recomendadas.
 * TODO: trazabilidad de auditoría con decisiones del usuario.
 * TODO: enlazar pack de cierre con formatos de export a ERP.
 * FIXME: las recomendaciones no son asientos contables.
 * FIXME: reglas del comprobador en duro solo para MVP; revisar antes de producción.
 */

export type NormConf = 'high' | 'medium' | 'low';

export type NormalizedOpenAccrual = {
  supplier: string;
  service: string;
  period: string;
  amount: number | null;
  owner: string;
  account: string;
  status: string;
  raw_comment: string;
  normalization_confidence: NormConf;
};

export type RecommendedAction = {
  action: string;
  supplier: string;
  service: string;
  period: string;
  invoice_amount: number | null;
  open_accrual_amount: number | null;
  provision_request_amount: number | null;
  recommended_amount: number | null;
  confidence: NormConf;
  reason: string;
};

export type AgingRow = {
  supplier: string;
  service: string;
  period: string;
  amount: number | null;
  age_bucket: '0-30 días' | '31-60 días' | '61-90 días' | '>90 días' | 'desconocido';
  risk_level: 'normal' | 'revisión' | 'riesgo' | 'urgente' | 'desconocido';
  reason: string;
};

export type OwnerQuestionRow = {
  action: string;
  supplier: string;
  service: string;
  period: string;
  amountLabel: string;
  question: string;
};

const MS_DAY = 86_400_000;

const MONTH_MAP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11,
};

function endOfMonth(year: number, monthIndex0: number): Date {
  return new Date(year, monthIndex0 + 1, 0);
}

/** Fin de mes desde textos tipo "April 2026", "2026-04", "Abril 2026". */
export function parseClosingMonthEnd(label: string): Date | null {
  const raw = label.trim();
  if (!raw) return null;

  const ym = raw.match(/(\d{4})-(\d{1,2})(?:-|\/|$)/);
  if (ym) {
    const y = parseInt(ym[1], 10);
    const m = parseInt(ym[2], 10);
    if (y > 1900 && m >= 1 && m <= 12) return endOfMonth(y, m - 1);
  }

  const t = raw.toLowerCase().replace(/,/g, ' ');
  const parts = t.split(/\s+/).filter(Boolean);
  let monthIdx: number | undefined;
  let year: number | undefined;
  for (const p of parts) {
    const mi = MONTH_MAP[p];
    if (mi !== undefined) monthIdx = mi;
    if (/^20\d{2}$/.test(p)) year = parseInt(p, 10);
  }
  if (monthIdx !== undefined && year !== undefined) return endOfMonth(year, monthIdx);

  const ts = Date.parse(raw);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return endOfMonth(d.getFullYear(), d.getMonth());
  }
  return null;
}

export function parsePeriodEnd(period: string): Date | null {
  if (!period?.trim()) return null;
  const iso = period.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10) - 1;
    const day = parseInt(iso[3], 10);
    const d = new Date(y, m, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return parseClosingMonthEnd(period);
}

function normSupplier(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function suppliersLooselyMatch(a: string, b: string): boolean {
  const na = normSupplier(a);
  const nb = normSupplier(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function bucketFromDays(days: number): Pick<AgingRow, 'age_bucket' | 'risk_level' | 'reason'> {
  if (days <= 30) {
    return {
      age_bucket: '0-30 días',
      risk_level: 'normal',
      reason: 'Antigüedad dentro de 30 días desde fin de periodo vs cierre — seguimiento habitual.',
    };
  }
  if (days <= 60) {
    return {
      age_bucket: '31-60 días',
      risk_level: 'revisión',
      reason: 'Devengo abierto entre 31 y 60 días — programa revisión antes del cierre.',
    };
  }
  if (days <= 90) {
    return {
      age_bucket: '61-90 días',
      risk_level: 'riesgo',
      reason: 'Entre 61 y 90 días — mayor riesgo; confirma servicio y evidencia.',
    };
  }
  return {
    age_bucket: '>90 días',
    risk_level: 'urgente',
    reason: 'Más de 90 días — revisión urgente; el comprobador de políticas puede marcar «Revisión urgente».',
  };
}

export function buildAgingReviewRows(
  openAccruals: NormalizedOpenAccrual[],
  closingMonthLabel: string,
): AgingRow[] {
  const ref = parseClosingMonthEnd(closingMonthLabel) ?? new Date();

  return openAccruals.map((oa) => {
    const periodEnd = parsePeriodEnd(oa.period);
    if (!periodEnd) {
      return {
        supplier: oa.supplier,
        service: oa.service,
        period: oa.period,
        amount: oa.amount,
        age_bucket: 'desconocido',
        risk_level: 'desconocido',
        reason: 'No se pudo interpretar la fecha de periodo — define un periodo de servicio claro para calcular antigüedad.',
      };
    }
    const rawDays = Math.floor((ref.getTime() - periodEnd.getTime()) / MS_DAY);
    const days = Math.max(0, rawDays);
    const b = bucketFromDays(days);
    return {
      supplier: oa.supplier,
      service: oa.service,
      period: oa.period,
      amount: oa.amount,
      ...b,
    };
  });
}

function formatAmountForQuestion(n: number | null): string {
  if (n == null || Number.isNaN(n)) return 'el importe propuesto';
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return String(n);
  }
}

export function buildOwnerQuestionRows(actions: RecommendedAction[]): OwnerQuestionRow[] {
  const out: OwnerQuestionRow[] = [];
  for (const r of actions) {
    const sup = r.supplier || 'el proveedor';
    const svc = r.service || 'el servicio';
    const per = r.period || 'el periodo';
    const amt = formatAmountForQuestion(
      r.recommended_amount ?? r.open_accrual_amount ?? r.provision_request_amount,
    );

    if (r.action === 'ask_owner') {
      out.push({
        action: r.action,
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        amountLabel: amt,
        question: `¿Confirmas si el servicio «${svc}» de «${sup}» para «${per}» fue entregado y si el devengo de ${amt} debe mantenerse abierto?`,
      });
    } else if (r.action === 'manual_review') {
      out.push({
        action: r.action,
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        amountLabel: amt,
        question: `¿Puedes aclarar el periodo de prestación del servicio y el importe esperado para «${sup}» / «${svc}»?`,
      });
    } else if (r.action === 'new_accrual') {
      out.push({
        action: r.action,
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        amountLabel: amt,
        question: `¿Confirmas que «${svc}» fue prestado en «${per}» y que ${amt} deben devengar?`,
      });
    }
  }
  return out;
}

export type PolicyFlagCode =
  | 'Revisión urgente'
  | 'Falta evidencia del owner'
  | 'Revisión contable requerida'
  | 'Periodo no identificado';

export function findMatchingOpenAccrual(
  r: RecommendedAction,
  openAccruals: NormalizedOpenAccrual[],
): NormalizedOpenAccrual | null {
  for (const oa of openAccruals) {
    if (!suppliersLooselyMatch(r.supplier, oa.supplier)) continue;
    return oa;
  }
  return null;
}

export function policyFlagsForRecommendation(
  r: RecommendedAction,
  openAccruals: NormalizedOpenAccrual[],
  closingMonthLabel: string,
): PolicyFlagCode[] {
  const flags: PolicyFlagCode[] = [];
  const ref = parseClosingMonthEnd(closingMonthLabel) ?? new Date();

  if (!r.period?.trim()) flags.push('Periodo no identificado');
  if (r.action === 'manual_review') flags.push('Revisión contable requerida');

  const oa = findMatchingOpenAccrual(r, openAccruals);
  if (oa) {
    const periodEnd = parsePeriodEnd(oa.period);
    if (periodEnd) {
      const days = Math.max(0, Math.floor((ref.getTime() - periodEnd.getTime()) / MS_DAY));
      if (days > 90) flags.push('Revisión urgente');
    }
    const amt = oa.amount ?? 0;
    const hasOwner = !!oa.owner?.trim();
    const hasComment = !!oa.raw_comment?.trim();
    if (amt > 5000 && !hasOwner && !hasComment) flags.push('Falta evidencia del owner');
  }

  return [...new Set(flags)];
}

export type PolicyFlagRow = {
  recommendation_index: number;
  supplier: string;
  service: string;
  action: string;
  flags: string;
};

export function buildPolicyFlagRows(
  actions: RecommendedAction[],
  openAccruals: NormalizedOpenAccrual[],
  closingMonthLabel: string,
): PolicyFlagRow[] {
  return actions.map((r, i) => ({
    recommendation_index: i + 1,
    supplier: r.supplier,
    service: r.service,
    action: r.action,
    flags: policyFlagsForRecommendation(r, openAccruals, closingMonthLabel).join(', ') || '—',
  }));
}
