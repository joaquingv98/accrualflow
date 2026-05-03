import 'dotenv/config';
import { createRequire } from 'node:module';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import AdmZip from 'adm-zip';
import OpenAI from 'openai';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text?: string }>;
import { INVOICE_ANALYSIS_SYSTEM_PROMPT } from './invoicePrompt';
import type { AnalyzeKpis, InvoiceAiRow } from './types';
export type { AnalyzeKpis, InvoiceAiRow } from './types';

import { parseTabularFile } from './tabularParse';
import {
  normalizeOpenAccrualsWithOpenAI,
  normalizeProvisionRequestsWithOpenAI,
  type NormalizedOpenAccrual,
  type NormalizedProvisionRequest,
} from './tabularNormalize';
import { buildRecommendedActions, type RecommendedAction } from './recommendedActionsEngine';

// TODO: añadir OCR visual para PDFs escaneados.
// TODO: soporte layouts Excel más heterogéneos (tabularParse.ts).
// TODO: añadir embeddings para matching semántico (matching.ts).
// TODO: añadir flujo de aprobación/rechazo de recomendaciones.
// FIXME: no considerar recomendaciones como asientos ya contabilizados (recommendedActionsEngine.ts).

/** Render/Railway inyectan PORT; local puede usar OCR_API_PORT o 8787. */
const PORT = Number(process.env.PORT) || Number(process.env.OCR_API_PORT) || 8787;
const app = express();

const localhostOrigin = /^https?:\/\/localhost:\d+$/i;
const extraCorsOrigins =
  process.env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (localhostOrigin.test(origin)) return true;
  if (extraCorsOrigins.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (hostname.endsWith('.netlify.app') || hostname === 'netlify.app') return true;
  } catch {
    /* ignore */
  }
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) callback(null, origin ?? true);
      else callback(null, false);
    },
    credentials: true,
  }),
);

const uploadAnalyze = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: 'zip_file', maxCount: 1 },
  { name: 'open_accruals_file', maxCount: 1 },
  { name: 'provision_requests_file', maxCount: 1 },
]);

export type AnalyzeFullResponse = {
  kpis: AnalyzeKpis;
  /** Alias retrocompatible — mismas que `normalized_invoices`. */
  results: InvoiceAiRow[];
  normalized_invoices: InvoiceAiRow[];
  normalized_open_accruals: NormalizedOpenAccrual[];
  normalized_provision_requests: NormalizedProvisionRequest[];
  recommended_actions: RecommendedAction[];
  warnings: string[];
};

function parseJsonContent(raw: string): Record<string, unknown> {
  let t = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return JSON.parse(t) as Record<string, unknown>;
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceRow(data: Record<string, unknown>, fileName: string): InvoiceAiRow {
  return {
    file_name: fileName,
    supplier_name: String(data.supplier_name ?? ''),
    invoice_number: String(data.invoice_number ?? ''),
    invoice_date: String(data.invoice_date ?? ''),
    due_date: String(data.due_date ?? ''),
    concept_summary: String(data.concept_summary ?? ''),
    base_amount: numOrNull(data.base_amount),
    tax_amount: numOrNull(data.tax_amount),
    total_amount: numOrNull(data.total_amount),
    currency: String(data.currency ?? 'EUR'),
    service_period_detected: Boolean(data.service_period_detected),
    service_period_start: String(data.service_period_start ?? ''),
    service_period_end: String(data.service_period_end ?? ''),
    accrual_month_or_period: String(data.accrual_month_or_period ?? 'not identified'),
    period_evidence: String(data.period_evidence ?? ''),
    period_detection_confidence: String(data.period_detection_confidence ?? 'not_detected'),
    is_recurring_hint: String(data.is_recurring_hint ?? 'unknown'),
    possible_multi_period_invoice: String(data.possible_multi_period_invoice ?? 'unknown'),
    requires_manual_review: Boolean(data.requires_manual_review),
    manual_review_reason: String(data.manual_review_reason ?? ''),
    raw_extraction_quality: String(data.raw_extraction_quality ?? 'good'),
  };
}

function unreadableRow(fileName: string, reason: string): InvoiceAiRow {
  return {
    file_name: fileName,
    supplier_name: '',
    invoice_number: '',
    invoice_date: '',
    due_date: '',
    concept_summary: '',
    base_amount: null,
    tax_amount: null,
    total_amount: null,
    currency: 'EUR',
    service_period_detected: false,
    service_period_start: '',
    service_period_end: '',
    accrual_month_or_period: 'not identified',
    period_evidence: '',
    period_detection_confidence: 'not_detected',
    is_recurring_hint: 'unknown',
    possible_multi_period_invoice: 'unknown',
    requires_manual_review: true,
    manual_review_reason: reason,
    raw_extraction_quality: 'unreadable',
  };
}

function listPdfBuffers(zipBuf: Buffer): { displayName: string; buffer: Buffer }[] {
  const zip = new AdmZip(zipBuf);
  const out: { displayName: string; buffer: Buffer }[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const normalized = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.includes('..')) continue;
    if (normalized.startsWith('__MACOSX/')) continue;
    if (!normalized.toLowerCase().endsWith('.pdf')) continue;
    try {
      const buffer = entry.getData();
      out.push({ displayName: normalized, buffer });
    } catch {
      /* skip corrupted entry */
    }
  }
  return out;
}

function computeKpis(results: InvoiceAiRow[]): AnalyzeKpis {
  const unreadable_pdfs = results.filter((r) => r.raw_extraction_quality === 'unreadable').length;
  const period_detected = results.filter((r) => r.service_period_detected).length;
  const period_not_detected = results.filter(
    (r) => !r.service_period_detected && r.raw_extraction_quality !== 'unreadable',
  ).length;
  const manual_review_required = results.filter((r) => r.requires_manual_review).length;
  return {
    total_invoices_processed: results.length,
    period_detected,
    period_not_detected,
    manual_review_required,
    unreadable_pdfs,
  };
}

async function analyzeWithOpenAi(
  client: OpenAI,
  extractedText: string,
  displayName: string,
  closingMonth: string | undefined,
): Promise<InvoiceAiRow> {
  const userBlocks = [
    `Nombre de archivo: ${displayName}`,
    closingMonth
      ? `Mes de cierre proporcionado (solo contexto; no usar como período salvo evidencia explícita en factura): ${closingMonth}`
      : '',
    '---',
    'Texto extraído del PDF:',
    extractedText.slice(0, 120_000),
  ]
    .filter(Boolean)
    .join('\n');

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: INVOICE_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userBlocks },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  const parsed = parseJsonContent(content);
  return coerceRow(parsed, displayName);
}

async function processPdfInvoices(
  zipBuf: Buffer,
  closing_month: string | undefined,
): Promise<{ results: InvoiceAiRow[] }> {
  let pdfs: { displayName: string; buffer: Buffer }[];
  try {
    pdfs = listPdfBuffers(zipBuf);
  } catch {
    throw new Error('ZIP_ARCHIVE_READ');
  }

  type Extracted = { displayName: string; collapsed: string };
  const extracted: Extracted[] = [];

  for (const pdf of pdfs) {
    let text = '';
    try {
      const parsed = await pdfParse(pdf.buffer);
      text = typeof parsed?.text === 'string' ? parsed.text : '';
    } catch {
      text = '';
    }
    extracted.push({
      displayName: pdf.displayName,
      collapsed: text.replace(/\s+/g, ' ').trim(),
    });
  }

  const anyReadableForAi = extracted.some((x) => x.collapsed.length >= 100);
  const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

  if (anyReadableForAi && !client) {
    throw new Error('OPENAI_MISSING');
  }

  const results: InvoiceAiRow[] = [];

  for (const ex of extracted) {
    const { displayName, collapsed } = ex;
    if (!collapsed.length || collapsed.length < 100) {
      results.push(
        unreadableRow(
          displayName,
          'Texto extraído insuficiente (< 100 caracteres) o PDF no legible para extracción; no se invoca IA.',
        ),
      );
      continue;
    }

    if (!client) {
      results.push(unreadableRow(displayName, 'OPENAI no disponible'));
      continue;
    }

    try {
      const row = await analyzeWithOpenAi(client, collapsed, displayName, closing_month);
      row.file_name = displayName;
      results.push(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'OpenAI analysis failed.';
      results.push({
        ...unreadableRow(displayName, msg),
        raw_extraction_quality: 'good',
        manual_review_reason: `Fallo IA: ${msg}`,
        requires_manual_review: true,
      });
    }
  }

  return { results };
}

app.post('/api/ocr-test/analyze', uploadAnalyze, async (req, res) => {
  try {
    const warnings: string[] = [];
    const fileMap = req.files as Record<string, Express.Multer.File[]> | undefined;
    const zip = fileMap?.zip_file?.[0];
    if (!zip?.buffer?.length) {
      res.status(400).json({ error: 'zip_file is required (multipart/form-data).' });
      return;
    }

    const closing_month =
      typeof req.body?.closing_month === 'string' && req.body.closing_month.trim().length > 0
        ? req.body.closing_month.trim()
        : undefined;

    let results: InvoiceAiRow[];
    try {
      const r = await processPdfInvoices(zip.buffer, closing_month);
      results = r.results;
    } catch (e) {
      if ((e instanceof Error ? e.message : '') === 'ZIP_ARCHIVE_READ') {
        res.status(400).json({ error: 'Could not read ZIP archive.' });
        return;
      }
      if ((e instanceof Error ? e.message : '') === 'OPENAI_MISSING') {
        res.status(500).json({
          error: 'OPENAI_API_KEY is not configured. Set it to analyze readable PDF text with AI.',
        });
        return;
      }
      throw e;
    }

    const openSheet = fileMap?.open_accruals_file?.[0];
    const provisionSheet = fileMap?.provision_requests_file?.[0];

    const needAiForExtras =
      (openSheet?.buffer?.length ?? 0) > 0 || (provisionSheet?.buffer?.length ?? 0) > 0;

    let normalized_open_accruals: NormalizedOpenAccrual[] = [];
    let normalized_provision_requests: NormalizedProvisionRequest[] = [];

    if (needAiForExtras && !process.env.OPENAI_API_KEY) {
      res.status(500).json({
        error:
          'OPENAI_API_KEY is required to normalize spreadsheet rows (open accruals / provision requests).',
      });
      return;
    }

    const extraClient =
      process.env.OPENAI_API_KEY && needAiForExtras
        ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        : null;

    if (openSheet?.buffer?.length) {
      try {
        const parsed = await parseTabularFile(openSheet.buffer, openSheet.originalname);
        if (!parsed.rows.length) warnings.push('open_accruals_file: archivo sin filas de datos.');
        else if (extraClient)
          normalized_open_accruals = await normalizeOpenAccrualsWithOpenAI(extraClient, parsed.rows);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'parse error';
        warnings.push(`open_accruals_file: ${msg}`);
      }
    }

    if (provisionSheet?.buffer?.length) {
      try {
        const parsed = await parseTabularFile(provisionSheet.buffer, provisionSheet.originalname);
        if (!parsed.rows.length) warnings.push('provision_requests_file: archivo sin filas de datos.');
        else if (extraClient)
          normalized_provision_requests = await normalizeProvisionRequestsWithOpenAI(
            extraClient,
            parsed.rows,
          );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'parse error';
        warnings.push(`provision_requests_file: ${msg}`);
      }
    }

    const sharedClientForMatches = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;

    const recommended_actions = await buildRecommendedActions({
      client: sharedClientForMatches,
      normalized_invoices: results,
      normalized_open_accruals,
      normalized_provision_requests,
    });

    const body: AnalyzeFullResponse = {
      kpis: computeKpis(results),
      results,
      normalized_invoices: results,
      normalized_open_accruals,
      normalized_provision_requests,
      recommended_actions,
      warnings,
    };

    res.json(body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    res.status(500).json({ error: msg });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.info(`[ocr-test-api] listening on 0.0.0.0:${PORT}`);
});
