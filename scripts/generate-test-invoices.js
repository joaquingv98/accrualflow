/**
 * Genera 40 PDFs ficticios aleatorios para pruebas OCR de AccrualFlow (mezcla de casos y proveedores).
 * Repetir el mismo lote: GEN_INVOICE_SEED=1234567890 npm run gen:test-data
 * También escribe en test-data/generated-invoices/:
 *   - demo_open_accruals_controlling.csv  (indicaciones tipo controlling, cabeceras no estándar)
 *   - demo_provision_requests.csv       (solicitudes de provisión demo)
 *
 * TODO: add scanned invoice generation later.
 * TODO: add more layout variations.
 * TODO: add multilingual invoices.
 * FIXME: expected_results must not use real company data.
 * FIXME: generated invoices are for testing only, not legally valid invoices.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import AdmZip from 'adm-zip';

const PDF_A4 = { w: 595.28, h: 841.89 };

function wrapWords(text, font, size, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW) {
      line = trial;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const CUSTOMER = {
  name: 'Demo Company SL',
  vat: 'B99999999',
  address: 'Avenida Demo 45, 28001 Madrid, Spain',
  email: 'finance@democompany.test',
};

/** Datos ficticios por proveedor (no representan entidades reales). */
const SUPPLIER_PROFILES = {
  'Nova Marketing SL': {
    vat: 'B88110001',
    address: 'Calle Polaris 18, Polígono Norte, 08908 Hospitalet de Llobregat, Spain',
    email: 'billing@nova-marketing-demo.test',
  },
  'CleanPro Facilities SL': {
    vat: 'B88220002',
    address: 'Av. Neptuno 55, Bloque B, 41011 Sevilla, Spain',
    email: 'finance@cleanpro-demo.test',
  },
  'Rentas Urbanas SL': {
    vat: 'B88330003',
    address: 'Plaza Centro 9, Esc. 2, 46001 Valencia, Spain',
    email: 'admin@rentas-urbanas-demo.test',
  },
  'Green Energy Iberia SL': {
    vat: 'B88440004',
    address: 'Ctra. Demo km 12, Parcela 4, 35015 Las Palmas, Spain',
    email: 'invoices@greenenergy-demo.test',
  },
  'DataBridge Consulting SL': {
    vat: 'B88550005',
    address: 'Edificio Lambda, Piso 6, Gran Vía 200, 28013 Madrid, Spain',
    email: 'accounting@databridge-demo.test',
  },
  'Legal Partners SL': {
    vat: 'B88660006',
    address: 'Pasaje Tauro 3, Oficina 402, 48009 Bilbao, Spain',
    email: 'billing@legalpartners-demo.test',
  },
  'Oficina Plus SL': {
    vat: 'B88770007',
    address: 'Rambla Sur 220, Local 15, 08004 Barcelona, Spain',
    email: 'contacto@oficinaplus-demo.test',
  },
  'Iberia Events SL': {
    vat: 'B88880008',
    address: 'Muelle Bravo 77, Puerto Deportivo, 29660 Marbella, Spain',
    email: 'events@iberia-demo.test',
  },
  'BluePeak Software SL': {
    vat: 'B88990009',
    address: 'Paseo de la Innovación 140, Bizkaia Technology Park, 48170 Zamudio, Spain',
    email: 'subscriptions@bluepeak-demo.test',
  },
  'Shield Insurance SL': {
    vat: 'B88001110',
    address: 'Torre Sirius, Planta 22, Avenida Norte 990, 28046 Madrid, Spain',
    email: 'policies@shieldinsurance-demo.test',
  },
  'TechCore Solutions SL': {
    vat: 'B88002220',
    address: 'Parque Gamma, Nave 5, 28760 Tres Cantos, Spain',
    email: 'invoices@techcore-demo.test',
  },
  'CloudByte Services Ltd': {
    vat: 'GB000000483',
    address: '7 Demo Wharf Road, Canary Demo Quay, E14 9ZZ London, United Kingdom',
    email: 'ar@cloudbyte-demo.test',
  },
  'Helio Logistics SL': {
    vat: 'B88112233',
    address: 'Polígono Demo Sur, Nave 12, 41927 Mairena del Aljarafe, Spain',
    email: 'ops@helio-logistics-demo.test',
  },
  'Nimbus Labs SL': {
    vat: 'B88223344',
    address: 'Calle Viento 44, Edificio Cirrus, 15008 A Coruña, Spain',
    email: 'finance@nimbuslabs-demo.test',
  },
  'VoltAir Industrial SA': {
    vat: 'A00998877',
    address: 'Avda. Industria 900, 28850 Torrejón de Ardoz, Spain',
    email: 'billing@voltair-demo.test',
  },
  'Nordic Freight AB': {
    vat: 'SE5566112233',
    address: 'Box 12, 111 21 Stockholm, Sweden',
    email: 'ap@nordicfreight-demo.test',
  },
  'Pixel Bloom Studio SL': {
    vat: 'B88334455',
    address: 'Calle Color 7, Local B, 46022 Valencia, Spain',
    email: 'studio@pixelbloom-demo.test',
  },
  'Meridian Healthcare SL': {
    vat: 'B88445566',
    address: 'Clínica Demo Norte, Av. Salud 200, 28035 Madrid, Spain',
    email: 'ap@meridian-health-demo.test',
  },
  'Aurora Catering SL': {
    vat: 'B88556677',
    address: 'Cocina Central Demo, Pol. Food 3, 08940 Cornellà, Spain',
    email: 'invoices@aurora-catering-demo.test',
  },
  'Beacon Telecom SL': {
    vat: 'B88667788',
    address: 'Torre Señal 15, Planta 18, 08019 Barcelona, Spain',
    email: 'billing@beacon-telecom-demo.test',
  },
  'Granite Security SL': {
    vat: 'B88778899',
    address: 'Calle Roca 55, 48011 Bilbao, Spain',
    email: 'ar@granite-security-demo.test',
  },
  'HoverDrone SL': {
    vat: 'B88889900',
    address: 'Hangar Demo 2, Aeródromo ficticio, 50200 La Almunia, Spain',
    email: 'finance@hoverdrone-demo.test',
  },
  'Mint Softworks BV': {
    vat: 'NL123456789B01',
    address: 'Keizersgracht 100, 1015 Amsterdam, Netherlands',
    email: 'billing@mintsoftworks-demo.test',
  },
  'Cobalt Analytics SL': {
    vat: 'B88990011',
    address: 'Data Hub Demo, Calle Binario 8, 28037 Madrid, Spain',
    email: 'invoices@cobalt-analytics-demo.test',
  },
  'Rivera Transport SL': {
    vat: 'B99001122',
    address: 'Terminal Demo Este, Módulo 4, 28830 San Fernando, Spain',
    email: 'ap@rivera-transport-demo.test',
  },
  'Summit Beverages SL': {
    vat: 'B99112233',
    address: 'Planta embotellado demo, Ctra. KM 88, 26280 Briñas, Spain',
    email: 'finance@summit-beverages-demo.test',
  },
  'Tide Marine Services Ltd': {
    vat: 'GB998877665',
    address: 'Dock Demo 3, Portsmouth PO1 3LT, United Kingdom',
    email: 'ar@tidemarine-demo.test',
  },
  'Quorum Legal Ltd': {
    vat: 'GB887766554',
    address: 'Chancery Demo House, London EC4A 1BR, United Kingdom',
    email: 'billing@quorumlegal-demo.test',
  },
  'Fernwood HR SL': {
    vat: 'B99223344',
    address: 'People Hub, Plaza Talento 2, 41013 Sevilla, Spain',
    email: 'invoices@fernwood-hr-demo.test',
  },
  'Kettle Robotics GmbH': {
    vat: 'DE998877665',
    address: 'Industriepark Demo 5, 80339 München, Germany',
    email: 'finance@kettle-robotics-demo.test',
  },
};

function euros(n) {
  return `${n.toFixed(2)} EUR`;
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeBaseEUR(spec) {
  if (spec.baseAmountFixed != null) return spec.baseAmountFixed;
  if (spec.baseRangeAnnual) {
    const [min, max] = spec.baseRangeAnnual;
    const seed = spec.invoiceIndex * 7919;
    return min + (seed % (max - min + 1));
  }
  const min = 300;
  const max = 9000;
  const seed = spec.invoiceIndex * 9973;
  return min + (seed % (max - min + 1));
}

function invoiceAmounts(spec) {
  const base = computeBaseEUR(spec);
  const tax = Math.round(base * 0.21 * 100) / 100;
  const total = Math.round((base + tax) * 100) / 100;
  return { base, tax, total };
}

function escapeCsvField(value) {
  if (value == null || value === '') return '';
  const str = String(value);
  if (/[,"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(cols) {
  return cols.map(escapeCsvField).join(',') + '\n';
}

const NUM_TEST_INVOICES = 40;

/** PRNG 0..1. Usa GEN_INVOICE_SEED=número para repetir el mismo lote. */
function mulberry32(seed) {
  return function rng() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getInvoiceBatchSeed() {
  const env = process.env.GEN_INVOICE_SEED;
  if (env != null && String(env).trim() !== '' && /^\d+$/.test(String(env).trim())) {
    return Number(String(env).trim()) >>> 0;
  }
  return crypto.randomBytes(4).readUInt32BE(0);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function toAsciiSlug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

/** Meses demo (solo ene–may 2026) para mezclar textos y fechas. */
const MROWS = [
  ['Enero', 'January', 1, 31],
  ['Febrero', 'February', 2, 28],
  ['Marzo', 'March', 3, 31],
  ['Abril', 'April', 4, 30],
  ['Mayo', 'May', 5, 31],
];

const SERVICES_CLEAR = [
  (m) => `Mantenimiento HVAC ${m} 2026`,
  (m) => `Consultoría operativa — ${m} 2026`,
  (m) => `Licencias software período ${m} 2026`,
  (m) => `Outsourcing nómina ${m} 2026`,
  (m) => `Soporte 24/7 ${m} 2026`,
  (m) => `Consumo cloud facturación ${m} 2026`,
  (m) => `Seguridad y vigilancia ${m} 2026`,
  (m) => `Catering corporativo ${m} 2026`,
  (m) => `Transporte refrigerado ${m} 2026`,
  (m) => `Auditoría interna ${m} 2026`,
  (m) => `Waste collection ${m} 2026`,
];

const SERVICES_NOPERIOD = [
  'Professional fees — block agreement',
  'Miscellaneous supplies',
  'Project milestone billing',
  'Emergency repair services',
  'Router swap — field service',
  'Legal disbursements bundle',
];

const SERVICES_AMBIG = ['Monthly retainer', 'Services rendered', 'Managed services', 'Support package'];

const OA_OBJ_HINTS = [
  'Roll-forward controlling',
  'Devengo pendiente cierre',
  'OA revisión finanzas',
  'Snapshot SAP provisional',
  'CTRL bridge accrual',
];

const OA_OWNERS = ['Laura Gómez', 'Carlos Muñoz', 'IT Accruals', 'Nina K.', 'Finance Ops', 'M. Soto'];
const OA_GLS = ['62002101', '61005500', '63099010', '629011', '629888', '70504020'];
const OA_STATUSES = ['ABIERTO_CTRL', 'revisión_M', 'OPEN', 'pendiente_doc', 'CTRL_REVIEW', 'WF_PENDING'];

const PROV_PREP = ['María Pérez', 'Finance Ops', 'Growth Team', 'Real Estate', 'FP&A', 'Logistics CTRL'];
const PROV_DEPTS = ['MKT-01', 'FIN-22', 'GA-04', 'FIN-40', 'OPS-07', 'HR-03', 'IT-12'];

/**
 * Genera NUM_TEST_INVOICES facturas ficticias variadas (distinto lote salvo GEN_INVOICE_SEED).
 * @returns {{ fileName: string, supplier: string, invoiceDate: string, conceptSummary: string, servicePeriodText: string, invoiceIndex: number, caseType: string, expectedPeriodDetected: string, expectedAccrual: string, multiPeriod: string, manualReview: string, confidence: string, reason: string, baseAmountFixed?: number, baseRangeAnnual?: [number, number] }[]}
 */
function generateRandomInvoiceBatch(rng) {
  const supplierNames = Object.keys(SUPPLIER_PROFILES);

  const casePick = () => {
    const r = rng();
    if (r < 0.2) return 'clear_monthly_es';
    if (r < 0.3) return 'clear_month_en';
    if (r < 0.42) return 'clear_range_iso';
    if (r < 0.54) return 'no_period';
    if (r < 0.64) return 'ambiguous';
    if (r < 0.72) return 'multi_q';
    if (r < 0.78) return 'multi_annual';
    if (r < 0.84) return 'cross_year_insurance';
    if (r < 0.94) return 'posterior_invoice_prior_service';
    return 'same_supplier_line';
  };

  const out = [];
  for (let i = 0; i < NUM_TEST_INVOICES; i++) {
    const invoiceIndex = i + 1;
    const caseType = casePick();
    let supplier = pick(rng, supplierNames);
    if (caseType === 'same_supplier_line' && out.length > 0 && rng() > 0.35) {
      supplier = out[out.length - 1].supplier;
    }
    const mi = Math.floor(rng() * MROWS.length);
    const [mesEs, mesEn, monthNum, lastDay] = MROWS[mi];
    const pad2 = (n) => String(n).padStart(2, '0');
    const iso0 = `2026-${pad2(monthNum)}-01`;
    const iso1 = `2026-${pad2(monthNum)}-${pad2(lastDay)}`;
    const token = Math.floor(rng() * 1e9)
      .toString(36)
      .slice(0, 5);

    const spec = {
      supplier,
      invoiceIndex,
      baseAmountFixed: null,
      baseRangeAnnual: null,
    };

    const finalize = (tag, conceptSummary, rest) => {
      const slug = toAsciiSlug(conceptSummary).slice(0, 22) || 'line';
      spec.fileName = `${String(invoiceIndex).padStart(2, '0')}_${tag}_${slug}_${token}.pdf`;
      spec.conceptSummary = conceptSummary;
      Object.assign(spec, rest);
    };

    if (caseType === 'clear_monthly_es') {
      const concept = pick(rng, SERVICES_CLEAR)(mesEs);
      const day = 5 + Math.floor(rng() * 20);
      spec.invoiceDate = `2026-${pad2(monthNum)}-${pad2(day)}`;
      finalize('clear_es', concept, {
        caseType: 'clear_monthly_period',
        servicePeriodText: `${mesEs} 2026`,
        expectedPeriodDetected: 'true',
        expectedAccrual: `${mesEn} 2026 / ${mesEs} 2026`,
        multiPeriod: 'no',
        manualReview: 'false',
        confidence: 'high',
        reason: `Demo: mes explícito (${mesEs} 2026).`,
      });
    } else if (caseType === 'clear_month_en') {
      const concept = `Field logistics ${mesEn} 2026 — route optimization`;
      const day = 3 + Math.floor(rng() * 22);
      spec.invoiceDate = `2026-${pad2(monthNum)}-${pad2(day)}`;
      finalize('clear_en', concept, {
        caseType: 'clear_monthly_period',
        servicePeriodText: `${mesEn} 2026`,
        expectedPeriodDetected: 'true',
        expectedAccrual: `${mesEn} 2026`,
        multiPeriod: 'no',
        manualReview: 'false',
        confidence: 'high',
        reason: 'Demo: mes en inglés explícito.',
      });
    } else if (caseType === 'clear_range_iso') {
      const es = rng() > 0.45;
      const concept = es
        ? `Suministro energía período ${iso0} – ${iso1}`
        : `Network usage billing ${iso0} to ${iso1}`;
      spec.invoiceDate = addDays(iso1, -Math.floor(1 + rng() * 5));
      finalize('range', concept, {
        caseType: 'clear_monthly_period',
        servicePeriodText: `${iso0} – ${iso1}`,
        expectedPeriodDetected: 'true',
        expectedAccrual: `${iso0} - ${iso1}`,
        multiPeriod: 'no',
        manualReview: 'false',
        confidence: 'high',
        reason: 'Demo: rango ISO en concepto.',
      });
    } else if (caseType === 'no_period') {
      const concept = pick(rng, SERVICES_NOPERIOD);
      spec.invoiceDate = `2026-04-${pad2(4 + Math.floor(rng() * 20))}`;
      finalize('no_per', concept, {
        caseType: 'no_period',
        servicePeriodText: '—',
        expectedPeriodDetected: 'false',
        expectedAccrual: 'not identified',
        multiPeriod: 'no',
        manualReview: 'true',
        confidence: 'not_detected',
        reason: 'Demo: sin período claro en el texto.',
      });
    } else if (caseType === 'ambiguous') {
      const concept = pick(rng, SERVICES_AMBIG);
      spec.invoiceDate = `2026-03-${pad2(5 + Math.floor(rng() * 18))}`;
      finalize('ambig', concept, {
        caseType: 'ambiguous',
        servicePeriodText: '—',
        expectedPeriodDetected: 'false',
        expectedAccrual: 'not identified',
        multiPeriod: 'no',
        manualReview: 'true',
        confidence: rng() > 0.55 ? 'low' : 'not_detected',
        reason: 'Demo: wording ambiguo; revisión manual.',
      });
    } else if (caseType === 'multi_q') {
      const q = pick(rng, [1, 2, 3, 4]);
      const qStart = { 1: '2026-01-18', 2: '2026-04-08', 3: '2026-07-11', 4: '2026-10-05' }[q];
      spec.invoiceDate = qStart;
      const concept = `Platform bundle license Q${q} 2026`;
      finalize('quarter', concept, {
        caseType: 'multi_period',
        servicePeriodText: `Q${q} 2026`,
        expectedPeriodDetected: 'true',
        expectedAccrual: `Q${q} 2026`,
        multiPeriod: 'yes',
        manualReview: rng() > 0.65 ? 'true' : 'false',
        confidence: 'high',
        reason: 'Demo: trimestre fiscal explícito.',
      });
    } else if (caseType === 'multi_annual') {
      spec.baseRangeAnnual = [3200, 15500];
      spec.invoiceDate = '2026-01-12';
      finalize('annual', 'Enterprise SaaS subscription period 01/01/2026 - 31/12/2026', {
        caseType: 'multi_period',
        servicePeriodText: '01/01/2026 – 31/12/2026',
        expectedPeriodDetected: 'true',
        expectedAccrual: 'Annual 2026 (01/01/2026 - 31/12/2026)',
        multiPeriod: 'yes',
        manualReview: 'true',
        confidence: 'high',
        reason: 'Demo: contrato anual; periodificación manual.',
      });
    } else if (caseType === 'cross_year_insurance') {
      spec.baseAmountFixed = 1200 + Math.floor(rng() * 8800);
      spec.invoiceDate = '2026-02-14';
      finalize('ins_x', 'Insurance cover 01/06/2026 to 31/05/2027 — fleet policy', {
        caseType: 'multi_period',
        servicePeriodText: '01/06/2026 – 31/05/2027',
        expectedPeriodDetected: 'true',
        expectedAccrual: '01/06/2026 - 31/05/2027',
        multiPeriod: 'yes',
        manualReview: 'true',
        confidence: 'high',
        reason: 'Demo: póliza multi-ejercicio.',
      });
    } else if (caseType === 'posterior_invoice_prior_service') {
      spec.invoiceDate = `2026-05-${pad2(3 + Math.floor(rng() * 15))}`;
      const trio = pick(rng, [
        {
          c: 'Servicios prestados en Abril 2026',
          p: 'Abril 2026',
          e: 'April 2026 / Abril 2026',
        },
        {
          c: 'March 2026 advisory delivered',
          p: 'March 2026',
          e: 'March 2026',
        },
        {
          c: 'Consumos utilities Abril 2026',
          p: 'Abril 2026',
          e: 'April 2026 / Abril 2026',
        },
      ]);
      finalize('post_inv', trio.c, {
        caseType: 'posterior_invoice_prior_service',
        servicePeriodText: trio.p,
        expectedPeriodDetected: 'true',
        expectedAccrual: trio.e,
        multiPeriod: 'no',
        manualReview: 'false',
        confidence: 'high',
        reason: 'Demo: factura posterior al servicio declarado.',
      });
    } else {
      const pack = pick(rng, [
        { c: 'Satellite uplink February 2026', p: 'February 2026', e: 'February 2026', m: 2 },
        { c: 'Cold storage Mayo 2026', p: 'Mayo 2026', e: 'May 2026 / Mayo 2026', m: 5 },
        { c: 'Training workshops Marzo 2026', p: 'Marzo 2026', e: 'March 2026 / Marzo 2026', m: 3 },
        { c: 'Berth fees Enero 2026', p: 'Enero 2026', e: 'January 2026 / Enero 2026', m: 1 },
        { c: 'Compliance audit Abril 2026', p: 'Abril 2026', e: 'April 2026 / Abril 2026', m: 4 },
      ]);
      const day = 10 + Math.floor(rng() * 12);
      spec.invoiceDate = `2026-${pad2(pack.m)}-${pad2(day)}`;
      finalize('multi_ln', pack.c, {
        caseType: 'same_supplier_multiple_services',
        servicePeriodText: pack.p,
        expectedPeriodDetected: 'true',
        expectedAccrual: `${pack.e} (${pack.c.split(' ').slice(0, 2).join(' ')})`,
        multiPeriod: 'no',
        manualReview: 'false',
        confidence: 'high',
        reason: 'Demo: misma razón social, línea distinta.',
      });
    }

    out.push(spec);
  }
  return out;
}

/** Filas demo alineadas con índices de factura + huérfanas (cabeceras no canónicas). */
function buildOpenAccrualSpecs(invoices, rng) {
  const n = invoices.length;
  const idxs = [];
  while (idxs.length < 8 && idxs.length < n) {
    const j = Math.floor(rng() * n);
    if (!idxs.includes(j)) idxs.push(j);
  }
  idxs.sort((a, b) => a - b);
  const rows = idxs.map((invIndex) => ({
    kind: 'invoice',
    invIndex,
    objText: `${pick(rng, OA_OBJ_HINTS)} — ${invoices[invIndex].conceptSummary.slice(0, 42)}`,
    periodLabel: invoices[invIndex].servicePeriodText !== '—' ? invoices[invIndex].servicePeriodText : pick(rng, ['Q2 2026', 'abr-2026', 'FY26-P1']),
    owner: pick(rng, OA_OWNERS),
    gl: pick(rng, OA_GLS),
    status: pick(rng, OA_STATUSES),
  }));
  rows.push(
    {
      kind: 'orphan',
      supplier: 'Helio Logistics SL',
      objText: 'Cross-dock surge marzo (demo)',
      periodLabel: 'marzo 2026',
      amount: 450 + Math.floor(rng() * 800),
      owner: 'Nina K.',
      gl: '629888',
      status: 'CTRL_REVIEW',
    },
    {
      kind: 'orphan',
      supplier: 'Nimbus Labs SL',
      objText: 'Forecast model sprint Q2',
      periodLabel: 'Q2-2026',
      amount: 2100 + Math.floor(rng() * 2400),
      owner: 'FP&A Central',
      gl: '630900',
      status: 'WF_PENDING',
    },
  );
  return rows;
}

function buildProvisionSpecs(invoices, rng) {
  const n = invoices.length;
  const idxs = [];
  while (idxs.length < 7 && idxs.length < n) {
    const j = Math.floor(rng() * n);
    if (!idxs.includes(j)) idxs.push(j);
  }
  const rows = idxs.map((invIndex) => {
    const inv = invoices[invIndex];
    return {
      kind: 'invoice',
      invIndex,
      narrative: `${inv.conceptSummary.slice(0, 72)} (copy controlling)`,
      periodTag: inv.servicePeriodText !== '—' ? inv.servicePeriodText : pick(rng, ['FY26', 'T2 2026', 'Abril 2026']),
      preparer: pick(rng, PROV_PREP),
      dept: pick(rng, PROV_DEPTS),
    };
  });
  rows.push(
    {
      kind: 'orphan',
      supplier: 'Kettle Robotics GmbH',
      narrative: 'Spare parts accrual robotics line',
      periodTag: 'H1 2026',
      amount: 1800 + Math.floor(rng() * 4000),
      preparer: 'Plant Controller',
      dept: 'OPS-DE-01',
    },
    {
      kind: 'orphan',
      supplier: 'Quorum Legal Ltd',
      narrative: 'Litigation provision estimate',
      periodTag: 'April 2026',
      amount: 5000 + Math.floor(rng() * 2000),
      preparer: 'Legal Liaison',
      dept: 'LEG-09',
    },
  );
  return rows;
}

function resolveDemoAmountEuros(invoices, spec) {
  if (spec.kind === 'orphan') return spec.amount;
  const inv = invoices[spec.invIndex];
  if (!inv) throw new Error(`invIndex inválido: ${spec.invIndex}`);
  return invoiceAmounts(inv).total;
}

function resolveDemoSupplier(invoices, spec) {
  if (spec.kind === 'orphan') return spec.supplier;
  const inv = invoices[spec.invIndex];
  if (!inv) throw new Error(`invIndex inválido: ${spec.invIndex}`);
  return inv.supplier;
}

function writeDemoControllingAndProvisionCsvs(outDir, invoices, openSpecs, provSpecs) {
  const openPath = path.join(outDir, 'demo_open_accruals_controlling.csv');
  const provPath = path.join(outDir, 'demo_provision_requests.csv');

  const openHeader = csvRow([
    'CECO',
    'Razón social (SAP-style)',
    'Objeto / texto período',
    'Mes cierre (libre)',
    'Imp. EUR abierto',
    'Gestor responsable',
    'Cuenta G/L',
    'Estado workflow',
  ]).trimEnd();

  const openLines = [openHeader];
  for (const row of openSpecs) {
    const euros = resolveDemoAmountEuros(invoices, row);
    const supplier = resolveDemoSupplier(invoices, row);
    openLines.push(
      csvRow([
        row.kind === 'invoice' ? `ACC-${String(row.invIndex + 1).padStart(2, '0')}` : 'ORP-XX',
        supplier,
        row.objText,
        row.periodLabel,
        euros.toFixed(2),
        row.owner,
        row.gl,
        row.status,
      ]).trimEnd(),
    );
  }
  fs.writeFileSync(openPath, openLines.join('\n') + '\n', 'utf8');

  const provHeader = csvRow([
    'Vendor (free text)',
    'Expense narrative',
    'FY / period tag',
    'Amount requested EUR',
    'Preparer',
    'Dept / CC',
  ]).trimEnd();

  const provLines = [provHeader];
  for (const row of provSpecs) {
    const euros = resolveDemoAmountEuros(invoices, row);
    const supplier = resolveDemoSupplier(invoices, row);
    provLines.push(
      csvRow([
        supplier,
        row.narrative,
        row.periodTag,
        euros.toFixed(2),
        row.preparer,
        row.dept,
      ]).trimEnd(),
    );
  }
  fs.writeFileSync(provPath, provLines.join('\n') + '\n', 'utf8');

  return { openPath, provPath };
}

/**
 * pdf-lib para PDFs válidos para pdf-parse del backend (/api/ocr-test/analyze).
 */
async function buildPdfBuffer(spec, invoiceNumber, amounts) {
  const sup = SUPPLIER_PROFILES[spec.supplier];
  if (!sup) throw new Error(`Proveedor desconocido: ${spec.supplier}`);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Invoice ${invoiceNumber}`);
  pdfDoc.setAuthor('AccrualFlow test data generator');

  const page = pdfDoc.addPage([PDF_A4.w, PDF_A4.h]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  const right = PDF_A4.w - margin;
  /** Cursor Y (coordenada PDF, inferior = 0). Empezamos arriba. */
  let cy = PDF_A4.h - margin;

  const c = {
    ink: rgb(34 / 255, 34 / 255, 34 / 255),
    muted: rgb(68 / 255, 68 / 255, 68 / 255),
    bar: rgb(26 / 255, 54 / 255, 93 / 255),
    divider: rgb(200 / 255, 200 / 255, 200 / 255),
    divider2: rgb(221 / 255, 221 / 255, 221 / 255),
    warn: rgb(124 / 255, 45 / 255, 18 / 255),
  };

  const drawTxt = (text, opts = {}) => {
    const x = opts.x ?? margin;
    const size = opts.size ?? 10;
    const f = opts.bold ? fontBold : font;
    page.drawText(String(text), {
      x,
      y: cy - size,
      size,
      font: f,
      color: opts.color ?? c.ink,
    });
    cy -= opts.after != null ? opts.after : size + (opts.gap ?? 4);
    return cy;
  };

  const linesDraw = (textLines, opts = {}) => {
    let maxH = 0;
    const size = opts.size ?? 10;
    const lineGap = opts.lineGap ?? 2;
    for (const ln of textLines) {
      page.drawText(ln, {
        x: opts.x ?? margin,
        y: cy - size,
        size,
        font: opts.bold ? fontBold : font,
        color: opts.color ?? c.ink,
      });
      maxH += size + lineGap;
      cy -= size + lineGap;
    }
    cy -= opts.afterParagraph ?? 4;
    return maxH;
  };

  /** Barra superior */
  page.drawRectangle({
    x: margin,
    y: cy - 2,
    width: PDF_A4.w - 2 * margin,
    height: 2,
    color: c.bar,
  });
  cy -= 16;

  drawTxt('FACTURA / INVOICE', { bold: true, size: 11 });
  cy -= 4;
  drawTxt('Supplier / Proveedor:', { bold: true, size: 9 });
  drawTxt(spec.supplier, { bold: true, size: 12 });
  drawTxt(`VAT / NIF: ${sup.vat}`, { color: c.muted, size: 9 });
  wrapWords(sup.address, font, 9, PDF_A4.w - 2 * margin).forEach((ln) => drawTxt(ln, { size: 9, color: c.muted }));
  drawTxt(`Email: ${sup.email}`, { color: c.muted, size: 9, after: 10 });

  /** Línea */
  cy -= 2;
  page.drawLine({
    start: { x: margin, y: cy },
    end: { x: right, y: cy },
    thickness: 0.6,
    color: c.divider,
  });
  cy -= 10;

  drawTxt('Customer / Cliente — Bill To', { bold: true, size: 10 });
  drawTxt(CUSTOMER.name, { bold: true, size: 10 });
  drawTxt(`VAT / NIF: ${CUSTOMER.vat}`, { size: 10 });
  wrapWords(CUSTOMER.address, font, 10, PDF_A4.w - 2 * margin).forEach((ln) =>
    drawTxt(ln, { size: 10 }),
  );
  drawTxt(`Email: ${CUSTOMER.email}`, { size: 10, after: 12 });

  const dueDate = addDays(spec.invoiceDate, 30);
  drawTxt('Invoice Details:', { bold: true, size: 9 });
  cy -= 2;
  linesDraw(
    [
      `Invoice number: ${invoiceNumber}`,
      `Invoice date: ${spec.invoiceDate}`,
      `Due date: ${dueDate}`,
      `Currency: EUR`,
      `Payment terms: 30 days net`,
    ],
    { size: 9, lineGap: 2 },
  );
  cy -= 8;

  drawTxt('Line Items', { bold: true, size: 10 });

  const colDesc = margin;
  const colPeriod = 248;
  const colQty = 318;
  const colUnit = 348;
  const colBase = 408;
  const colVat = 478;
  const colTot = 524;

  page.drawText('Description / Concept', { x: colDesc, y: cy - 8, size: 8, font: fontBold, color: c.ink });
  page.drawText('Service period', { x: colPeriod, y: cy - 8, size: 8, font: fontBold });
  page.drawText('Qty', { x: colQty, y: cy - 8, size: 8, font: fontBold });
  page.drawText('Unit', { x: colUnit, y: cy - 8, size: 8, font: fontBold });
  page.drawText('Base', { x: colBase, y: cy - 8, size: 8, font: fontBold });
  page.drawText('VAT 21%', { x: colVat, y: cy - 8, size: 8, font: fontBold });
  page.drawText('Total', { x: colTot, y: cy - 8, size: 8, font: fontBold });
  cy -= 14;

  page.drawLine({
    start: { x: margin, y: cy + 4 },
    end: { x: right, y: cy + 4 },
    thickness: 0.5,
    color: rgb(0.35, 0.35, 0.35),
  });
  cy -= 6;

  const conceptLines = wrapWords(spec.conceptSummary, font, 9, 182);
  const periodLabel = spec.servicePeriodText !== '—' ? spec.servicePeriodText : '—';

  /** Primera línea de conceptos al mismo baseline que período/importes */
  const lineH = 11;
  const baseline0 = cy;
  conceptLines.forEach((ln, i) =>
    page.drawText(ln, { x: colDesc, y: baseline0 - i * lineH, size: 9, font, color: c.ink }),
  );

  page.drawText(periodLabel, { x: colPeriod, y: baseline0, size: 9, font });
  page.drawText('1', { x: colQty, y: baseline0, size: 9, font });
  page.drawText(euros(amounts.base), { x: colUnit, y: baseline0, size: 9, font });
  page.drawText(euros(amounts.base), { x: colBase, y: baseline0, size: 9, font });
  page.drawText(euros(amounts.tax), { x: colVat, y: baseline0, size: 9, font });
  page.drawText(euros(amounts.total), { x: colTot, y: baseline0, size: 9, font });

  const lastConceptBaseline = baseline0 - (conceptLines.length - 1) * lineH;
  cy = lastConceptBaseline - 18;

  page.drawLine({
    start: { x: margin, y: cy + 12 },
    end: { x: right, y: cy + 12 },
    thickness: 0.5,
    color: c.divider2,
  });
  cy -= 12;

  const summaryLeft = 360;
  page.drawText(`Subtotal (tax base): ${euros(amounts.base)}`, { x: summaryLeft, y: cy, size: 9, font });
  cy -= 11;
  page.drawText(`VAT 21%: ${euros(amounts.tax)}`, { x: summaryLeft, y: cy, size: 9, font });
  cy -= 14;
  page.drawText(`Total amount payable: ${euros(amounts.total)}`, {
    x: summaryLeft,
    y: cy,
    size: 11,
    font: fontBold,
    color: c.ink,
  });
  cy -= 52;

  if (cy < 120) {
    throw new Error('Layout overflow: aumentar página o compactar contenido.');
  }

  drawTxt('Payment Instructions (fictitious):', { bold: true, size: 9 });
  wrapWords(
    `Bank demo: DEMO BANK · IBAN: ES91 2085 8830 0160 0582 7832 Reference: ${invoiceNumber} SWIFT/BIC: DEMOBICXXX`,
    font,
    8,
    PDF_A4.w - 2 * margin,
  ).forEach((ln) => drawTxt(ln, { size: 8, color: c.muted }));

  const footY = 52;
  wrapWords(
    'This invoice is fictitious and generated for testing purposes only.',
    font,
    8,
    PDF_A4.w - 2 * margin,
  ).forEach((ln, i) =>
    page.drawText(ln, {
      x: margin,
      y: footY + i * 10,
      size: 8,
      font,
      color: c.warn,
    }),
  );

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

async function main() {
  const outDir = path.join(ROOT, 'test-data', 'generated-invoices');
  const csvPath = path.join(ROOT, 'test-data', 'expected_results.csv');
  const zipPath = path.join(ROOT, 'test-data', 'accrualflow_test_invoices.zip');

  const seed = getInvoiceBatchSeed();
  const rng = mulberry32(seed);
  console.info(`[gen:test-data] ${NUM_TEST_INVOICES} facturas — seed=${seed} (repetir con GEN_INVOICE_SEED=${seed})`);

  const INVOICES = generateRandomInvoiceBatch(rng);
  const OPEN_ACCRUAL_SPECS = buildOpenAccrualSpecs(INVOICES, rng);
  const PROVISION_SPECS = buildProvisionSpecs(INVOICES, rng);

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'test-data'), { recursive: true });

  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.pdf') || (f.startsWith('demo_') && f.endsWith('.csv'))) {
      fs.unlinkSync(path.join(outDir, f));
    }
  }

  /** @type {string[]} */
  const csvLines = [
    csvRow([
      'file_name',
      'case_type',
      'supplier_name',
      'invoice_date',
      'concept_summary',
      'expected_service_period_detected',
      'expected_accrual_month_or_period',
      'expected_possible_multi_period_invoice',
      'expected_requires_manual_review',
      'expected_confidence',
      'expected_reason',
    ]).trimEnd(),
  ];

  const zip = new AdmZip();

  for (let i = 0; i < INVOICES.length; i++) {
    const spec = INVOICES[i];
    const invoiceNumber = `INV-2026-${String(i + 1).padStart(3, '0')}`;
    const amounts = invoiceAmounts(spec);
    const buf = await buildPdfBuffer(spec, invoiceNumber, amounts);
    const filePath = path.join(outDir, spec.fileName);
    fs.writeFileSync(filePath, buf);

    zip.addFile(spec.fileName, buf);

    csvLines.push(
      csvRow([
        spec.fileName,
        spec.caseType,
        spec.supplier,
        spec.invoiceDate,
        spec.conceptSummary,
        spec.expectedPeriodDetected,
        spec.expectedAccrual,
        spec.multiPeriod,
        spec.manualReview,
        spec.confidence,
        spec.reason,
      ]).trimEnd(),
    );

    console.log('Generado:', spec.fileName);
  }

  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n', 'utf8');
  zip.addFile('expected_results.csv', fs.readFileSync(csvPath));
  zip.writeZip(zipPath);

  const { openPath, provPath } = writeDemoControllingAndProvisionCsvs(
    outDir,
    INVOICES,
    OPEN_ACCRUAL_SPECS,
    PROVISION_SPECS,
  );

  console.log('\nCSV expectativas OCR:', csvPath);
  console.log('ZIP facturas:', zipPath);
  console.log('PDFs en:', outDir);
  console.log('\n--- Demo AccrualFlow (provisiones + controlling) ---');
  console.log('CSV devengos abiertos (cabeceras “sucias”):', openPath);
  console.log('CSV solicitudes de provisión:', provPath);
  console.log(
    'Prueba web: sube el ZIP en “ZIP con PDFs” y los dos CSV en los campos opcionales (misma carpeta).',
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
