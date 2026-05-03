import OpenAI from 'openai';
import type { InvoiceAiRow } from './types';
import {
  amountsMaterialMismatch,
  computeEntityMatchScore,
  getMatchScoreThresholds,
  minConfidence,
  type ConfidenceBand,
  type MatchScoreThresholds,
} from './matching';
import {
  resolveAmbiguousMatchWithOpenAI,
  type NormalizedOpenAccrual,
  type NormalizedProvisionRequest,
} from './tabularNormalize';

/**
 * FIXME: no considerar las acciones recomendadas como asientos contables ya registrados.
 * FIXME: reglas del comprobador (si se conectan desde la UI) en duro solo para MVP; revisar antes de producción.
 */

export interface RecommendedAction {
  action:
    | 'no_accrual_needed'
    | 'new_accrual'
    | 'maintain_existing_accrual'
    | 'possible_reversal'
    | 'partial_reversal'
    | 'reversal_plus_adjustment'
    | 'ask_owner'
    | 'manual_review';
  supplier: string;
  service: string;
  period: string;
  invoice_amount: number | null;
  open_accrual_amount: number | null;
  provision_request_amount: number | null;
  recommended_amount: number | null;
  confidence: ConfidenceBand;
  reason: string;
}

function invoicePeriod(inv: InvoiceAiRow): string {
  const accr =
    inv.accrual_month_or_period && inv.accrual_month_or_period !== 'not identified'
      ? inv.accrual_month_or_period
      : '';
  const range = [inv.service_period_start, inv.service_period_end].filter(Boolean).join(' → ');
  const combined = [accr, range].filter(Boolean).join(' ');
  return combined.trim();
}

/** Override con INVOICE_MATCH_AMOUNT_FIELD=base|total para alinear contra base imponible. */
function invoiceAmountForMatch(inv: InvoiceAiRow): number | null {
  const mode = (process.env.INVOICE_MATCH_AMOUNT_FIELD ?? 'total').toLowerCase();
  if (mode === 'base') return inv.base_amount ?? inv.total_amount;
  return inv.total_amount ?? inv.base_amount;
}

interface InvSlice {
  idx: number;
  supplier: string;
  service: string;
  period: string;
  amount: number | null;
}

export function invoicesToSlices(results: InvoiceAiRow[]): InvSlice[] {
  return results.map((inv, idx) => ({
    idx,
    supplier: inv.supplier_name ?? '',
    service: inv.concept_summary ?? '',
    period: invoicePeriod(inv),
    amount: invoiceAmountForMatch(inv),
  }));
}

async function resolveMatch(
  client: OpenAI | null,
  kindLabel: string,
  target: { supplier: string; service: string; period: string; amount: number | null },
  candidateRecord: Record<string, unknown>,
  rawScore: number,
  thresholds: MatchScoreThresholds,
): Promise<{ effectiveHigh: boolean; effectiveConfidence: ConfidenceBand; aiReason?: string }> {
  let effectiveConfidence: ConfidenceBand =
    rawScore >= thresholds.high ? 'high' : rawScore >= thresholds.medium ? 'medium' : 'low';
  let effectiveHigh = rawScore >= thresholds.high;

  if (rawScore >= thresholds.medium && rawScore < thresholds.high && client) {
    const ai = await resolveAmbiguousMatchWithOpenAI(
      client,
      kindLabel,
      target as unknown as Record<string, unknown>,
      candidateRecord,
    );
    if (ai.same_entity && ai.match_confidence === 'high') {
      effectiveHigh = true;
      effectiveConfidence = 'high';
    } else if (ai.same_entity && ai.match_confidence === 'medium') {
      effectiveConfidence = 'medium';
    } else {
      effectiveConfidence = 'low';
      effectiveHigh = false;
    }
    return { effectiveHigh, effectiveConfidence, aiReason: ai.reason };
  }

  if (rawScore >= thresholds.medium && rawScore < thresholds.high && !client) {
    effectiveConfidence = 'medium';
    effectiveHigh = false;
  }

  return { effectiveHigh, effectiveConfidence };
}

function candInvoiceRecord(inv: InvSlice): Record<string, unknown> {
  return {
    supplier: inv.supplier,
    service_or_concept: inv.service,
    period: inv.period,
    total_amount: inv.amount,
  };
}

function invoiceNeedsReviewBeforeReversal(inv: InvoiceAiRow | undefined): boolean {
  if (!inv) return false;
  if (inv.requires_manual_review) return true;
  const c = (inv.period_detection_confidence ?? '').toLowerCase();
  if (c === 'low' || c === 'not_detected') return true;
  if (inv.raw_extraction_quality === 'unreadable') return true;
  return false;
}

/** Misma lógica de umbral relativo que en buildOaInvoiceRows (OA vs importe factura). */
function classifyOaInvoiceReversal(
  invAmt: number | null,
  oaAmt: number | null,
): Pick<RecommendedAction, 'action' | 'recommended_amount'> {
  let action: RecommendedAction['action'] = 'possible_reversal';
  let recommended_amount: number | null = null;
  const eps =
    invAmt != null && oaAmt != null ? 0.005 * Math.max(Math.abs(invAmt), Math.abs(oaAmt), 1) : 0;
  if (invAmt != null && oaAmt != null) {
    if (invAmt + eps < oaAmt) action = 'partial_reversal';
    else if (invAmt - eps > oaAmt) {
      action = 'reversal_plus_adjustment';
      recommended_amount = Math.max(0, invAmt - oaAmt);
    } else action = 'possible_reversal';
  }
  return { action, recommended_amount };
}

function ownerSupplierKey(owner: string, supplier: string): string {
  return `${owner.trim().toLowerCase()}|${supplier.trim().toLowerCase()}`;
}

export async function buildRecommendedActions(opts: {
  client: OpenAI | null;
  normalized_invoices: InvoiceAiRow[];
  normalized_open_accruals: NormalizedOpenAccrual[];
  normalized_provision_requests: NormalizedProvisionRequest[];
}): Promise<RecommendedAction[]> {
  const { client } = opts;
  const thresholds = getMatchScoreThresholds();
  const invSlices = invoicesToSlices(opts.normalized_invoices);
  const oas = opts.normalized_open_accruals;
  const provs = opts.normalized_provision_requests;
  const normalized_invoices = opts.normalized_invoices;

  const usedInvoiceForProvision = new Set<number>();
  const usedOAForProvisionMaintain = new Set<number>();

  function pickNextProvisionIndex(pendingProv: Set<number>): number {
    let bestPi = Math.min(...pendingProv);
    let bestScore = -1;
    for (const pi of pendingProv) {
      const p = provs[pi]!;
      let piMax = -1;
      if (invSlices.length) {
        for (const inv of invSlices) {
          if (usedInvoiceForProvision.has(inv.idx)) continue;
          const { score } = computeEntityMatchScore(
            {
              supplierA: p.supplier,
              serviceA: p.service,
              periodA: p.period,
              amountA: p.requested_amount,
              supplierB: inv.supplier,
              serviceB: inv.service,
              periodB: inv.period,
              amountB: inv.amount,
            },
            thresholds,
          );
          piMax = Math.max(piMax, score);
        }
      }
      if (piMax > bestScore || (piMax === bestScore && pi < bestPi)) {
        bestScore = piMax;
        bestPi = pi;
      }
    }
    return bestPi;
  }

  const provisionRows: RecommendedAction[] = [];
  const pendingProv = new Set(provs.map((_, i) => i));

  while (pendingProv.size) {
    const pi = pickNextProvisionIndex(pendingProv);
    pendingProv.delete(pi);
    const p = provs[pi]!;
    const normProvConf = p.normalization_confidence;

    let bestInv: { slice: InvSlice; score: number } | null = null;
    for (const inv of invSlices) {
      if (usedInvoiceForProvision.has(inv.idx)) continue;
      const { score } = computeEntityMatchScore(
        {
          supplierA: p.supplier,
          serviceA: p.service,
          periodA: p.period,
          amountA: p.requested_amount,
          supplierB: inv.supplier,
          serviceB: inv.service,
          periodB: inv.period,
          amountB: inv.amount,
        },
        thresholds,
      );
      if (!bestInv || score > bestInv.score) bestInv = { slice: inv, score };
    }

    let invMatch: InvSlice | null = null;
    let invAmount: number | null = null;
    let invoiceConf: ConfidenceBand = 'low';
    let invReasonExtra = '';

    if (bestInv && bestInv.score >= thresholds.medium) {
      const r = await resolveMatch(
        client,
        `Solicitud de provisión índice ${pi} ↔ factura candidata`,
        {
          supplier: p.supplier,
          service: p.service,
          period: p.period,
          amount: p.requested_amount,
        },
        candInvoiceRecord(bestInv.slice),
        bestInv.score,
        thresholds,
      );
      if (r.effectiveHigh) {
        invMatch = bestInv.slice;
        invAmount = bestInv.slice.amount;
        invoiceConf = minConfidence(r.effectiveConfidence === 'high' ? 'high' : 'medium', normProvConf);
        if (r.aiReason) invReasonExtra = `IA match: ${r.aiReason}`;
        usedInvoiceForProvision.add(bestInv.slice.idx);
      } else if (r.effectiveConfidence === 'medium') {
        invoiceConf = 'medium';
        if (r.aiReason) invReasonExtra = `Match ambiguo: ${r.aiReason}`;
      }
    }

    let bestOA: { oaIdx: number; score: number } | null = null;
    for (let oi = 0; oi < oas.length; oi++) {
      if (usedOAForProvisionMaintain.has(oi)) continue;
      const o = oas[oi]!;
      const { score } = computeEntityMatchScore(
        {
          supplierA: p.supplier,
          serviceA: p.service,
          periodA: p.period,
          amountA: p.requested_amount,
          supplierB: o.supplier,
          serviceB: o.service,
          periodB: o.period,
          amountB: o.amount,
        },
        thresholds,
      );
      if (!bestOA || score > bestOA.score) bestOA = { oaIdx: oi, score };
    }

    let oaMatchedIdx: number | null = null;
    let oaAmount: number | null = null;
    let oaConf: ConfidenceBand = 'low';

    if (bestOA && bestOA.score >= thresholds.medium) {
      const o = oas[bestOA.oaIdx]!;
      const r = await resolveMatch(
        client,
        `Solicitud de provisión índice ${pi} ↔ devengo abierto`,
        {
          supplier: p.supplier,
          service: p.service,
          period: p.period,
          amount: p.requested_amount,
        },
        {
          supplier: o.supplier,
          service_or_concept: o.service,
          period: o.period,
          open_amount: o.amount,
          owner: o.owner,
          account: o.account,
          status: o.status,
          comment: o.raw_comment,
        },
        bestOA.score,
        thresholds,
      );
      if (r.effectiveHigh) {
        oaMatchedIdx = bestOA.oaIdx;
        oaAmount = o.amount;
        oaConf = minConfidence('high', o.normalization_confidence);
        usedOAForProvisionMaintain.add(bestOA.oaIdx);
      } else if (r.effectiveConfidence === 'medium') {
        oaConf = minConfidence('medium', o.normalization_confidence);
      }
    }

    let action: RecommendedAction['action'];
    let reason = '';
    let rowConf: ConfidenceBand = normProvConf;
    rowConf = minConfidence(rowConf, invoiceConf);
    rowConf = minConfidence(rowConf, oaConf);

    if (normProvConf === 'low') {
      action = 'manual_review';
      reason = 'normalización IA de la solicitud con confianza baja.';
    } else if (invMatch) {
      action = 'no_accrual_needed';
      reason = `Solicitud alineada con factura relacionada.${invReasonExtra ? ` ${invReasonExtra}` : ''}`;
    } else if (oaMatchedIdx !== null && oaAmount != null) {
      if (p.requested_amount != null && amountsMaterialMismatch(p.requested_amount, oaAmount)) {
        action = 'manual_review';
        reason =
          'Devengo abierto alineado textualmente pero importe OA vs solicitado fuera de tolerancia (MATCH_AMOUNT_*).';
      } else {
        action = 'maintain_existing_accrual';
        reason = 'Sin factura vinculada con confianza alta; existe devengo abierto relacionado.';
      }
    } else if (!invMatch && oaMatchedIdx === null && (invoiceConf === 'medium' || oaConf === 'medium')) {
      action = 'manual_review';
      reason =
        invReasonExtra ||
        'Emparejamiento provisión↔factura/devengo en zona media; revisar criterios o subir evidencia.';
    } else if (!invMatch && oaMatchedIdx === null) {
      action = 'new_accrual';
      reason = 'No hay factura ni devengo abierto suficientemente alineados con la solicitud.';
    } else {
      action = 'manual_review';
      reason = 'Caso sin clasificación segura tras reglas declaradas.';
    }

    if (
      invoiceConf === 'medium' &&
      action !== 'no_accrual_needed' &&
      normProvConf !== 'low'
    ) {
      action = 'manual_review';
      reason =
        reason +
        (reason ? ' ' : '') +
        `Confianza de cruce de factura en rango medio (${thresholds.medium}–${thresholds.high}) sin equivalencia alta confirmada.`;
    }

    if (
      normProvConf !== 'low' &&
      action === 'no_accrual_needed' &&
      invAmount != null &&
      p.requested_amount != null &&
      amountsMaterialMismatch(invAmount, p.requested_amount)
    ) {
      action = 'manual_review';
      reason +=
        ' Importes factura vs solicitud muy distintos (tolerancia configurable); revisión manual.';
      rowConf = minConfidence(rowConf, 'low');
    }

    if (
      normProvConf !== 'low' &&
      action === 'no_accrual_needed' &&
      oaMatchedIdx !== null &&
      invAmount != null &&
      oaAmount != null &&
      amountsMaterialMismatch(invAmount, oaAmount)
    ) {
      action = 'manual_review';
      reason +=
        ' También existe devengo abierto enlazado con importes incoherentes respecto a la factura.';
      rowConf = minConfidence(rowConf, 'low');
    }

    let confidence: ConfidenceBand =
      action === 'manual_review' ? 'low' : minConfidence(rowConf, normProvConf);
    if (action !== 'manual_review' && invoiceConf === 'low' && oaConf === 'low' && !invMatch && oaMatchedIdx === null) {
      confidence = minConfidence(confidence, 'medium');
    }

    provisionRows.push({
      action,
      supplier: p.supplier,
      service: p.service,
      period: p.period,
      invoice_amount: invAmount,
      open_accrual_amount: oaAmount,
      provision_request_amount: p.requested_amount,
      recommended_amount:
        action === 'new_accrual'
          ? p.requested_amount
          : action === 'maintain_existing_accrual'
            ? null
            : action === 'no_accrual_needed'
              ? null
              : action === 'manual_review'
                ? null
                : null,
      confidence,
      reason,
    });

    const emitTwinOaReversal =
      action === 'no_accrual_needed' &&
      invMatch !== null &&
      oaMatchedIdx !== null &&
      invAmount != null &&
      oaAmount != null;
    if (emitTwinOaReversal) {
      const invRowTwin = normalized_invoices[invMatch.idx];
      if (invRowTwin !== undefined && !invoiceNeedsReviewBeforeReversal(invRowTwin)) {
        const oTwin = oas[oaMatchedIdx]!;
        const { action: revAction, recommended_amount: revRec } = classifyOaInvoiceReversal(
          invAmount,
          oaAmount,
        );
        provisionRows.push({
          action: revAction,
          supplier: oTwin.supplier,
          service: oTwin.service,
          period: oTwin.period,
          invoice_amount: invAmount,
          open_accrual_amount: oaAmount,
          provision_request_amount: null,
          recommended_amount: revRec,
          confidence: minConfidence('high', oTwin.normalization_confidence),
          reason:
            'Devengo abierto cruzado con la misma factura que cierra la solicitud; revisar reverso o liquidación del devengo.',
        });
      }
    }
  }

  const oaInvoiceRows = await buildOaInvoiceRows(
    client,
    oas,
    invSlices,
    usedOAForProvisionMaintain,
    normalized_invoices,
    thresholds,
  );

  const out: RecommendedAction[] = [...provisionRows, ...oaInvoiceRows.extra];

  const touchedOAForReversal = new Set<number>(oaInvoiceRows.touchedOA);
  type OAAsk = { o: NormalizedOpenAccrual };
  const askGroups = new Map<string, OAAsk[]>();

  for (let oi = 0; oi < oas.length; oi++) {
    if (touchedOAForReversal.has(oi)) continue;
    if (usedOAForProvisionMaintain.has(oi)) continue;
    const o = oas[oi]!;
    if (o.normalization_confidence === 'low') continue;
    const k = ownerSupplierKey(o.owner, o.supplier);
    const arr = askGroups.get(k) ?? [];
    arr.push({ o });
    askGroups.set(k, arr);
  }

  for (const [, group] of askGroups) {
    const periods = [...new Set(group.map((g) => g.o.period?.trim()).filter(Boolean))] as string[];
    const svc = [...new Set(group.map((g) => g.o.service?.trim()).filter(Boolean))].slice(0, 5);
    const first = group[0]!;
    const n = group.length;
    const amount =
      n === 1 && first.o.amount != null
        ? first.o.amount
        : null;
    out.push({
      action: 'ask_owner',
      supplier: first.o.supplier,
      service: svc.length ? svc.join(' · ') : first.o.service,
      period: periods.length ? periods.slice(0, 10).join('; ') : first.o.period,
      invoice_amount: null,
      open_accrual_amount: amount,
      provision_request_amount: null,
      recommended_amount: null,
      confidence: 'medium',
      reason:
        (n > 1
          ? `${n} devengos abiertos agrupados por owner/proveedor; confirmar en bloque con responsable.`
          : 'Devengo abierto sin factura vinculada en este lote ni solicitud mantenida explícita; confirmar con responsable.') +
        (periods.length > 8 ? ` (más períodos omitidos en resumen)` : ''),
    });
  }

  return out;
}

async function buildOaInvoiceRows(
  client: OpenAI | null,
  oas: NormalizedOpenAccrual[],
  invSlices: InvSlice[],
  usedOAForProvisionMaintain: Set<number>,
  fullInvoices: InvoiceAiRow[],
  thresholds: MatchScoreThresholds,
): Promise<{ extra: RecommendedAction[]; touchedOA: number[] }> {
  const extra: RecommendedAction[] = [];
  const usedInvoiceIndices = new Set<number>();
  const touchedOA: number[] = [];

  const ordered = [...oas.entries()]
    .map(([oi]) => {
      let max = -1;
      for (const inv of invSlices) {
        if (usedInvoiceIndices.has(inv.idx)) continue;
        const o = oas[oi]!;
        const { score } = computeEntityMatchScore(
          {
            supplierA: o.supplier,
            serviceA: o.service,
            periodA: o.period,
            amountA: o.amount,
            supplierB: inv.supplier,
            serviceB: inv.service,
            periodB: inv.period,
            amountB: inv.amount,
          },
          thresholds,
        );
        max = Math.max(max, score);
      }
      return { oi, max };
    })
    .sort((a, b) => b.max - a.max);

  for (const { oi } of ordered) {
    if (usedOAForProvisionMaintain.has(oi)) continue;
    const o = oas[oi]!;
    let best: { slice: InvSlice; score: number } | null = null;
    for (const inv of invSlices) {
      if (usedInvoiceIndices.has(inv.idx)) continue;
      const { score } = computeEntityMatchScore(
        {
          supplierA: o.supplier,
          serviceA: o.service,
          periodA: o.period,
          amountA: o.amount,
          supplierB: inv.supplier,
          serviceB: inv.service,
          periodB: inv.period,
          amountB: inv.amount,
        },
        thresholds,
      );
      if (!best || score > best.score) best = { slice: inv, score };
    }
    if (!best || best.score < thresholds.medium) continue;

    const r = await resolveMatch(
      client,
      'Devengo abierto ↔ factura (reversiones)',
      {
        supplier: o.supplier,
        service: o.service,
        period: o.period,
        amount: o.amount,
      },
      candInvoiceRecord(best.slice),
      best.score,
      thresholds,
    );

    if (!r.effectiveHigh && r.effectiveConfidence !== 'medium') continue;

    const invRow =
      fullInvoices.length > best.slice.idx ? fullInvoices[best.slice.idx] : undefined;

    if (!r.effectiveHigh && r.effectiveConfidence === 'medium') {
      extra.push({
        action: 'manual_review',
        supplier: o.supplier,
        service: o.service,
        period: o.period,
        invoice_amount: best.slice.amount,
        open_accrual_amount: o.amount,
        provision_request_amount: null,
        recommended_amount: null,
        confidence: 'medium',
        reason: [`Cruce devengo abierto/factura con score intermedio.`, r.aiReason].filter(Boolean).join(' '),
      });
      touchedOA.push(oi);
      usedInvoiceIndices.add(best.slice.idx);
      continue;
    }

    if (invoiceNeedsReviewBeforeReversal(invRow)) {
      extra.push({
        action: 'manual_review',
        supplier: o.supplier,
        service: o.service,
        period: o.period,
        invoice_amount: best.slice.amount,
        open_accrual_amount: o.amount,
        provision_request_amount: null,
        recommended_amount: null,
        confidence: 'low',
        reason:
          'Factura candidata marcada para revisión manual o período no fiable antes de recomendar tipo de reverso; validar OCR/datos.',
      });
      touchedOA.push(oi);
      usedInvoiceIndices.add(best.slice.idx);
      continue;
    }

    const invAmt = best.slice.amount;
    const oaAmt = o.amount;
    const { action, recommended_amount } = classifyOaInvoiceReversal(invAmt, oaAmt);

    touchedOA.push(oi);
    usedInvoiceIndices.add(best.slice.idx);

    extra.push({
      action,
      supplier: o.supplier,
      service: o.service,
      period: o.period,
      invoice_amount: best.slice.amount,
      open_accrual_amount: o.amount,
      provision_request_amount: null,
      recommended_amount,
      confidence: minConfidence('high', o.normalization_confidence),
      reason: `Factura relacionada con devengo abierto.${r.aiReason ? ` ${r.aiReason}` : ''}`.trim(),
    });
  }

  return { extra, touchedOA };
}
