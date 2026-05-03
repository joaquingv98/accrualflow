import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const links = [
    { label: 'Inicio', href: '/', match: (p: string) => p === '/' },
    { label: 'Servicios', href: '/#product', match: () => false },
    { label: 'Cómo funciona', href: '/#workflow', match: () => false },
    { label: 'Casos de uso', href: '/#use-cases', match: () => false },
    { label: 'Oferta', href: '/#offering', match: () => false },
    { label: 'Demostración', href: '/#demo', match: () => false },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-cream/92 backdrop-blur-md border-b border-ink/8 shadow-sm shadow-ink/5' : 'bg-cream/80 backdrop-blur-sm border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <Link to="/" className="group flex items-baseline gap-0">
            <span className="font-serif text-xl lg:text-2xl font-medium tracking-tight text-ink lowercase">
              accrualflow
              <span className="text-ink/90">.</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7 lg:gap-8">
            {links.map((link) => {
              const active = link.match(location.pathname);
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className={`text-sm font-medium transition-colors duration-200 border-b border-transparent pb-0.5 ${
                    active
                      ? 'text-ink border-ink'
                      : 'text-ink-muted hover:text-ink border-transparent hover:border-ink/25'
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
            <Link
              to="/ocr-test"
              className={`text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/ocr-test' ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`}
            >
              Revisión MVP
            </Link>
          </div>

          <Link
            to="/ocr-test"
            className="hidden md:inline-flex items-center px-5 py-2.5 rounded-full text-sm font-medium bg-ink text-cream-soft hover:bg-ink/90 transition-all duration-200"
          >
            Revisar devengos
          </Link>

          <button
            type="button"
            className="md:hidden text-ink-muted hover:text-ink p-1"
            aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-cream-soft border-t border-ink/10 shadow-lg">
          <div className="px-6 py-4 space-y-1">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="block text-sm font-medium text-ink-muted hover:text-ink py-2.5"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              to="/ocr-test"
              className="block text-sm font-medium text-ink-muted hover:text-ink py-2.5"
              onClick={() => setMobileOpen(false)}
            >
              Revisión MVP
            </Link>
            <Link
              to="/ocr-test"
              className="block text-center px-5 py-2.5 rounded-full text-sm font-medium bg-ink text-cream-soft mt-3"
              onClick={() => setMobileOpen(false)}
            >
              Revisar devengos
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
