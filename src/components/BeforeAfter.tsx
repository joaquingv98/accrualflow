import { X, Check } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const before = [
  'Excels separados por equipo',
  'Confirmaciones por email',
  'Facturas en carpetas',
  'Provisiones abiertas sin seguimiento',
  'Reversals revisados manualmente',
  'Cierre dependiente de una persona',
];

const after = [
  'Servicios centralizados',
  'Owners pendientes visibles',
  'Facturas cruzadas automáticamente',
  'Provisiones con estado claro',
  'Reversals sugeridos',
  'Paquete de cierre exportable',
];

export default function BeforeAfter() {
  const { ref, visible } = useScrollAnimation();

  return (
    <section className="py-24 lg:py-32 relative">
      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            De perseguir información{' '}
            <span className="text-ink font-semibold">a controlar el cierre.</span>
          </h2>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div
            className={`rounded-2xl p-6 lg:p-8 border border-ink/10 bg-gradient-to-br from-accent-coral/8 to-paper/40 transition-all duration-700 ${
              visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
            }`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-accent-coral/15 flex items-center justify-center">
                <X className="w-4 h-4 text-accent-coral" />
              </div>
              <h3 className="text-lg font-semibold text-ink">Antes</h3>
            </div>
            <ul className="space-y-4">
              {before.map((item, i) => (
                <li
                  key={item}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                  }`}
                  style={{ transitionDelay: visible ? `${300 + i * 80}ms` : '0ms' }}
                >
                  <span className="w-5 h-5 rounded-full bg-accent-coral/12 flex items-center justify-center flex-shrink-0">
                    <X className="w-2.5 h-2.5 text-accent-coral" />
                  </span>
                  <span className="text-sm text-ink-muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className={`rounded-2xl p-6 lg:p-8 border border-ink/10 bg-gradient-to-br from-ink/[0.06] to-paper/40 transition-all duration-700 ${
              visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
            }`}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-ink/10 flex items-center justify-center">
                <Check className="w-4 h-4 text-ink" />
              </div>
              <h3 className="text-lg font-semibold text-ink">Después</h3>
            </div>
            <ul className="space-y-4">
              {after.map((item, i) => (
                <li
                  key={item}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
                  }`}
                  style={{ transitionDelay: visible ? `${300 + i * 80}ms` : '0ms' }}
                >
                  <span className="w-5 h-5 rounded-full bg-ink/10 flex items-center justify-center flex-shrink-0">
                    <Check className="w-2.5 h-2.5 text-ink" />
                  </span>
                  <span className="text-sm text-ink">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
