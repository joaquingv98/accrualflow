import { Link } from 'react-router-dom';

const links = [
  { label: 'Servicios', href: '/#product' },
  { label: 'Cómo funciona', href: '/#workflow' },
  { label: 'Oferta', href: '/#offering' },
  { label: 'Demostración', href: '/#demo' },
  { label: 'Contacto', href: '/#cta' },
];

export default function Footer() {
  return (
    <footer className="border-t border-ink/10 py-12 lg:py-16 bg-cream-soft/50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center lg:items-start gap-3">
            <Link to="/" className="font-serif text-lg font-medium text-ink lowercase tracking-tight">
              accrualflow<span className="text-ink/80">.</span>
            </Link>
            <p className="text-xs text-ink-muted text-center lg:text-left max-w-xs leading-relaxed">
              Control mensual de devengos, provisiones y reversals para equipos de finance.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-xs font-medium text-ink-muted hover:text-ink transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-ink/8 text-center">
          <p className="text-[10px] text-ink-subtle">
            {new Date().getFullYear()} AccrualFlow. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}
