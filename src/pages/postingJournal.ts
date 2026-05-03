/**
 * Asientos ficticios tipo plantilla FI (SAP Spain / PGC de ejemplo — no válidos sin mapeo contable real).
 */

export type HighConfApproval = '' | 'ok' | 'not_ok';

export type OwnerReviewChoice = '' | 'accept_engine' | 'confirm_reversal' | 'no_reversal' | 'defer';

export type RecommendedActionRow = {
  action: string;
  supplier: string;
  service: string;
  period: string;
  invoice_amount: number | null;
  open_accrual_amount: number | null;
  provision_request_amount: number | null;
  recommended_amount: number | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
};

/** PGC ejemplo / cuentas internas típicas de plantilla FI (solo demo). */
export const DEMO_GL = {
  /** Gastos indirectos · servicios terceros (ej.) */
  GASTO_SERVICIOS: '6220000110',
  /** Otros servicios externos */
  OTROS_SERV_EXT: '6290000340',
  /** Provisión / devengos de gastos período cerrado (pasivo) */
  PROVISION_CTPL: '4990020310',
  /** Proveedor operativo genérico (cuando aplique contra factura) */
  PROVEEDOR_OPS: '4000000210',
} as const;

export type JournalEntryKind =
  | 'new_accrual'
  | 'reversal_full'
  | 'reversal_partial'
  | 'reversal_plus_new_accrual'
  | 'none';

/** Cabecera + líneas en formato plano (repetimos cab por línea como muchos excels de LSMW/FI loader). */
export type SapJournalLine = {
  company_code: string;
  doc_type: string;
  doc_date_iso: string;
  posting_date_iso: string;
  currency: string;
  doc_number_ref: string;
  header_text: string;
  line_item: number;
  gl_account: string;
  amount_debit_loc: number;
  amount_credit_loc: number;
  cost_center: string;
  assignment: string;
  line_text: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeRef(s: string, maxLen: number): string {
  return s.replace(/[^\w\-./]/g, '_').slice(0, maxLen);
}

export function recommendedRowNeedsOwnerReview(r: RecommendedActionRow): boolean {
  if (r.confidence === 'medium' || r.confidence === 'low') return true;
  if (r.action === 'manual_review' || r.action === 'ask_owner') return true;
  if (r.action === 'partial_reversal' || r.action === 'reversal_plus_adjustment') return true;
  return false;
}

export function isReversalRelatedAction(action: string): boolean {
  return (
    action === 'possible_reversal' ||
    action === 'partial_reversal' ||
    action === 'reversal_plus_adjustment'
  );
}

/** Importe efectivo para un asiento cuando el motor solo da varias pistas. */
function pickPostingAmount(row: RecommendedActionRow): number {
  const amt =
    row.recommended_amount ??
    row.open_accrual_amount ??
    row.provision_request_amount ??
    row.invoice_amount;
  if (amt != null && !Number.isNaN(amt)) return Math.abs(amt);
  return 0;
}

function reversalBaseAmount(row: RecommendedActionRow): number {
  const amt = row.open_accrual_amount ?? row.recommended_amount ?? row.invoice_amount;
  if (amt != null && !Number.isNaN(amt)) return Math.abs(amt);
  return 0;
}

function mapActionToPostingKind(action: RecommendedActionRow['action']): JournalEntryKind {
  switch (action) {
    case 'new_accrual':
      return 'new_accrual';
    case 'possible_reversal':
      return 'reversal_full';
    case 'partial_reversal':
      return 'reversal_partial';
    case 'reversal_plus_adjustment':
      return 'reversal_plus_new_accrual';
    default:
      return 'none';
  }
}

function userAllowsPosting(opts: {
  row: RecommendedActionRow;
  idx: number;
  highApproval: Record<number, HighConfApproval>;
  reviewChoice: OwnerReviewChoice;
  needsUncertainChoice: boolean;
}): boolean {
  const { row, idx, highApproval, reviewChoice, needsUncertainChoice } = opts;
  if (needsUncertainChoice) {
    if (row.confidence === 'high') {
      if (highApproval[idx] === 'not_ok') return false;
      if (highApproval[idx] !== 'ok') return false;
    }
    if (!reviewChoice) return false;
    if (reviewChoice === 'defer') return false;
    if (reviewChoice === 'no_reversal' && isReversalRelatedAction(row.action)) return false;
    return true;
  }
  return row.confidence === 'high' && highApproval[idx] === 'ok';
}

function resolveIntentFromChoice(
  row: RecommendedActionRow,
  choice: OwnerReviewChoice,
): JournalEntryKind {
  if (!choice || choice === 'defer') return 'none';
  if (choice === 'no_reversal') return 'none';
  if (choice === 'confirm_reversal') {
    if (row.open_accrual_amount != null && row.open_accrual_amount !== 0) {
      const inv = row.invoice_amount ?? 0;
      const oa = row.open_accrual_amount;
      if (oa > inv + 0.02) return 'reversal_partial';
      return 'reversal_full';
    }
    return 'reversal_full';
  }
  return mapActionToPostingKind(row.action);
}

/** Construye asientos FI planos tras validar criterios de usuario + motor. */
export function buildSapStyleJournalLines(
  rows: RecommendedActionRow[],
  highApproval: Record<number, HighConfApproval>,
  reviewChoices: Record<number, OwnerReviewChoice>,
  opts?: { closingMonthLabel?: string; companyCode?: string },
): SapJournalLine[] {
  const company = opts?.companyCode ?? '1000';
  const docDate = todayIso();
  const postDate = todayIso();
  const currency = 'EUR';
  const periodHint = sanitizeRef((opts?.closingMonthLabel ?? 'CIERRE').slice(0, 24), 24);

  const out: SapJournalLine[] = [];
  let docSeq = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]!;
    const uncertain = recommendedRowNeedsOwnerReview(row);
    const choice = reviewChoices[idx] ?? '';
    let include = false;

    if (uncertain) {
      include = userAllowsPosting({
        row,
        idx,
        highApproval,
        reviewChoice: choice,
        needsUncertainChoice: true,
      });
    } else {
      include =
        row.confidence === 'high' &&
        highApproval[idx] === 'ok';
    }

    if (!include) continue;

    let intent: JournalEntryKind = mapActionToPostingKind(row.action);
    if (uncertain && (choice === 'accept_engine' || choice === 'confirm_reversal'))
      intent = resolveIntentFromChoice(row, choice);
    else if (!uncertain) intent = mapActionToPostingKind(row.action);

    const supplierSlug = sanitizeRef(row.supplier || 'PROV', 12);
    const baseText = sanitizeRef(`${row.supplier}: ${row.service}`.slice(0, 50), 50);

    if (intent === 'none') continue;

    if (intent === 'new_accrual') {
      const amt = pickPostingAmount(row);
      if (!amt) continue;
      docSeq++;
      const ref = `ACC-${periodHint}-${supplierSlug}-${idx + 1}`.slice(0, 25);
      const header_text = `${periodHint}: Devengo ${row.supplier}`.slice(0, 25);
      out.push(
        {
          company_code: company,
          doc_type: 'SA',
          doc_date_iso: docDate,
          posting_date_iso: postDate,
          currency,
          doc_number_ref: ref,
          header_text,
          line_item: 1,
          gl_account: DEMO_GL.OTROS_SERV_EXT,
          amount_debit_loc: amt,
          amount_credit_loc: 0,
          cost_center: 'CC_COST_9901',
          assignment: `${docSeq}-${idx + 1}-D`,
          line_text: `${baseText} · Devengo`,
        },
        {
          company_code: company,
          doc_type: 'SA',
          doc_date_iso: docDate,
          posting_date_iso: postDate,
          currency,
          doc_number_ref: ref,
          header_text,
          line_item: 2,
          gl_account: DEMO_GL.PROVISION_CTPL,
          amount_debit_loc: 0,
          amount_credit_loc: amt,
          cost_center: '',
          assignment: `${docSeq}-${idx + 1}-H`,
          line_text: `${baseText} · Prov.`,
        },
      );
      continue;
    }

    if (
      intent === 'reversal_full' ||
      intent === 'reversal_partial' ||
      intent === 'reversal_plus_new_accrual'
    ) {
      const revAmt =
        intent === 'reversal_full' || intent === 'reversal_partial'
          ? reversalBaseAmount(row)
          : row.open_accrual_amount ?? pickPostingAmount(row);
      const rev = revAmt ? Math.abs(revAmt) : 0;

      if (rev > 0) {
        docSeq++;
        const refRe = `REV-${periodHint}-${supplierSlug}-${idx + 1}`.slice(0, 25);
        const hdrRe = `${periodHint}: Reverso OA`.slice(0, 25);
        out.push(
          {
            company_code: company,
            doc_type: 'SA',
            doc_date_iso: docDate,
            posting_date_iso: postDate,
            currency,
            doc_number_ref: refRe,
            header_text: hdrRe,
            line_item: 1,
            gl_account: DEMO_GL.PROVISION_CTPL,
            amount_debit_loc: rev,
            amount_credit_loc: 0,
            cost_center: '',
            assignment: `${docSeq}-${idx + 1}R-D`,
            line_text: `${baseText} · Rev OA`,
          },
          {
            company_code: company,
            doc_type: 'SA',
            doc_date_iso: docDate,
            posting_date_iso: postDate,
            currency,
            doc_number_ref: refRe,
            header_text: hdrRe,
            line_item: 2,
            gl_account: DEMO_GL.GASTO_SERVICIOS,
            amount_debit_loc: 0,
            amount_credit_loc: rev,
            cost_center: 'CC_COST_9901',
            assignment: `${docSeq}-${idx + 1}R-H`,
            line_text: `${baseText} · Rev gasto`,
          },
        );
      }

      if (intent === 'reversal_plus_new_accrual') {
        const extra = row.recommended_amount != null ? Math.abs(row.recommended_amount) : 0;
        if (extra > 0) {
          docSeq++;
          const refN = `ADJ-${periodHint}-${supplierSlug}-${idx + 1}`.slice(0, 25);
          const hdrN = `${periodHint}: Ajuste devengo`.slice(0, 25);
          out.push(
            {
              company_code: company,
              doc_type: 'SA',
              doc_date_iso: docDate,
              posting_date_iso: postDate,
              currency,
              doc_number_ref: refN,
              header_text: hdrN,
              line_item: 1,
              gl_account: DEMO_GL.OTROS_SERV_EXT,
              amount_debit_loc: extra,
              amount_credit_loc: 0,
              cost_center: 'CC_COST_9901',
              assignment: `${docSeq}-${idx + 1}A-D`,
              line_text: `${baseText} · Ajuste`,
            },
            {
              company_code: company,
              doc_type: 'SA',
              doc_date_iso: docDate,
              posting_date_iso: postDate,
              currency,
              doc_number_ref: refN,
              header_text: hdrN,
              line_item: 2,
              gl_account: DEMO_GL.PROVISION_CTPL,
              amount_debit_loc: 0,
              amount_credit_loc: extra,
              cost_center: '',
              assignment: `${docSeq}-${idx + 1}A-H`,
              line_text: `${baseText} · Ajuste prov.`,
            },
          );
        }
      }
    }
  }

  return out;
}

export function validateDecisionsBeforeConfirm(opts: {
  rows: RecommendedActionRow[];
  highApproval: Record<number, HighConfApproval>;
  reviewChoices: Record<number, OwnerReviewChoice>;
}): { ok: true } | { ok: false; message: string } {
  const { rows, highApproval, reviewChoices } = opts;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i]!.confidence === 'high') {
      const a = highApproval[i];
      if (a !== 'ok' && a !== 'not_ok')
        return {
          ok: false,
          message: `Falta validar OK / No OK en recomendación #${i + 1} (alta confianza).`,
        };
    }
  }
  for (let i = 0; i < rows.length; i++) {
    if (recommendedRowNeedsOwnerReview(rows[i]!)) {
      const c = reviewChoices[i] ?? '';
      if (!c)
        return {
          ok: false,
          message: `Falta decisión en «Decisiones pendientes» para la fila #${i + 1}.`,
        };
    }
  }
  return { ok: true };
}
