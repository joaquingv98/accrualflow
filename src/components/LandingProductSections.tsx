import { useScrollAnimation } from '../hooks/useScrollAnimation';

const actionTypes = [
  'no_accrual_needed',
  'new_accrual',
  'maintain_existing_accrual',
  'possible_reversal',
  'partial_reversal',
  'reversal_plus_adjustment',
  'ask_owner',
  'manual_review',
] as const;

const mockRecommended = [
  {
    action: 'possible_reversal',
    supplier: 'CleanPro Facilities',
    service: 'Limpieza oficinas marzo',
    invoice: '€1.200',
    oa: '€1.200',
    ctrl: '—',
    reason: 'Factura recibida contra devengo abierto',
  },
  {
    action: 'new_accrual',
    supplier: 'Agencia X',
    service: 'SEO abril',
    invoice: '—',
    oa: '—',
    ctrl: '€3.000',
    reason: 'Servicio confirmado sin factura',
  },
  {
    action: 'maintain_existing_accrual',
    supplier: 'AWS',
    service: 'Cloud hosting abril',
    invoice: '—',
    oa: '€2.100',
    ctrl: '€2.100',
    reason: 'Confirmado por controlling, sin factura aún',
  },
  {
    action: 'ask_owner',
    supplier: 'PwC Tax',
    service: 'Honorarios febrero',
    invoice: '—',
    oa: '€9.800',
    ctrl: '—',
    reason: 'Devengo abierto sin factura ni confirmación',
  },
  {
    action: 'reversal_plus_adjustment',
    supplier: 'Google',
    service: 'Ads abril',
    invoice: '€8.900',
    oa: '€8.700',
    ctrl: '€8.900',
    reason: 'Revertir devengo y registrar diferencia',
  },
] as const;

const closingSheets = [
  'Resumen ejecutivo',
  'Análisis de facturas',
  'Devengos abiertos',
  'Solicitudes de provisión',
  'Acciones recomendadas',
  'Nuevos devengos',
  'Reversiones',
  'Reversiones parciales',
  'Revisión de antigüedad',
  'Preguntas para owners',
  'Revisión manual',
  'Pista de auditoría',
];

const offerings = [
  {
    title: 'Diagnóstico de devengos',
    price: 'Desde 490 €',
    desc: 'Diagnóstico puntual de tu proceso de devengos con facturas muestra, devengos abiertos e inputs de controlling.',
    includes: [
      'Revisión de riesgos',
      'Posibles reversals',
      'Devengos faltantes',
      'Visión de antigüedad',
      'Recomendaciones',
    ],
  },
  {
    title: 'Pack de cierre mensual',
    price: 'Desde 750 €/mes',
    desc: 'Revisión mensual previa al cierre con pack estructurado de acciones y preguntas.',
    includes: [
      'Emparejado de facturas',
      'Revisión de devengos abiertos',
      'Detección de nuevos devengos',
      'Seguimiento de reversals',
      'Exportación del pack de cierre',
    ],
  },
  {
    title: 'Flujo de devengos a medida',
    price: 'A medida',
    desc: 'Para equipos con varios departamentos, múltiples owners o cierres complejos.',
    includes: [
      'Reglas a medida',
      'Workflow de owners',
      'Comprobador de políticas',
      'Plantillas adaptadas',
      'Documentación de proceso',
    ],
  },
] as const;

export function RecommendedActionsSection() {
  const { ref, visible } = useScrollAnimation();
  return (
    <section id="recommended-actions" className="py-24 lg:py-32 relative scroll-mt-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_80%_20%,rgba(56,189,248,0.08),transparent)]" />
      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className={`text-center max-w-2xl mx-auto mb-12 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Acciones <span className="text-ink font-semibold">recomendadas</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base mb-6 leading-relaxed">
            La tabla de cierre puede devolver códigos de acción estructurados para saber qué revisar — no son asientos automáticos.
          </p>
          <p className="text-[11px] text-ink-subtle mb-2">Códigos técnicos (API / motor)</p>
          <ul className="text-left max-w-xl mx-auto text-xs text-ink-muted space-y-1.5 font-mono">
            {actionTypes.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-ink/35 shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </div>

        <div
          className={`editorial-glass-strong rounded-2xl lg:rounded-3xl border border-ink/10 overflow-hidden transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[920px]">
              <thead>
                <tr className="border-b border-ink/10 bg-ink/[0.03]">
                  {[
                    'Acción',
                    'Proveedor',
                    'Servicio',
                    'Factura',
                    'Devengo abierto',
                    'Input controlling',
                    'Motivo',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-[10px] uppercase tracking-wider text-ink-muted px-4 py-3 font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mockRecommended.map((row) => (
                  <tr key={row.action + row.supplier} className="border-b border-ink/[0.06] hover:bg-ink/[0.02]">
                    <td className="px-4 py-3 text-xs text-ink whitespace-nowrap font-mono font-medium">{row.action}</td>
                    <td className="px-4 py-3 text-xs text-ink font-medium">{row.supplier}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted max-w-[160px]">
                      <span className="line-clamp-2">{row.service}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-muted">{row.invoice}</td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-muted">{row.oa}</td>
                    <td className="px-4 py-3 text-xs font-mono text-ink-muted">{row.ctrl}</td>
                    <td className="px-4 py-3 text-xs text-ink-muted max-w-[280px]">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ClosingPackSection() {
  const { ref, visible } = useScrollAnimation();
  return (
    <section className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_20%_50%,rgba(188,168,150,0.14),transparent)]" />
      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className={`max-w-2xl mb-12 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Exporta un pack de cierre que tu{' '}
            <span className="text-ink font-semibold">finanzas sí puedan revisar.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base leading-relaxed">
            Las salidas estructuradas siguen cómo trabaja controlling el cierre — del análisis de facturas a la pista de auditoría.
          </p>
        </div>
        <div
          className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-3 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          {closingSheets.map((name) => (
            <div
              key={name}
              className="flex items-center gap-3 rounded-xl border border-ink/10 bg-paper/70 px-4 py-3 text-sm text-ink"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-ink/30 shrink-0" />
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ServiceOfferingSection() {
  const { ref, visible } = useScrollAnimation();
  return (
    <section id="offering" className="py-24 lg:py-32 relative scroll-mt-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_80%,rgba(188,168,150,0.12),transparent)]" />
      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Empieza como servicio de revisión.{' '}
            <span className="text-ink font-semibold">Escala hacia automatización.</span>
          </h2>
        </div>
        <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
          {offerings.map((o, i) => (
            <div
              key={o.title}
              className={`editorial-glass rounded-2xl p-6 lg:p-8 border border-ink/10 hover:border-ink/25 transition-all duration-500 hover:-translate-y-0.5 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: visible ? `${i * 100}ms` : '0ms' }}
            >
              <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">{o.title}</p>
              <p className="text-2xl font-bold text-ink mb-4">{o.price}</p>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">{o.desc}</p>
              <p className="text-[10px] uppercase tracking-wider text-ink-subtle mb-2">Incluye</p>
              <ul className="space-y-2">
                {o.includes.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink">
                    <span className="text-ink mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p
          className={`mt-12 text-center text-xs text-ink-muted max-w-3xl mx-auto leading-relaxed transition-all duration-700 ${
            visible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          AccrualFlow ofrece recomendaciones revisables. No contabiliza automáticamente en tu ERP ni sustituye el juicio profesional del área contable.
        </p>
      </div>
    </section>
  );
}
