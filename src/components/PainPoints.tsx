import { FileQuestion, Clock, Layers, Users, RotateCcw, AlertTriangle } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const pains = [
  {
    icon: FileQuestion,
    title: 'Servicios sin factura',
    desc: 'El negocio confirma que el servicio se presto, pero la factura aun no llego.',
    gradient: 'from-accent-blue/20 to-paper',
    border: 'hover:border-accent-blue/30',
    iconColor: 'text-accent-blue',
  },
  {
    icon: Clock,
    title: 'Provisiones que nadie revisa',
    desc: 'Provisiones abiertas durante meses sin saber si toca reversal, ajuste o mantenimiento.',
    gradient: 'from-accent-amber/20 to-accent-coral/5',
    border: 'hover:border-accent-amber/30',
    iconColor: 'text-accent-amber',
  },
  {
    icon: Layers,
    title: 'Un proveedor, varios servicios',
    desc: 'Google no es solo marketing: puede ser Ads, Workspace, Cloud o YouTube.',
    gradient: 'from-accent-blue/15 to-cream-soft/80',
    border: 'hover:border-accent-blue/25',
    iconColor: 'text-accent-blue',
  },
  {
    icon: Users,
    title: 'Owners dispersos',
    desc: 'Marketing, Tech, People u Operations confirman importes por email, chat o Excel.',
    gradient: 'from-cream-deep/40 to-accent-blue/5',
    border: 'hover:border-ink/20',
    iconColor: 'text-ink',
  },
  {
    icon: RotateCcw,
    title: 'Reversals olvidados',
    desc: 'Llega la factura, pero la provision anterior no se revierte correctamente.',
    gradient: 'from-accent-coral/20 to-accent-amber/5',
    border: 'hover:border-accent-coral/30',
    iconColor: 'text-accent-coral',
  },
  {
    icon: AlertTriangle,
    title: 'Novedades fuera de presupuesto',
    desc: 'Aparecen servicios nuevos que nadie tenia en el forecast.',
    gradient: 'from-accent-blue/15 to-accent-coral/5',
    border: 'hover:border-accent-blue/30',
    iconColor: 'text-accent-blue',
  },
];

export default function PainPoints() {
  const { ref, visible } = useScrollAnimation();

  return (
    <section id="use-cases" className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,rgba(188,168,150,0.2),transparent)]" />

      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          {/* FIXME: revisar copy legal para no prometer automatización contable total */}
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            El problema no es contabilizar.{' '}
            <span className="text-ink font-semibold">Es saber qué ha pasado realmente.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base leading-relaxed">
            El cierre mensual falla cuando la informacion esta dispersa y nadie coordina servicios, facturas, presupuestos y owners.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {pains.map((pain, i) => (
            <div
              key={pain.title}
              className={`group relative rounded-2xl p-6 bg-gradient-to-br from-paper to-cream-soft/80 border border-ink/8 ${pain.border} transition-all duration-500 hover:-translate-y-1 hover:shadow-lg hover:shadow-ink/10 ${
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: visible ? `${i * 100}ms` : '0ms' }}
            >
              <div className="w-10 h-10 rounded-xl bg-ink/[0.05] flex items-center justify-center mb-4 group-hover:bg-ink/[0.08] transition-colors">
                <pain.icon className={`w-5 h-5 ${pain.iconColor}`} />
              </div>
              <h3 className="text-base font-semibold text-ink mb-2">{pain.title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{pain.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
