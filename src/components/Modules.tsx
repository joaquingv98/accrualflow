import { Stethoscope, CalendarRange, RotateCcw, Hourglass, MessageSquareText, ShieldCheck } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const modules = [
  {
    icon: Stethoscope,
    title: 'Chequeo de salud (devengos)',
    desc: 'Sube facturas, devengos abiertos e inputs de controlling para detectar devengos faltantes, provisiones antiguas, posibles reversals y partidas para revisión manual.',
    badge: 'Diagnóstico',
    color: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    hoverBorder: 'hover:border-accent-blue/30',
  },
  {
    icon: CalendarRange,
    title: 'Pack de cierre mensual',
    desc: 'Genera un pack de fin de mes estructurado con acciones recomendadas, nuevos devengos, reversals, reversals parciales, preguntas para owners y trazabilidad.',
    badge: 'Mensual',
    color: 'text-ink',
    bg: 'bg-ink/10',
    hoverBorder: 'hover:border-ink/25',
  },
  {
    icon: RotateCcw,
    title: 'Seguimiento de reversals',
    desc: 'Cruza facturas recibidas con devengos abiertos para detectar reversals totales, parciales y casos reversal más ajuste.',
    badge: 'Control',
    color: 'text-accent-amber',
    bg: 'bg-accent-amber/10',
    hoverBorder: 'hover:border-accent-amber/30',
  },
  {
    icon: Hourglass,
    title: 'Revisión por antigüedad',
    desc: 'Marca devengos antiguos por edad, importe y evidencia para priorizar qué revisar antes del cierre.',
    badge: 'Riesgo',
    color: 'text-accent-coral',
    bg: 'bg-accent-coral/10',
    hoverBorder: 'hover:border-accent-coral/30',
  },
  {
    icon: MessageSquareText,
    title: 'Generador de preguntas (owners)',
    desc: 'Genera preguntas claras para owners de negocio cuando el sistema necesita confirmar prestación del servicio, importe o periodo.',
    badge: 'Colaboración',
    color: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    hoverBorder: 'hover:border-accent-blue/30',
  },
  {
    icon: ShieldCheck,
    title: 'Comprobador de políticas',
    desc: 'Aplica reglas de control como «devengos de más de 90 días requieren revisión» o «importes &gt;5.000 € requieren evidencia del owner».',
    badge: 'Gobierno',
    color: 'text-accent-blue',
    bg: 'bg-accent-blue/10',
    hoverBorder: 'hover:border-accent-blue/30',
  },
];

export default function Modules() {
  const { ref, visible } = useScrollAnimation();

  return (
    <section id="product" className="py-24 lg:py-32 relative scroll-mt-24">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,rgba(56,189,248,0.08),transparent)]" />

      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div
          className={`text-center max-w-3xl mx-auto mb-16 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Diseñado alrededor del{' '}
            <span className="text-ink font-semibold">flujo real de devengos de fin de mes.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base leading-relaxed">
            No solo OCR de facturas. AccrualFlow ayuda al equipo financiero a entender qué se entregó, qué facturó, qué
            sigue abierto y qué acción falta antes del cierre.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {modules.map((mod, i) => (
            <div
              key={mod.title}
              className={`group editorial-glass rounded-2xl p-6 border border-ink/8 ${mod.hoverBorder} transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/10 cursor-default ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: visible ? `${i * 100}ms` : '0ms' }}
            >
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className={`w-12 h-12 rounded-2xl ${mod.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <mod.icon className={`w-5 h-5 ${mod.color}`} />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wide px-2.5 py-1 rounded-full bg-ink/[0.06] text-ink-muted border border-ink/10">
                  {mod.badge}
                </span>
              </div>
              <h3 className="text-base font-semibold text-ink mb-2">{mod.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{mod.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
