/** JSON shape returned per invoice (subset enforced in analysis). */
export type InvoiceAiRow = {
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

export type AnalyzeKpis = {
  total_invoices_processed: number;
  period_detected: number;
  period_not_detected: number;
  manual_review_required: number;
  unreadable_pdfs: number;
};
