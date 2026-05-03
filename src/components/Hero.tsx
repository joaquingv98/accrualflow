import { ArrowRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import HeroDashboard from './HeroDashboard';

const claims = [
  'Detectar servicios sin factura',
  'Encontrar reversals antes de que se pasen por alto',
  'Revisar devengos antiguos',
  'Generar preguntas para owners',
  'Exportar pack de cierre',
];

const heroImage =
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80';

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-20 lg:pt-24">
      <div className="flex flex-col lg:flex-row lg:min-h-[min(88vh,840px)]">
        <div className="order-2 lg:order-1 flex flex-1 flex-col justify-center px-6 sm:px-10 lg:pl-12 xl:pl-16 lg:pr-8 pt-10 pb-14 lg:py-24 max-w-xl lg:max-w-none mx-auto lg:mx-0 w-full">
          <div className="inline-flex w-fit items-center gap-2 px-3.5 py-1.5 rounded-full border border-ink/10 bg-paper/60 text-[11px] font-medium uppercase tracking-wider text-ink-muted mb-8">
            <Zap className="w-3.5 h-3.5 text-ink" />
            Cierre mensual
          </div>

          <h1 className="font-serif text-[2rem] sm:text-4xl lg:text-[2.65rem] xl:text-5xl font-medium leading-[1.22] text-ink tracking-tight mb-6">
            <span className="line-mark">Las provisiones no deberían depender</span>
            <br />
            de perseguir a media empresa.
          </h1>

          <p className="text-base lg:text-lg text-ink-muted leading-relaxed max-w-lg mb-10">
            AccrualFlow convierte facturas, devengos abiertos y aportaciones de controlling en{' '}
            <span className="line-mark text-ink">acciones claras de fin de mes</span>
            {' — '}nuevos devengos, reversals, riesgos de antigüedad, preguntas para owners y un pack de cierre listo
            para revisar.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-12">
            <Link
              to="/ocr-test"
              className="inline-flex justify-center items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold bg-ink text-cream-soft hover:bg-ink/90 transition-all duration-200"
            >
              Ejecutar revisión de devengos
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#product"
              className="inline-flex justify-center items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium border border-ink/20 text-ink hover:bg-ink/[0.04] transition-all duration-200"
            >
              Ver servicios
            </a>
          </div>

          <ul className="flex flex-col gap-2.5 text-sm text-ink-muted">
            {claims.map((claim) => (
              <li key={claim} className="flex items-start gap-2.5">
                <span className="mt-2 h-px w-6 shrink-0 bg-ink/25" aria-hidden />
                {claim}
              </li>
            ))}
          </ul>
        </div>

        <div className="order-1 lg:order-2 relative w-full h-[min(52vw,320px)] sm:h-[380px] lg:h-auto lg:min-h-[560px] lg:w-[46%] shrink-0">
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] lg:rounded-bl-[2.5rem]"
            loading="eager"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-cream/20 via-transparent to-cream/30 lg:hidden pointer-events-none" />
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-cream to-transparent hidden lg:block pointer-events-none" />
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto px-6 lg:px-8 pb-20 lg:pb-28">
        <HeroDashboard />
      </div>
    </section>
  );
}
