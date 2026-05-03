import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import {
  AlertCircle,
  ChevronDown,
  Check,
  ExternalLink,
  FileArchive,
  FileText,
  Loader2,
  Sparkles,
  Table as TableIcon,
  X,
} from 'lucide-react';
import {
  buildSapStyleJournalLines,
  DEMO_GL,
  validateDecisionsBeforeConfirm,
  recommendedRowNeedsOwnerReview,
  isReversalRelatedAction,
  type HighConfApproval,
  type OwnerReviewChoice,
  type SapJournalLine,
} from './postingJournal';
import {
  asymptoticTowardCap,
  estimateAnalyzePayloadBytes,
  xhrPostMultipartAnalyze,
} from '../utils/analyzeUploadProgress';
import {
  buildAgingReviewRows,
  buildOwnerQuestionRows,
  buildPolicyFlagRows,
  policyFlagsForRecommendation,
} from '../utils/accrualClosingExtras';

// TODO: añadir OCR visual para PDFs escaneados.
// TODO: soportar más plantillas Excel.
// TODO: embeddings para matching semántico.
// TODO: permitir configurar reglas de política al usuario.
// TODO: enviar preguntas a owners por email o Slack.
// TODO: workflow aprobación/rechazo de acciones recomendadas.
// TODO: pista de auditoría con decisiones de usuario.
// TODO: enlazar pack de cierre con formatos de export ERP.
// FIXME: no considerar recomendaciones como asientos ya contabilizados.
// FIXME: reglas del comprobador en duro solo para MVP; revisar antes de producción.
// FIXME: no asumir devengo por fecha factura.
// FIXME: revisar manualmente facturas con confianza baja.

type AnalyzeKpis = {
  total_invoices_processed: number;
  period_detected: number;
  period_not_detected: number;
  manual_review_required: number;
  unreadable_pdfs: number;
};

type InvoiceRow = {
  file_name: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  concept_summary: string;
  base_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  currency: string;
  service_period_detected: boolean;
  service_period_start: string;
  service_period_end: string;
  accrual_month_or_period: string;
  period_evidence: string;
  period_detection_confidence: string;
  is_recurring_hint: string;
  possible_multi_period_invoice: string;
  requires_manual_review: boolean;
  manual_review_reason: string;
  raw_extraction_quality: string;
};

type NormConf = 'high' | 'medium' | 'low';

type NormalizedOpenAccrual = {
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

type NormalizedProvisionRequest = {
  supplier: string;
  service: string;
  period: string;
  requested_amount: number | null;
  owner: string;
  department: string;
  comment: string;
  normalization_confidence: NormConf;
};

type RecommendedAction = {
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

type AnalyzeResponse = {
  kpis: AnalyzeKpis;
  results: InvoiceRow[];
  normalized_invoices: InvoiceRow[];
  normalized_open_accruals: NormalizedOpenAccrual[];
  normalized_provision_requests: NormalizedProvisionRequest[];
  recommended_actions: RecommendedAction[];
  warnings: string[];
};

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const IS_PRODUCTION = import.meta.env.PROD;
const HAS_REMOTE_API = Boolean(API_BASE);

const STAGES = [
  'Leyendo ZIP',
  'Extrayendo texto PDF',
  'Analizando facturas con IA',
  'Preparando resultados',
] as const;

function formatMoneyEUR(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
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

function formatTotal(r: InvoiceRow): string {
  if (r.total_amount == null || Number.isNaN(r.total_amount)) return '';
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: r.currency?.length === 3 ? r.currency : 'EUR',
      maximumFractionDigits: 2,
    }).format(r.total_amount);
  } catch {
    return `${r.total_amount} ${r.currency}`;
  }
}

function normSupplier(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function suppliersLooselyMatch(a: string, b: string): boolean {
  const na = normSupplier(a);
  const nb = normSupplier(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

function amountsCloseForMatch(a: number, b: number): boolean {
  const eps = 0.02 + 0.005 * Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= eps;
}

function findLikelyInvoiceForRecommendation(
  r: RecommendedAction,
  invoices: InvoiceRow[],
): { inv: InvoiceRow; idx: number } | null {
  let best: { inv: InvoiceRow; idx: number; score: number } | null = null;
  for (let idx = 0; idx < invoices.length; idx++) {
    const inv = invoices[idx]!;
    const ta = inv.total_amount ?? inv.base_amount;
    let score = 0;
    if (suppliersLooselyMatch(r.supplier || '', inv.supplier_name || '')) score += 2;
    if (r.invoice_amount != null && ta != null && amountsCloseForMatch(r.invoice_amount, ta)) score += 5;
    if (score > (best?.score ?? -1)) best = { inv, idx, score };
  }
  if (!best) return null;
  if (r.invoice_amount != null) {
    return best.score >= 5 ? { inv: best.inv, idx: best.idx } : null;
  }
  const supIdxs = invoices
    .map((inv, idx) => ({ inv, idx }))
    .filter(({ inv }) => suppliersLooselyMatch(r.supplier || '', inv.supplier_name || ''));
  if (supIdxs.length === 1) return { inv: supIdxs[0]!.inv, idx: supIdxs[0]!.idx };
  return null;
}

function needsOwnerReview(r: RecommendedAction): boolean {
  return recommendedRowNeedsOwnerReview(r);
}

function servicePeriodLabel(r: InvoiceRow): string {
  if (r.raw_extraction_quality === 'unreadable') return '—';
  if (r.service_period_detected && (r.service_period_start || r.service_period_end)) {
    const parts = [r.service_period_start, r.service_period_end].filter(Boolean);
    return parts.length ? parts.join(' → ') : 'Sí';
  }
  return r.service_period_detected ? 'Sí' : 'No';
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

function ProgressPctBar({
  pct,
  sublabel,
  className,
}: {
  pct: number;
  sublabel?: string;
  className?: string;
}) {
  const w = Math.min(100, Math.max(0, pct));
  return (
    <div className={className ?? ''}>
      {sublabel ? (
        <p className="text-[11px] text-ink-subtle mb-2 text-center leading-snug">{sublabel}</p>
      ) : null}
      <div className="w-full rounded-full bg-ink/10 h-2.5 overflow-hidden border border-ink/10">
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-150 ease-out"
          style={{ width: `${w}%` }}
          role="progressbar"
          aria-valuenow={Math.round(w)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-center mt-2.5 tabular-nums text-sm font-medium text-ink">{Math.round(w)}%</p>
    </div>
  );
}

/** Guía en castellano para quien publica en Netlify sin API (sin tecnicismos innecesarios). */
function NetlifyProductionApiGuide() {
  return (
    <div className="editorial-glass-strong rounded-2xl lg:rounded-3xl p-6 lg:p-10 mb-10 max-w-3xl mx-auto border border-accent-amber/30 bg-gradient-to-b from-accent-amber/[0.07] to-paper/90">
      <div className="flex gap-4 mb-6">
        <div className="shrink-0 rounded-full bg-accent-amber/15 p-2.5 border border-accent-amber/25">
          <AlertCircle className="w-7 h-7 text-accent-amber" aria-hidden />
        </div>
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-medium text-ink mb-2 leading-snug">
            Un aviso antes de subir facturas
          </h2>
          <p className="text-sm text-ink-muted leading-relaxed">
            Esta página en Netlify es solo la <strong className="text-ink">interfaz</strong>. El programa que abre el ZIP,
            lee los PDF y llama a la inteligencia artificial está <strong className="text-ink">en otro sitio</strong>. Si
            nadie lo ha enlazado todavía, el botón de analizar no puede funcionar. No es un fallo tuyo: falta esa
            configuración <strong className="text-ink">una vez</strong>.
          </p>
          <p className="text-sm text-ink-muted leading-relaxed mt-3">
            Si tú no vas a encargarte de esto, reenvía esta pantalla a quien subió el proyecto a internet (desarrollador
            o informática).
          </p>
        </div>
      </div>

      <ol className="space-y-8 text-sm text-ink list-none pl-0">
        <li className="border-l-2 border-ink/20 pl-5 ml-1">
          <p className="font-semibold text-ink mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-[2rem] px-2 items-center justify-center rounded-full bg-ink text-cream-soft text-xs font-bold">
              1
            </span>
            Poner el “motor” en Render (cuenta gratuita)
          </p>
          <ul className="list-disc pl-5 space-y-2.5 text-ink-muted leading-relaxed">
            <li>
              Abre{' '}
              <a
                href="https://render.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-blue font-medium underline underline-offset-2"
              >
                render.com <ExternalLink className="w-3.5 h-3.5" />
              </a>{' '}
              y crea una cuenta si no tienes.
            </li>
            <li>
              Pulsa <strong className="text-ink">New</strong> → <strong className="text-ink">Web Service</strong> y
              conecta el <strong className="text-ink">mismo repositorio de GitHub</strong> donde está este código.
            </li>
            <li>
              <strong className="text-ink">Build command:</strong>{' '}
              <code className="rounded-md bg-paper border border-ink/10 px-2 py-0.5 text-ink text-xs">npm ci</code>
            </li>
            <li>
              <strong className="text-ink">Start command:</strong>{' '}
              <code className="rounded-md bg-paper border border-ink/10 px-2 py-0.5 text-ink text-xs">npm start</code>
            </li>
            <li>
              En la sección de variables, añade{' '}
              <code className="rounded-md bg-paper border border-ink/10 px-2 py-0.5 text-ink text-xs">
                OPENAI_API_KEY
              </code>{' '}
              con la clave que te da OpenAI (hace falta para leer y entender las facturas).
            </li>
            <li>
              Cuando el servicio pase a estado <strong className="text-ink">Live</strong>, copia la dirección web que
              te muestran arriba (algo como{' '}
              <code className="text-xs text-ink">https://…onrender.com</code>). La necesitas en el paso 2.
            </li>
          </ul>
        </li>
        <li className="border-l-2 border-ink/20 pl-5 ml-1">
          <p className="font-semibold text-ink mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-[2rem] px-2 items-center justify-center rounded-full bg-ink text-cream-soft text-xs font-bold">
              2
            </span>
            Decírselo a Netlify (una variable)
          </p>
          <ul className="list-disc pl-5 space-y-2.5 text-ink-muted leading-relaxed">
            <li>
              Entra en Netlify → elige <strong className="text-ink">este sitio</strong> →{' '}
              <strong className="text-ink">Site configuration</strong> → <strong className="text-ink">Environment
              variables</strong>.
            </li>
            <li>
              Añade una variable: nombre exacto{' '}
              <code className="rounded-md bg-paper border border-ink/10 px-2 py-0.5 text-ink text-xs">
                VITE_API_URL
              </code>
              , valor = la dirección de Render del paso 1, <strong className="text-ink">sin barra al final</strong>.
            </li>
            <li>
              Guarda y lanza un despliegue nuevo: <strong className="text-ink">Deploy</strong> →{' '}
              <strong className="text-ink">Clear cache and deploy site</strong> (así la web se reconstruye sabiendo la
              dirección del motor).
            </li>
          </ul>
        </li>
        <li className="border-l-2 border-ink/20 pl-5 ml-1">
          <p className="font-semibold text-ink mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-[2rem] px-2 items-center justify-center rounded-full bg-ink text-cream-soft text-xs font-bold">
              3
            </span>
            Volver aquí
          </p>
          <p className="text-ink-muted leading-relaxed pl-0">
            Recarga esta página. Si todo está bien enlazado, aparecerá el formulario para subir el ZIP y podrás pulsar
            analizar.
          </p>
        </li>
      </ol>

      <div className="mt-8 rounded-xl border border-ink/10 bg-paper/70 px-4 py-3 text-xs text-ink-muted leading-relaxed">
        <strong className="text-ink">Solo quieres probar en tu PC:</strong> pide a quien tenga el proyecto que ejecute
        en una terminal <code className="rounded bg-paper border border-ink/10 px-1.5 py-0.5 text-ink">npm run dev:full</code> y
        abra la dirección local que indique la terminal; ahí el análisis funciona sin Render ni Netlify.
      </div>
    </div>
  );
}

export default function OcrTestPage() {
  const [closingMonth, setClosingMonth] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [openAccrualsFile, setOpenAccrualsFile] = useState<File | null>(null);
  const [provisionFile, setProvisionFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzeProgressPct, setAnalyzeProgressPct] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [reviewChoices, setReviewChoices] = useState<Record<number, OwnerReviewChoice>>({});
  const [highApproval, setHighApproval] = useState<Record<number, HighConfApproval>>({});
  const [expandedReviewDetail, setExpandedReviewDetail] = useState<Record<number, boolean>>({});
  const [pulseInvoiceIdx, setPulseInvoiceIdx] = useState<number | null>(null);
  const [confirmPostingError, setConfirmPostingError] = useState<string | null>(null);
  const [confirmPostingBusy, setConfirmPostingBusy] = useState(false);
  const [confirmPostingPct, setConfirmPostingPct] = useState(0);
  const [confirmedJournalLines, setConfirmedJournalLines] = useState<SapJournalLine[] | null>(
    null,
  );
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const postingRafRef = useRef<number | null>(null);
  const postingFinishedRef = useRef(false);
  const journalAnchorRef = useRef<HTMLDivElement | null>(null);
  const [apiHealthStatus, setApiHealthStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle');
  const [apiHealthDetail, setApiHealthDetail] = useState('');

  const checkApiHealth = useCallback(async () => {
    if (!HAS_REMOTE_API) return;
    setApiHealthStatus('checking');
    setApiHealthDetail('');
    try {
      const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
      const t = await res.text();
      if (res.ok) {
        setApiHealthStatus('ok');
        setApiHealthDetail('La API está encendida y responde.');
      } else {
        setApiHealthStatus('error');
        setApiHealthDetail(`Error ${res.status}. ${t.slice(0, 160)}`);
      }
    } catch (e) {
      setApiHealthStatus('error');
      setApiHealthDetail(
        e instanceof Error
          ? e.message
          : 'No se pudo conectar. ¿El servicio en Render está “Live”? ¿La dirección en Netlify es correcta?',
      );
    }
  }, []);

  const uncertainRecommendations = useMemo(() => {
    if (!data) return [];
    return data.recommended_actions
      .map((r, idx) => ({
        row: r,
        idx,
        invoiceHit: findLikelyInvoiceForRecommendation(r, data.results),
      }))
      .filter(({ row }) => needsOwnerReview(row));
  }, [data]);

  const agingReviewRows = useMemo(() => {
    if (!data) return [];
    return buildAgingReviewRows(data.normalized_open_accruals, closingMonth);
  }, [data, closingMonth]);

  const ownerQuestionRows = useMemo(() => {
    if (!data) return [];
    return buildOwnerQuestionRows(data.recommended_actions);
  }, [data]);

  const policyFlagExportRows = useMemo(() => {
    if (!data) return [];
    return buildPolicyFlagRows(data.recommended_actions, data.normalized_open_accruals, closingMonth);
  }, [data, closingMonth]);

  useEffect(() => {
    if (!data) return;
    setReviewChoices({});
    setHighApproval({});
    setExpandedReviewDetail({});
    setConfirmPostingError(null);
    setConfirmedJournalLines(null);
  }, [data]);

  function setHighConf(idx: number, v: HighConfApproval) {
    setHighApproval((prev) => ({ ...prev, [idx]: v }));
  }

  function acceptAllHighConfidence() {
    if (!data) return;
    const next: Record<number, HighConfApproval> = { ...highApproval };
    for (let i = 0; i < data.recommended_actions.length; i++) {
      if (data.recommended_actions[i]!.confidence === 'high') next[i] = 'ok';
    }
    setHighApproval(next);
  }

  async function downloadPostingJournalExcel(lines: SapJournalLine[]) {
    const wb = new ExcelJS.Workbook();
    const wsPostings = wb.addWorksheet('FI_document_lines');
    wsPostings.columns = [
      { header: 'company_code', key: 'company_code', width: 14 },
      { header: 'doc_type', key: 'doc_type', width: 10 },
      { header: 'doc_date_iso', key: 'doc_date_iso', width: 14 },
      { header: 'posting_date_iso', key: 'posting_date_iso', width: 16 },
      { header: 'currency', key: 'currency', width: 10 },
      { header: 'doc_number_ref', key: 'doc_number_ref', width: 26 },
      { header: 'header_text', key: 'header_text', width: 28 },
      { header: 'line_item', key: 'line_item', width: 10 },
      { header: 'gl_account', key: 'gl_account', width: 16 },
      { header: 'amount_debit_loc', key: 'amount_debit_loc', width: 16 },
      { header: 'amount_credit_loc', key: 'amount_credit_loc', width: 16 },
      { header: 'cost_center', key: 'cost_center', width: 14 },
      { header: 'assignment', key: 'assignment', width: 18 },
      { header: 'line_text', key: 'line_text', width: 52 },
    ];
    for (const row of lines) {
      wsPostings.addRow({ ...row });
    }
    wsPostings.getRow(1).font = { bold: true };

    const wsGl = wb.addWorksheet('_cuentas_demo_PGC');
    wsGl.columns = [
      { header: 'gl_account', key: 'acc', width: 16 },
      { header: 'descripcion_demo', key: 'd', width: 48 },
    ];
    wsGl.addRow({
      acc: DEMO_GL.GASTO_SERVICIOS,
      d: '[Demo PGC/SAP] Gastos externos — servicios terceros',
    });
    wsGl.addRow({
      acc: DEMO_GL.OTROS_SERV_EXT,
      d: '[Demo PGC/SAP] Otros servicios exteriores — devengo',
    });
    wsGl.addRow({
      acc: DEMO_GL.PROVISION_CTPL,
      d: '[Demo PGC/SAP] Provisión corto plazo / devengo gasto período cerrado',
    });
    wsGl.addRow({
      acc: DEMO_GL.PROVEEDOR_OPS,
      d: '[Demo PGC/SAP] Proveedores ops (referencia cuando aplique contra factura)',
    });
    wsGl.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fi-postings-sap-demo-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmDecisionsPosting() {
    if (!data?.recommended_actions.length) return;
    const v = validateDecisionsBeforeConfirm({
      rows: data.recommended_actions,
      highApproval,
      reviewChoices,
    });
    if (!v.ok) {
      setConfirmPostingError(v.message);
      return;
    }
    setConfirmPostingError(null);

    if (postingRafRef.current != null) {
      cancelAnimationFrame(postingRafRef.current);
      postingRafRef.current = null;
    }

    postingFinishedRef.current = false;
    setConfirmPostingBusy(true);
    setConfirmPostingPct(0);

    const perf = typeof performance !== 'undefined';
    const t0 = perf ? performance.now() : Date.now();

    function tickPosting() {
      if (postingFinishedRef.current) return;
      const now = perf ? performance.now() : Date.now();
      const elapsed = Math.max(0, now - t0);
      const p = asymptoticTowardCap(elapsed, 94, 3_400);
      setConfirmPostingPct(Math.floor(Math.min(94, p)));
      postingRafRef.current = requestAnimationFrame(tickPosting);
    }
    postingRafRef.current = requestAnimationFrame(tickPosting);

    try {
      await delay(50);
      await delay(Math.max(0, 620 - ((perf ? performance.now() : Date.now()) - t0)));

      postingFinishedRef.current = true;
      if (postingRafRef.current != null) {
        cancelAnimationFrame(postingRafRef.current);
        postingRafRef.current = null;
      }

      const lines = buildSapStyleJournalLines(data.recommended_actions, highApproval, reviewChoices, {
        closingMonthLabel: closingMonth.trim() || undefined,
      });
      setConfirmedJournalLines(lines);
      setConfirmPostingPct(100);
      window.setTimeout(() => {
        journalAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      await delay(380);
    } finally {
      postingFinishedRef.current = true;
      if (postingRafRef.current != null) {
        cancelAnimationFrame(postingRafRef.current);
        postingRafRef.current = null;
      }
      setConfirmPostingBusy(false);
      setConfirmPostingPct(0);
    }
  }

  const pulseInvoice = useCallback((idx: number) => {
    setPulseInvoiceIdx(idx);
    window.setTimeout(() => setPulseInvoiceIdx(null), 2200);
  }, []);

  const scrollToInvoice = useCallback(
    (idx: number) => {
      pulseInvoice(idx);
      const el = document.getElementById(`ocr-inv-${idx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [pulseInvoice],
  );

  function setChoice(rowIdx: number, choice: OwnerReviewChoice) {
    setReviewChoices((prev) => ({ ...prev, [rowIdx]: choice }));
  }

  function toggleReviewExpand(rowIdx: number) {
    setExpandedReviewDetail((prev) => ({ ...prev, [rowIdx]: !prev[rowIdx] }));
  }

  useEffect(() => {
    if (!loading) {
      if (stageTimer.current) {
        clearInterval(stageTimer.current);
        stageTimer.current = null;
      }
      setStageIndex(0);
      return;
    }
    stageTimer.current = setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
    }, 2000);
    return () => {
      if (stageTimer.current) clearInterval(stageTimer.current);
    };
  }, [loading]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setData(null);
    if (!file || !file.name.toLowerCase().endsWith('.zip')) {
      setError('Selecciona un archivo ZIP válido.');
      return;
    }
    const fd = new FormData();
    fd.append('zip_file', file);
    if (closingMonth.trim()) fd.append('closing_month', closingMonth.trim());
    if (openAccrualsFile) fd.append('open_accruals_file', openAccrualsFile);
    if (provisionFile) fd.append('provision_requests_file', provisionFile);

    setAnalyzeProgressPct(0);
    setLoading(true);
    try {
      const estimated = estimateAnalyzePayloadBytes({
        zip: file,
        openAccruals: openAccrualsFile ?? null,
        provision: provisionFile ?? null,
        closingMonthLen: closingMonth.trim().length,
      });
      const result = await xhrPostMultipartAnalyze<AnalyzeResponse & { error?: string }>(
        `${API_BASE}/api/ocr-test/analyze`,
        fd,
        estimated,
        (p) => setAnalyzeProgressPct(p),
      );
      if (!result.ok) throw new Error(result.error);
      const json = result.data;
      const invoices = json.normalized_invoices ?? json.results ?? [];
      setData({
        kpis: json.kpis,
        results: invoices,
        normalized_invoices: invoices,
        normalized_open_accruals: json.normalized_open_accruals ?? [],
        normalized_provision_requests: json.normalized_provision_requests ?? [],
        recommended_actions: json.recommended_actions ?? [],
        warnings: json.warnings ?? [],
      });
      setAnalyzeProgressPct(100);
      await delay(400);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
      setAnalyzeProgressPct(0);
    }
  }

  async function downloadExcel() {
    if (!data) return;
    const wb = new ExcelJS.Workbook();

    const ws = wb.addWorksheet('facturas');
    ws.columns = [
      { header: 'archivo', key: 'file', width: 32 },
      { header: 'proveedor', key: 'supplier', width: 24 },
      { header: 'fecha_factura', key: 'idate', width: 14 },
      { header: 'total', key: 'total', width: 14 },
      { header: 'concepto', key: 'concept', width: 40 },
      { header: 'periodo_servicio_detectado', key: 'spd', width: 28 },
      { header: 'periodo_devengo', key: 'accrual', width: 22 },
      { header: 'confianza', key: 'conf', width: 14 },
      { header: 'revision_manual', key: 'mr', width: 14 },
      { header: 'motivo', key: 'reason', width: 48 },
    ];
    for (const r of data.results) {
      ws.addRow({
        file: r.file_name,
        supplier: r.supplier_name,
        idate: r.invoice_date,
        total: formatTotal(r),
        concept: r.concept_summary,
        spd: servicePeriodLabel(r),
        accrual: r.accrual_month_or_period,
        conf: r.period_detection_confidence,
        mr: r.requires_manual_review ? 'Sí' : 'No',
        reason: [r.manual_review_reason, r.period_evidence].filter(Boolean).join(' | ') || '',
      });
    }
    ws.getRow(1).font = { bold: true };

    const woa = wb.addWorksheet('devengos_abiertos');
    woa.columns = [
      { header: 'proveedor', key: 'supplier', width: 22 },
      { header: 'servicio', key: 'service', width: 26 },
      { header: 'periodo', key: 'period', width: 18 },
      { header: 'importe', key: 'amount', width: 14 },
      { header: 'owner', key: 'owner', width: 16 },
      { header: 'cuenta', key: 'account', width: 14 },
      { header: 'estado', key: 'status', width: 10 },
      { header: 'comentario', key: 'raw_comment', width: 36 },
      { header: 'confianza_normalizacion', key: 'nc', width: 22 },
    ];
    for (const r of data.normalized_open_accruals) {
      woa.addRow({
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        amount: r.amount,
        owner: r.owner,
        account: r.account,
        status: r.status,
        raw_comment: r.raw_comment,
        nc: r.normalization_confidence,
      });
    }
    woa.getRow(1).font = { bold: true };

    const wpr = wb.addWorksheet('solicitudes_provision');
    wpr.columns = [
      { header: 'proveedor', key: 'supplier', width: 22 },
      { header: 'servicio', key: 'service', width: 26 },
      { header: 'periodo', key: 'period', width: 18 },
      { header: 'importe_solicitado', key: 'requested_amount', width: 16 },
      { header: 'owner', key: 'owner', width: 16 },
      { header: 'departamento', key: 'department', width: 16 },
      { header: 'comentario', key: 'comment', width: 36 },
      { header: 'confianza_normalizacion', key: 'nc', width: 22 },
    ];
    for (const r of data.normalized_provision_requests) {
      wpr.addRow({
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        requested_amount: r.requested_amount,
        owner: r.owner,
        department: r.department,
        comment: r.comment,
        nc: r.normalization_confidence,
      });
    }
    wpr.getRow(1).font = { bold: true };

    const war = wb.addWorksheet('acciones_recomendadas');
    war.columns = [
      { header: 'accion', key: 'action', width: 26 },
      { header: 'proveedor', key: 'supplier', width: 20 },
      { header: 'servicio', key: 'service', width: 24 },
      { header: 'periodo', key: 'period', width: 16 },
      { header: 'importe_factura', key: 'invoice_amount', width: 14 },
      { header: 'importe_devengo_abierto', key: 'open_accrual_amount', width: 16 },
      { header: 'importe_solicitud_provision', key: 'provision_request_amount', width: 22 },
      { header: 'importe_recomendado', key: 'recommended_amount', width: 18 },
      { header: 'confianza', key: 'confidence', width: 12 },
      { header: 'marcadores_control', key: 'policy_flags', width: 40 },
      { header: 'motivo', key: 'reason', width: 48 },
    ];
    for (const r of data.recommended_actions) {
      const flags = policyFlagsForRecommendation(r, data.normalized_open_accruals, closingMonth);
      war.addRow({
        action: r.action,
        supplier: r.supplier,
        service: r.service,
        period: r.period,
        invoice_amount: r.invoice_amount,
        open_accrual_amount: r.open_accrual_amount,
        provision_request_amount: r.provision_request_amount,
        recommended_amount: r.recommended_amount,
        confidence: r.confidence,
        policy_flags: flags.length ? flags.join(', ') : '',
        reason: r.reason,
      });
    }
    war.getRow(1).font = { bold: true };

    const wAging = wb.addWorksheet('revision_antiguedad');
    wAging.columns = [
      { header: 'proveedor', key: 'supplier', width: 22 },
      { header: 'servicio', key: 'service', width: 26 },
      { header: 'periodo', key: 'period', width: 18 },
      { header: 'importe', key: 'amount', width: 14 },
      { header: 'tramo_antiguedad', key: 'age_bucket', width: 14 },
      { header: 'nivel_riesgo', key: 'risk_level', width: 14 },
      { header: 'motivo', key: 'reason', width: 48 },
    ];
    for (const row of agingReviewRows) {
      wAging.addRow({
        supplier: row.supplier,
        service: row.service,
        period: row.period,
        amount: row.amount,
        age_bucket: row.age_bucket,
        risk_level: row.risk_level,
        reason: row.reason,
      });
    }
    wAging.getRow(1).font = { bold: true };

    const wOq = wb.addWorksheet('preguntas_owner');
    wOq.columns = [
      { header: 'accion_recomendada', key: 'action', width: 22 },
      { header: 'proveedor', key: 'supplier', width: 22 },
      { header: 'servicio', key: 'service', width: 26 },
      { header: 'periodo', key: 'period', width: 18 },
      { header: 'importe_ref', key: 'amount_ref', width: 16 },
      { header: 'pregunta', key: 'question', width: 72 },
    ];
    for (const row of ownerQuestionRows) {
      wOq.addRow({
        action: row.action,
        supplier: row.supplier,
        service: row.service,
        period: row.period,
        amount_ref: row.amountLabel,
        question: row.question,
      });
    }
    wOq.getRow(1).font = { bold: true };

    const wPol = wb.addWorksheet('marcadores_control');
    wPol.columns = [
      { header: 'indice_recomendacion', key: 'recommendation_index', width: 22 },
      { header: 'proveedor', key: 'supplier', width: 22 },
      { header: 'servicio', key: 'service', width: 26 },
      { header: 'accion', key: 'action', width: 22 },
      { header: 'marcadores', key: 'flags', width: 48 },
    ];
    for (const row of policyFlagExportRows) {
      wPol.addRow({
        recommendation_index: row.recommendation_index,
        supplier: row.supplier,
        service: row.service,
        action: row.action,
        flags: row.flags,
      });
    }
    wPol.getRow(1).font = { bold: true };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `resultados-revision-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
    <main className="pt-24 lg:pt-28 pb-20 px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-paper border border-ink/10 px-3 py-1 text-[11px] text-ink-muted mb-4">
            <Sparkles className="w-3.5 h-3.5 text-ink-muted" />
            MVP · revisión fin de mes (devengos)
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Revisión AccrualFlow (facturas + devengos + controlling)
          </h1>
          <p className="text-ink-muted text-sm lg:text-base">
            Tres fuentes de datos:{' '}
            <span className="text-ink">ZIP de facturas</span>,{' '}
            <span className="text-ink">fichero de devengos abiertos</span>{' '}
            <span className="text-ink-subtle">(opcional CSV/Excel)</span> y{' '}
            <span className="text-ink">solicitudes de provisión / inputs de controlling</span>. Las salidas incluyen
            análisis tipo OCR de facturas, acciones recomendadas, revisión de antigüedad y preguntas para owners — puedes
            exportar un Excel estilo pack de cierre desde esta pantalla.
          </p>
        </div>

        {IS_PRODUCTION && !HAS_REMOTE_API ? (
          <NetlifyProductionApiGuide />
        ) : (
        <div className="editorial-glass-strong rounded-2xl lg:rounded-3xl p-6 lg:p-8 mb-10 max-w-3xl mx-auto">
          {HAS_REMOTE_API ? (
            <div className="mb-6 rounded-xl border border-ink/10 bg-paper/60 px-4 py-3 space-y-2">
              <p className="text-xs text-ink-muted">
                Conexión con el motor del análisis:{' '}
                <code className="text-[11px] text-ink break-all">{API_BASE}</code>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={checkApiHealth}
                  disabled={apiHealthStatus === 'checking'}
                  className="rounded-lg border border-ink/20 bg-paper px-3 py-2 text-xs font-medium text-ink hover:bg-ink/[0.04] disabled:opacity-50"
                >
                  {apiHealthStatus === 'checking' ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Comprobando…
                    </span>
                  ) : (
                    'Comprobar que la API responde'
                  )}
                </button>
                {apiHealthStatus === 'ok' ? (
                  <span className="text-xs font-medium text-emerald-800">✓ {apiHealthDetail}</span>
                ) : null}
                {apiHealthStatus === 'error' ? (
                  <span className="text-xs text-accent-coral max-w-full">{apiHealthDetail}</span>
                ) : null}
              </div>
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="space-y-6">
            <div>
              <label htmlFor="closing_month" className="block text-xs font-medium text-ink-muted mb-2">
                Mes de cierre{' '}
                <span className="text-ink-subtle font-normal">(opcional, solo referencia)</span>
              </label>
              <input
                id="closing_month"
                type="text"
                placeholder="p. ej. Abril 2026"
                value={closingMonth}
                onChange={(e) => setClosingMonth(e.target.value)}
                className="w-full rounded-xl bg-paper border border-ink/10 px-4 py-3 text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-ink/15 focus:border-ink/25"
              />
            </div>
            <div>
              <label htmlFor="zip_file" className="block text-xs font-medium text-ink-muted mb-2">
                ZIP de facturas <span className="text-ink-subtle font-normal">(PDFs dentro)</span>
              </label>
              <div className="relative">
                <input
                  id="zip_file"
                  type="file"
                  accept=".zip,application/zip"
                  className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-lg file:border-0 file:bg-ink/[0.08] file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-ink/[0.12]"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              {file && (
                <p className="mt-2 flex items-center gap-2 text-xs text-ink-subtle">
                  <FileArchive className="w-3.5 h-3.5" />
                  {file.name}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="open_accruals_file" className="block text-xs font-medium text-ink-muted mb-2">
                Fichero devengos abiertos{' '}
                <span className="text-ink-subtle font-normal">(opcional · CSV o Excel)</span>
              </label>
              <input
                id="open_accruals_file"
                type="file"
                accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-lg file:border-0 file:bg-ink/[0.04] file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-ink/[0.08]"
                onChange={(e) => setOpenAccrualsFile(e.target.files?.[0] ?? null)}
              />
              {openAccrualsFile && (
                <p className="mt-2 text-xs text-ink-subtle">{openAccrualsFile.name}</p>
              )}
            </div>
            <div>
              <label htmlFor="provision_requests_file" className="block text-xs font-medium text-ink-muted mb-2">
                Solicitudes de provisión / inputs controlling{' '}
                <span className="text-ink-subtle font-normal">(opcional · CSV o Excel)</span>
              </label>
              <input
                id="provision_requests_file"
                type="file"
                accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="block w-full text-sm text-ink-muted file:mr-4 file:rounded-lg file:border-0 file:bg-ink/[0.04] file:px-4 file:py-2 file:text-sm file:font-medium file:text-ink hover:file:bg-ink/[0.08]"
                onChange={(e) => setProvisionFile(e.target.files?.[0] ?? null)}
              />
              {provisionFile && <p className="mt-2 text-xs text-ink-subtle">{provisionFile.name}</p>}
            </div>
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-cream-soft hover:bg-ink/90 disabled:opacity-40 disabled:pointer-events-none transition-colors shadow-md shadow-ink/10 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Analizar facturas
            </button>
          </form>

          {loading && (
            <div className="mt-6 pt-6 border-t border-ink/10 space-y-5">
              <div className="flex flex-col items-center gap-2 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-ink-subtle" />
                <span className="text-ink text-center">{STAGES[stageIndex]}…</span>
              </div>
              <ProgressPctBar
                pct={analyzeProgressPct}
                sublabel="Subiendo los adjuntos (~mitad del recorrido) y luego el servidor ejecuta OCR e IA hasta recibir respuesta."
                className="max-w-md mx-auto px-2"
              />
            </div>
          )}
          {error && (
            <p className="mt-6 text-center text-sm text-accent-coral border-t border-ink/10 pt-6">{error}</p>
          )}
        </div>
        )}

        {data && (
          <>
            {data.warnings.length > 0 && (
              <div className="mb-6 rounded-xl border border-accent-amber/30 bg-accent-amber/5 px-4 py-3 text-xs text-accent-amber/95 max-w-3xl mx-auto">
                <p className="font-medium mb-2">Advertencias del servidor</p>
                <ul className="list-disc pl-4 space-y-1 text-ink">
                  {data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
              {(
                [
                  ['Facturas procesadas', data.kpis.total_invoices_processed],
                  ['Periodo detectado', data.kpis.period_detected],
                  ['Periodo no detectado', data.kpis.period_not_detected],
                  ['Revisión manual', data.kpis.manual_review_required],
                  ['PDFs ilegibles', data.kpis.unreadable_pdfs],
                ] as const
              ).map(([label, val]) => (
                <div
                  key={label}
                  className="bg-paper rounded-xl p-4 border border-ink/10 text-center"
                >
                  <p className="text-2xl font-bold text-ink font-bold">{val}</p>
                  <p className="text-[11px] text-ink-subtle mt-1 leading-snug">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <TableIcon className="w-4 h-4 text-ink" />
                Salidas
              </div>
              <button
                type="button"
                onClick={downloadExcel}
                className="rounded-full px-5 py-2 text-xs font-medium border border-ink/20 text-ink hover:bg-ink/[0.05] transition-colors"
              >
                Descargar Excel
              </button>
            </div>

            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
              1. Resultados OCR de facturas
            </h2>
            {data.results.length === 0 ? (
              <p className="text-sm text-ink-subtle mb-10">Sin facturas: el ZIP no contenía PDFs o no pudieron procesarse.</p>
            ) : (
              <div className="editorial-glass-strong rounded-2xl overflow-hidden border border-ink/10 mb-10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[960px]">
                    <thead>
                      <tr className="border-b border-ink/10 bg-ink/[0.03]">
                        {[
                          'Archivo',
                          'Proveedor',
                          'Fecha factura',
                          'Total',
                          'Concepto',
                          'Periodo servicio detectado',
                          'Periodo devengo',
                          'Confianza',
                          'Revisión manual',
                          'Motivo',
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-[10px] uppercase tracking-wider text-ink-subtle px-4 py-3 font-medium whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.results.map((r, idx) => (
                        <tr
                          id={`ocr-inv-${idx}`}
                          key={`${r.file_name}-${idx}`}
                          className={`border-b border-ink/[0.06] hover:bg-ink/[0.03] transition-colors duration-700 ${
                            pulseInvoiceIdx === idx ? 'bg-amber-100/90 ring-1 ring-inset ring-amber-300/60' : ''
                          }`}
                        >
                          <td className="px-4 py-3 text-xs font-mono text-ink max-w-[200px] truncate">
                            {r.file_name}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink">{r.supplier_name || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted whitespace-nowrap">
                            {r.invoice_date || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink font-mono whitespace-nowrap">
                            {formatTotal(r) || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-muted max-w-[220px]" title={r.concept_summary}>
                            {r.concept_summary ? (
                              <span className="line-clamp-2">{r.concept_summary}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{servicePeriodLabel(r)}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink">{r.accrual_month_or_period}</td>
                          <td className="px-4 py-3 text-xs capitalize text-ink-muted">
                            {r.period_detection_confidence}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {r.requires_manual_review ? (
                              <span className="text-accent-amber">Sí</span>
                            ) : (
                              <span className="text-ink-muted">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-subtle max-w-[260px]" title={[r.manual_review_reason, r.period_evidence].filter(Boolean).join(' ')}>
                            <span className="line-clamp-2">
                              {[r.manual_review_reason, r.period_evidence].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
              2. Devengos abiertos normalizados
            </h2>
            {data.normalized_open_accruals.length === 0 ? (
              <p className="text-sm text-ink-subtle mb-10">Sin filas (no se subió archivo o quedó vacío).</p>
            ) : (
              <div className="editorial-glass-strong rounded-2xl overflow-hidden border border-ink/10 mb-10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                    <thead>
                      <tr className="border-b border-ink/10 bg-ink/[0.03]">
                        {['Proveedor', 'Servicio', 'Periodo', 'Importe', 'Owner', 'Cuenta', 'Estado', 'Conf. norm.', 'Comentario'].map(
                          (h) => (
                            <th
                              key={h}
                              className="text-[10px] uppercase tracking-wider text-ink-subtle px-4 py-3 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {data.normalized_open_accruals.map((r, idx) => (
                        <tr key={idx} className="border-b border-ink/[0.06] hover:bg-ink/[0.03]">
                          <td className="px-4 py-3 text-xs text-ink">{r.supplier || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted max-w-[200px]">
                            <span className="line-clamp-2">{r.service || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-ink whitespace-nowrap">{r.period || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono text-ink">{formatMoneyEUR(r.amount)}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{r.owner || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{r.account || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{r.status || '—'}</td>
                          <td className="px-4 py-3 text-xs capitalize text-ink-muted">{r.normalization_confidence}</td>
                          <td className="px-4 py-3 text-xs text-ink-subtle max-w-[220px]">
                            <span className="line-clamp-2">{r.raw_comment || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
              3. Solicitudes de provisión normalizadas
            </h2>
            {data.normalized_provision_requests.length === 0 ? (
              <p className="text-sm text-ink-subtle mb-10">Sin filas (no se subió archivo o quedó vacío).</p>
            ) : (
              <div className="editorial-glass-strong rounded-2xl overflow-hidden border border-ink/10 mb-10">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[880px]">
                    <thead>
                      <tr className="border-b border-ink/10 bg-ink/[0.03]">
                        {['Proveedor', 'Servicio', 'Periodo', 'Solicitado', 'Owner', 'Dept.', 'Conf. norm.', 'Comentario'].map((h) => (
                          <th
                            key={h}
                            className="text-[10px] uppercase tracking-wider text-ink-subtle px-4 py-3 font-medium whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.normalized_provision_requests.map((r, idx) => (
                        <tr key={idx} className="border-b border-ink/[0.06] hover:bg-ink/[0.03]">
                          <td className="px-4 py-3 text-xs text-ink">{r.supplier || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted max-w-[200px]">
                            <span className="line-clamp-2">{r.service || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-ink whitespace-nowrap">{r.period || '—'}</td>
                          <td className="px-4 py-3 text-xs font-mono text-ink">
                            {formatMoneyEUR(r.requested_amount)}
                          </td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{r.owner || '—'}</td>
                          <td className="px-4 py-3 text-xs text-ink-muted">{r.department || '—'}</td>
                          <td className="px-4 py-3 text-xs capitalize text-ink-muted">{r.normalization_confidence}</td>
                          <td className="px-4 py-3 text-xs text-ink-subtle max-w-[220px]">
                            <span className="line-clamp-2">{r.comment || '—'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2 mt-10">
              Salidas del pack de cierre
            </h2>
            <p className="text-[11px] text-ink-subtle mb-6 max-w-3xl leading-relaxed">
              Orden sugerido: recomendaciones → decisiones pendientes → confirmar asientos. Al final de la página tienes la
              revisión de <span className="text-ink-muted">antigüedad</span> y las{' '}
              <span className="text-ink-muted">preguntas modelo para owners</span>, después de haber cerrado ese repaso.
            </p>

                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
                  4. Acciones recomendadas
                </h2>
                {data.recommended_actions.length === 0 ? (
                  <p className="text-sm text-ink-subtle mb-10">
                    Sin recomendaciones (faltan solicitudes/devengos o no hubo cruces).
                  </p>
                ) : (
                  <>
                {data.recommended_actions.some((r) => r.confidence === 'high') ? (
                  <div className="flex flex-wrap items-center justify-end gap-3 mb-3">
                    <button
                      type="button"
                      onClick={acceptAllHighConfidence}
                      className="rounded-full px-4 py-2 text-[11px] font-medium border border-ink/20 text-ink hover:bg-ink/[0.05] transition-colors"
                    >
                      Aceptar todas (alta confianza · OK)
                    </button>
                  </div>
                ) : null}
                <div className="editorial-glass-strong rounded-2xl overflow-hidden border border-ink/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[1420px]">
                      <thead>
                        <tr className="border-b border-ink/10 bg-ink/[0.03]">
                          {[
                            'Acción',
                            'Proveedor',
                            'Servicio',
                            'Periodo',
                            'Factura €',
                            'OA €',
                            'Provisión €',
                            'Recomendado €',
                            'Conf.',
                            'Marcadores control',
                            'Ok / No ok',
                            'Motivo',
                          ].map((h) => (
                            <th
                              key={h}
                              className="text-[10px] uppercase tracking-wider text-ink-subtle px-4 py-3 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.recommended_actions.map((r, idx) => {
                          const ha = highApproval[idx] ?? '';
                          const pf = policyFlagsForRecommendation(r, data.normalized_open_accruals, closingMonth);
                          return (
                            <tr
                              key={idx}
                              className={`border-b border-ink/[0.06] hover:bg-ink/[0.03] ${
                                needsOwnerReview(r) ? 'border-l-[3px] border-l-accent-amber/70 bg-accent-amber/[0.04]' : ''
                              }`}
                            >
                              <td className="px-4 py-3 text-xs text-ink font-medium whitespace-nowrap">{r.action}</td>
                              <td className="px-4 py-3 text-xs text-ink">{r.supplier || '—'}</td>
                              <td className="px-4 py-3 text-xs text-ink-muted max-w-[180px]">
                                <span className="line-clamp-2">{r.service || '—'}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-ink whitespace-nowrap">{r.period || '—'}</td>
                              <td className="px-4 py-3 text-xs font-mono text-ink">{formatMoneyEUR(r.invoice_amount)}</td>
                              <td className="px-4 py-3 text-xs font-mono text-ink">{formatMoneyEUR(r.open_accrual_amount)}</td>
                              <td className="px-4 py-3 text-xs font-mono text-ink">
                                {formatMoneyEUR(r.provision_request_amount)}
                              </td>
                              <td className="px-4 py-3 text-xs font-mono text-ink">{formatMoneyEUR(r.recommended_amount)}</td>
                              <td className="px-4 py-3 text-xs capitalize text-ink-muted">{r.confidence}</td>
                              <td className="px-4 py-3 text-xs text-ink-subtle max-w-[200px] font-mono" title={pf.join(', ')}>
                                <span className="line-clamp-2">{pf.length ? pf.join(', ') : '—'}</span>
                              </td>
                              <td className="px-4 py-3 text-xs align-top">
                                {r.confidence === 'high' ? (
                                  <div className="flex flex-col gap-1.5 min-w-[7.5rem]">
                                    <div className="flex gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => setHighConf(idx, 'ok')}
                                        title="OK"
                                        className={`inline-flex items-center justify-center rounded-lg p-2 border transition-colors ${
                                          ha === 'ok'
                                            ? 'border-ink/40 bg-ink/[0.08] text-ink'
                                            : 'border-ink/10 text-ink-muted hover:border-ink/25 hover:text-ink'
                                        }`}
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setHighConf(idx, 'not_ok')}
                                        title="No OK"
                                        className={`inline-flex items-center justify-center rounded-lg p-2 border transition-colors ${
                                          ha === 'not_ok'
                                            ? 'border-accent-coral/70 bg-accent-coral/10 text-accent-coral'
                                            : 'border-ink/10 text-ink-muted hover:border-ink/25 hover:text-ink'
                                        }`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    {ha ? (
                                      <span
                                        className={`text-[10px] font-medium ${
                                          ha === 'ok' ? 'text-ink-muted' : 'text-accent-coral'
                                        }`}
                                      >
                                        {ha === 'ok' ? 'Validado OK' : 'Marcado no OK'}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-ink-subtle">Pendiente</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-ink-subtle">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-ink-subtle max-w-[240px]">
                                <span className="line-clamp-2">{r.reason || '—'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="px-4 py-2 text-[11px] text-ink-subtle border-t border-ink/10">
                    Filas con banda lateral ámbar: revisión adicional en «Decisiones pendientes». Alta confianza: marca OK o
                    No OK en esta tabla (y «Aceptar todas» si aplica). Tras «Confirmar decisiones» se generan asientos de
                    ejemplo tipo SAP / PGC (demo).
                  </p>
                </div>
              </>
            )}

            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2 mt-10">
              5. Decisiones pendientes{' '}
              <span className="text-[10px] font-normal lowercase text-ink-subtle">(post-análisis)</span>
            </h2>
            {data.recommended_actions.length === 0 || uncertainRecommendations.length === 0 ? (
              <p className="text-sm text-ink-subtle mb-4">
                {data.recommended_actions.length === 0
                  ? 'Sin recomendaciones que revisar.'
                  : 'No hay filas en esta sección (casos media/baja o reverso explícito). Las de alta confianza se validan con OK / No OK en la tabla de recomendaciones.'}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-muted mb-4 max-w-3xl leading-relaxed">
                  Para cada caso inseguro ({uncertainRecommendations.length}), indica cómo debe proceder controlling.
                  Opciones relacionadas con reverso solo aparecen cuando la recomendación toca ese contexto.
                </p>
                <div className="space-y-4 mb-12">
                  {uncertainRecommendations.map(({ row: r, idx, invoiceHit }) => {
                      const reversalCtx = isReversalRelatedAction(r.action) || r.open_accrual_amount != null;
                      const expanded = !!expandedReviewDetail[idx];
                      const choice = reviewChoices[idx] ?? '';
                      const choiceChip = (value: Exclude<OwnerReviewChoice, ''>, label: string) => {
                        const sel = choice === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setChoice(idx, value)}
                            className={`rounded-lg px-3 py-2 text-left text-[11px] font-medium transition-colors border ${
                              sel
                                ? 'border-ink/35 bg-ink/[0.06] text-ink'
                                : 'border-ink/10 bg-ink/[0.03] text-ink-muted hover:border-ink/20 hover:text-ink'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      };

                      return (
                        <div
                          key={`review-${idx}`}
                          className="rounded-xl border border-ink/10 bg-ink/[0.03] p-4 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold text-ink">
                                {r.supplier || '—'}{' '}
                                <span className="font-normal text-ink-subtle">
                                  · Fila recomendaciones #{idx + 1}
                                </span>
                              </p>
                              <p className="mt-1 text-[11px] text-ink font-medium">{r.action}</p>
                              <p className="mt-2 text-[11px] text-ink-subtle line-clamp-2" title={r.reason}>
                                {r.reason || '—'}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize ${
                                r.confidence === 'low'
                                  ? 'bg-accent-coral/15 text-accent-coral'
                                  : r.confidence === 'medium'
                                    ? 'bg-accent-amber/15 text-accent-amber'
                                    : 'bg-ink/10 text-ink-muted'
                              }`}
                            >
                              Conf. {r.confidence}
                            </span>
                          </div>

                            {r.confidence === 'high' ? (
                              <p className="mt-2 text-[10px] text-ink-subtle">
                                Esta fila es de alta confianza: además debes marcar OK o No OK en la tabla de recomendaciones
                                (arriba).
                              </p>
                            ) : null}

                            <div className="mt-4">
                            <p className="text-[10px] uppercase tracking-wide text-ink-subtle mb-2">
                              Tu decisión
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                              {choiceChip('accept_engine', 'Acepto la recomendación del sistema')}
                              {choiceChip('defer', 'Dejar pendiente / otro criterio')}
                              {reversalCtx ? choiceChip('confirm_reversal', 'Reverso o liquidación: sí') : null}
                              {reversalCtx ? choiceChip('no_reversal', 'Reverso: no / mantener OA') : null}
                            </div>
                            {!choice && (
                              <p className="mt-2 text-[10px] text-ink-subtle">Selecciona una opción cuando hayas revisado el caso.</p>
                            )}
                          </div>

                          <div className="mt-4 pt-3 border-t border-ink/10">
                            <button
                              type="button"
                              onClick={() => toggleReviewExpand(idx)}
                              className="flex items-center gap-2 text-[11px] text-ink-muted hover:text-ink transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Factura relacionada / datos OCR
                              <ChevronDown
                                className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                            {expanded && (
                              <div className="mt-3 rounded-lg bg-cream-soft border border-ink/10 p-3 text-[11px]">
                                {!invoiceHit ? (
                                  <>
                                    <p className="text-ink-muted">
                                      No se encontró automáticamente una factura en la tabla OCR (proveedor/importe ambiguos).
                                      Revisa manualmente la sección «1. Resultados OCR de facturas» o el PDF en el fichero cargado.
                                    </p>
                                    {r.invoice_amount != null && (
                                      <p className="mt-2 font-mono text-ink">
                                        Importe de referencia en la recomendación: {formatMoneyEUR(r.invoice_amount)}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                      <span className="text-ink-muted">Coincidencia probable (heurística):</span>
                                      <button
                                        type="button"
                                        onClick={() => scrollToInvoice(invoiceHit.idx)}
                                        className="rounded-lg border border-ink/20 px-3 py-1.5 text-[10px] font-medium text-ink hover:bg-ink/[0.05]"
                                      >
                                        Ir a fila OCR
                                      </button>
                                    </div>
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-ink">
                                      <div>
                                        <dt className="text-ink-subtle">Archivo</dt>
                                        <dd className="font-mono text-[10px] break-all">{invoiceHit.inv.file_name}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-subtle">Proveedor</dt>
                                        <dd>{invoiceHit.inv.supplier_name || '—'}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-subtle">Fecha factura</dt>
                                        <dd>{invoiceHit.inv.invoice_date || '—'}</dd>
                                      </div>
                                      <div>
                                        <dt className="text-ink-subtle">Total</dt>
                                        <dd className="font-mono">{formatTotal(invoiceHit.inv) || '—'}</dd>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <dt className="text-ink-subtle">Concepto</dt>
                                        <dd className="text-ink-muted">{invoiceHit.inv.concept_summary || '—'}</dd>
                                      </div>
                                      <div className="sm:col-span-2">
                                        <dt className="text-ink-subtle">Período devengo (OCR)</dt>
                                        <dd>{invoiceHit.inv.accrual_month_or_period || '—'}</dd>
                                      </div>
                                    </dl>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
            )}

            {data.recommended_actions.length > 0 ? (
              <div className="mt-12 pt-8 border-t border-ink/10 max-w-3xl mx-auto text-center">
                <button
                  type="button"
                  disabled={confirmPostingBusy}
                  onClick={() => void confirmDecisionsPosting()}
                  className="rounded-xl bg-ink px-8 py-3.5 text-sm font-semibold text-cream-soft hover:bg-ink/90 transition-colors shadow-md shadow-ink/10 disabled:opacity-45 disabled:pointer-events-none flex items-center justify-center gap-2 mx-auto"
                >
                  {confirmPostingBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
                  Confirmar decisiones y ver asientos
                </button>
                {confirmPostingBusy ? (
                  <ProgressPctBar
                    pct={confirmPostingPct}
                    sublabel="Generando asientos FI de ejemplo desde tus decisiones; el último % se muestra al estar listos."
                    className="max-w-md mx-auto mt-6 px-2"
                  />
                ) : null}
                {confirmPostingError ? (
                  <p className="mt-4 text-sm text-accent-coral">{confirmPostingError}</p>
                ) : null}
                <p className="mt-3 text-[11px] text-ink-subtle max-w-xl mx-auto">
                  Requiere OK / No OK en cada fila de alta confianza y una opción en cada «decisión pendiente» cuando aplique.
                </p>
              </div>
            ) : null}

            {confirmedJournalLines !== null ? (
              <div
                ref={journalAnchorRef}
                id="asientos-propuestos"
                className="mt-12 scroll-mt-28 editorial-glass-strong rounded-2xl border border-ink/10 p-6 lg:p-8"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  <div>
                    <h2 className="text-sm font-semibold text-ink tracking-tight">
                      Asientos propuestos (formato FI / Excel · demo)
                    </h2>
                    <p className="mt-1 text-[11px] text-ink-subtle max-w-2xl leading-relaxed">
                      Cuentas PGC y centros de coste son{' '}
                      <span className="text-ink-muted font-medium">inventados</span>{' '}
                      para la maqueta (clase documento SA, líneas en par debe/haber). Sustituye por tu plan de cuentas y
                      reglas de imputación reales antes de cargar en SAP.
                    </p>
                  </div>
                  {confirmedJournalLines.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void downloadPostingJournalExcel(confirmedJournalLines)}
                      className="shrink-0 rounded-full px-5 py-2 text-xs font-medium border border-ink/20 text-ink hover:bg-ink/[0.05] transition-colors"
                    >
                      Descargar Excel (FI_document_lines)
                    </button>
                  ) : null}
                </div>

                {confirmedJournalLines.length === 0 ? (
                  <p className="text-sm text-ink-subtle">
                    No se generaron líneas contables: todas las filas quedaron excluidas (No OK, diferir, sin acción
                    contable, etc.).
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-ink/10">
                    <table className="w-full text-left min-w-[960px] text-xs">
                      <thead>
                        <tr className="border-b border-ink/10 bg-ink/[0.03]">
                          {[
                            'Ref. doc.',
                            'Texto cab.',
                            'Pos',
                            'Cuenta',
                            'Debe',
                            'Haber',
                            'CeCo',
                            'Asignación',
                            'Texto pos.',
                          ].map((h) => (
                            <th
                              key={h}
                              className="text-[10px] uppercase tracking-wider text-ink-subtle px-3 py-2.5 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {confirmedJournalLines.map((line, li) => (
                          <tr key={li} className="border-b border-ink/[0.06] hover:bg-ink/[0.03]">
                            <td className="px-3 py-2 font-mono text-ink-muted whitespace-nowrap">{line.doc_number_ref}</td>
                            <td className="px-3 py-2 text-ink-subtle max-w-[140px] truncate" title={line.header_text}>
                              {line.header_text}
                            </td>
                            <td className="px-3 py-2 text-ink-subtle">{line.line_item}</td>
                            <td className="px-3 py-2 font-mono text-ink whitespace-nowrap">{line.gl_account}</td>
                            <td className="px-3 py-2 font-mono text-ink">
                              {line.amount_debit_loc > 0 ? formatMoneyEUR(line.amount_debit_loc) : '—'}
                            </td>
                            <td className="px-3 py-2 font-mono text-ink">
                              {line.amount_credit_loc > 0 ? formatMoneyEUR(line.amount_credit_loc) : '—'}
                            </td>
                            <td className="px-3 py-2 text-ink-subtle">{line.cost_center || '—'}</td>
                            <td className="px-3 py-2 font-mono text-ink-subtle">{line.assignment}</td>
                            <td className="px-3 py-2 text-ink-subtle max-w-[200px]" title={line.line_text}>
                              <span className="line-clamp-2">{line.line_text}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            <div className="mt-16 pt-10 border-t border-ink/10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
                6. Revisión de antigüedad{' '}
                <span className="text-[10px] font-normal lowercase text-ink-subtle">(tras el repaso de decisiones y asientos)</span>
              </h2>
              {!closingMonth.trim() ? (
                <p className="text-[11px] text-ink-subtle mb-4 max-w-3xl">
                  Indica arriba el «Mes de cierre» para contextualizar tramos y el comprobador de políticas (si no, se usa la
                  fecha de hoy como referencia).
                </p>
              ) : (
                <p className="text-[11px] text-ink-subtle mb-4 max-w-3xl">
                  Antigüedad respecto al fin de{' '}
                  <span className="text-ink-muted font-medium">{closingMonth.trim()}</span>.
                </p>
              )}
              {data.normalized_open_accruals.length === 0 ? (
                <p className="text-sm text-ink-subtle mb-4">
                  No hay devengos abiertos cargados — sube un fichero de devengos con periodo/fechas para calcular los tramos
                  (0–30 normal, 31–60 revisión, 61–90 riesgo, {'>'}90 urgente).
                </p>
              ) : (
                <div className="editorial-glass-strong rounded-2xl overflow-hidden border border-ink/10">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[960px]">
                      <thead>
                        <tr className="border-b border-ink/10 bg-ink/[0.03]">
                          {['Proveedor', 'Servicio', 'Periodo', 'Importe', 'Tramo', 'Riesgo', 'Motivo'].map((h) => (
                            <th
                              key={h}
                              className="text-[10px] uppercase tracking-wider text-ink-subtle px-4 py-3 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {agingReviewRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-ink/[0.06] hover:bg-ink/[0.03]">
                            <td className="px-4 py-3 text-xs text-ink">{row.supplier || '—'}</td>
                            <td className="px-4 py-3 text-xs text-ink-muted max-w-[200px]">
                              <span className="line-clamp-2">{row.service || '—'}</span>
                            </td>
                            <td className="px-4 py-3 text-xs text-ink whitespace-nowrap">{row.period || '—'}</td>
                            <td className="px-4 py-3 text-xs font-mono text-ink">{formatMoneyEUR(row.amount)}</td>
                            <td className="px-4 py-3 text-xs text-ink">{row.age_bucket}</td>
                            <td className="px-4 py-3 text-xs">
                              <span
                                className={
                                  row.risk_level === 'urgente'
                                    ? 'text-accent-coral'
                                    : row.risk_level === 'riesgo'
                                      ? 'text-accent-amber'
                                      : row.risk_level === 'revisión'
                                        ? 'text-accent-blue'
                                        : row.risk_level === 'normal'
                                          ? 'text-ink-subtle'
                                          : 'text-ink-subtle'
                                }
                              >
                                {row.risk_level}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-ink-subtle max-w-[320px]">
                              <span className="line-clamp-2">{row.reason}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle mb-2">
                7. Preguntas para owners{' '}
                <span className="text-[10px] font-normal lowercase text-ink-subtle">(tras el repaso)</span>
              </h2>
              {ownerQuestionRows.length === 0 ? (
                <p className="text-sm text-ink-subtle">
                  No hay preguntas generadas — el motor solo redacta texto para{' '}
                  <span className="font-mono text-ink-muted">ask_owner</span>,{' '}
                  <span className="font-mono text-ink-muted">manual_review</span> y{' '}
                  <span className="font-mono text-ink-muted">new_accrual</span>.
                </p>
              ) : (
                <div className="space-y-4">
                  {ownerQuestionRows.map((row, idx) => (
                    <div
                      key={`${row.supplier}-${idx}`}
                      className="rounded-xl border border-ink/10 bg-ink/[0.03] p-4 sm:p-5"
                    >
                      <p className="text-[10px] font-mono text-ink-muted mb-2">{row.action}</p>
                      <p className="text-sm text-ink leading-relaxed">{row.question}</p>
                      <p className="mt-2 text-[10px] text-ink-subtle">
                        {row.supplier} · {row.period || '—'} · {row.amountLabel}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
    </div>
  );
}
