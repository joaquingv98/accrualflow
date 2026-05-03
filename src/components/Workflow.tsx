import { FileArchive, Database, ClipboardList, GitMerge, ListChecks, FileDown } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const steps = [
  {
    icon: FileArchive,
    label: 'Subir facturas',
    color: 'bg-ink',
    desc: 'ZIP con PDFs de facturas del periodo a revisar.',
  },
  {
    icon: Database,
    label: 'Subir devengos abiertos',
    color: 'bg-accent-amber',
    desc: 'Tus provisiones / devengos abiertos por proveedor y servicio.',
  },
  {
    icon: ClipboardList,
    label: 'Subir inputs de controlling',
    color: 'bg-accent-blue',
    desc: 'Solicitudes de provisión, confirmaciones de owners y notas de cierre.',
  },
  {
    icon: GitMerge,
    label: 'Cruce servicio / proveedor / periodo / importe',
    color: 'bg-accent-blue',
    desc: 'Cruza facturas, devengos abiertos y líneas de controlling con confianza.',
  },
  {
    icon: ListChecks,
    label: 'Generar acciones recomendadas',
    color: 'bg-accent-coral',
    desc: 'new_accrual, reversals, ask_owner, manual_review y más.',
  },
  {
    icon: FileDown,
    label: 'Exportar pack de cierre',
    color: 'bg-ink',
    desc: 'Excel revisable: acciones, antigüedad, preguntas, trazabilidad.',
  },
];

export default function Workflow() {
  const { ref, visible } = useScrollAnimation();

  return (
    <section id="workflow" className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(188,168,150,0.14),transparent)]" />

      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            De inputs dispersos a{' '}
            <span className="text-ink font-semibold">acciones de cierre.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base leading-relaxed">
            El sistema no registra contabilidad por ti. Produce recomendaciones revisables con evidencia, nivel de
            confianza y siguientes pasos.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {steps.map((step, i) => (
            <div
              key={step.label}
              className={`relative group transition-all duration-700 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: visible ? `${i * 80}ms` : '0ms' }}
            >
              <div className="editorial-glass rounded-2xl p-5 h-full hover:bg-paper/90 transition-all duration-300 hover:-translate-y-1 border border-ink/8">
                <div className={`w-10 h-10 rounded-xl ${step.color}/15 flex items-center justify-center mb-4`}>
                  <step.icon className={`w-5 h-5 ${step.color.replace('bg-', 'text-')}`} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-mono text-ink-subtle">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="text-sm font-semibold text-ink">{step.label}</h3>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
