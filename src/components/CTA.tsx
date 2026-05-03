import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

export default function CTA() {
  const { ref, visible } = useScrollAnimation();

  return (
    <section id="cta" className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(188,168,150,0.14),transparent)]" />

      <div ref={ref} className="relative max-w-4xl mx-auto px-6 lg:px-8">
        <div
          className={`editorial-glass-strong rounded-3xl p-8 sm:p-12 lg:p-16 text-center glow-lime border border-ink/10 transition-all duration-700 ${
            visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.97]'
          }`}
        >
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Convierte facturas, devengos y notas de controlling en un{' '}
            <span className="text-ink font-semibold">pack de fin de mes controlado.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base max-w-xl mx-auto mb-8 leading-relaxed">
            Ejecuta el flujo de revisión: tres fuentes de datos, acciones estructuradas, antigüedad y preguntas para
            owners — exporta cuando lo tengas claro.
          </p>
          <Link
            to="/ocr-test"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-sm font-semibold bg-ink text-cream-soft hover:bg-ink/90 transition-all duration-200"
          >
            Ejecutar revisión de devengos
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-6 text-[11px] text-ink-subtle max-w-lg mx-auto leading-relaxed">
            AccrualFlow proporciona recomendaciones revisables. No registra asientos automáticos en el mayor ni sustituye
            tu criterio profesional.
          </p>
        </div>
      </div>
    </section>
  );
}
