import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Package, UserCheck, FileText, Zap, TrendingUp, Clock, CheckCircle, AlertCircle, RotateCcw } from 'lucide-react';
import { useScrollAnimation } from '../hooks/useScrollAnimation';

const tabs = [
  { id: 'dashboard', label: 'Panel', icon: LayoutDashboard },
  { id: 'services', label: 'Servicios', icon: Package },
  { id: 'confirmations', label: 'Confirmaciones', icon: UserCheck },
  { id: 'invoices', label: 'Facturas', icon: FileText },
  { id: 'actions', label: 'Acciones', icon: Zap },
];

const dashboardKpis = [
  { label: 'Cierre completado', value: '68%', sub: 'Abril 2026', color: 'text-ink' },
  { label: 'Acciones pendientes', value: '38', sub: '14 urgentes', color: 'text-accent-coral' },
  { label: 'Owners respondidos', value: '87/124', sub: '70% completado', color: 'text-accent-blue' },
  { label: 'Provisiones activas', value: '42', sub: '156.400\u20AC total', color: 'text-accent-amber' },
];

const services = [
  { provider: 'Google', service: 'Ads campana abril', budget: '10.000\u20AC', owner: 'Marketing', status: 'Confirmado' },
  { provider: 'AWS', service: 'Cloud hosting', budget: '3.200\u20AC', owner: 'Tech', status: 'Parcial' },
  { provider: 'Limpiezas Sol', service: 'Limpieza oficinas', budget: '1.200\u20AC', owner: 'Office', status: 'Confirmado' },
  { provider: 'Agencia X', service: 'SEO mensual', budget: '4.500\u20AC', owner: 'Marketing', status: 'Pendiente' },
  { provider: 'Meta', service: 'Ads abril', budget: '8.700\u20AC', owner: 'Marketing', status: 'Confirmado' },
];

const confirmations = [
  { owner: 'Marketing', pending: 3, confirmed: 8, total: 11, percent: 73 },
  { owner: 'Tech', pending: 1, confirmed: 5, total: 6, percent: 83 },
  { owner: 'Office', pending: 0, confirmed: 4, total: 4, percent: 100 },
  { owner: 'People', pending: 2, confirmed: 1, total: 3, percent: 33 },
  { owner: 'Operations', pending: 1, confirmed: 3, total: 4, percent: 75 },
];

const invoices = [
  { provider: 'Limpiezas Sol', number: 'INV-2026-0412', amount: '1.200\u20AC', date: '15/04/2026', matched: true },
  { provider: 'AWS', number: 'INV-2026-3301', amount: '1.840\u20AC', date: '18/04/2026', matched: true },
  { provider: 'Telefonica', number: 'INV-2026-0089', amount: '890\u20AC', date: '20/04/2026', matched: false },
  { provider: 'Randstad', number: 'INV-2026-1155', amount: '3.600\u20AC', date: '22/04/2026', matched: true },
];

const actionsData = [
  { action: 'Provisionar', provider: 'Meta', service: 'Ads abril', amount: '8.700\u20AC', reason: 'Servicio confirmado sin factura', status: 'Pendiente revision', statusColor: 'text-accent-amber', statusBg: 'bg-accent-amber/10' },
  { action: 'Reversal', provider: 'Limpieza Sol', service: 'Limpieza marzo', amount: '1.200\u20AC', reason: 'Factura recibida', status: 'Aprobado', statusColor: 'text-ink-muted', statusBg: 'bg-ink/[0.06]' },
  { action: 'Revisar', provider: 'AWS', service: 'Cloud hosting', amount: '640\u20AC', reason: 'Factura parcial', status: 'Pendiente owner', statusColor: 'text-accent-coral', statusBg: 'bg-accent-coral/10' },
  { action: 'Nueva provision', provider: 'Evento People', service: 'Evento abril', amount: '2.500\u20AC', reason: 'Novedad fuera de presupuesto', status: 'Pendiente revision', statusColor: 'text-accent-amber', statusBg: 'bg-accent-amber/10' },
];

function StatusChip({ label }: { label: string }) {
  const colors: Record<string, string> = {
    Confirmado: 'bg-ink/[0.08] text-ink',
    Parcial: 'bg-amber-500/12 text-amber-900',
    Pendiente: 'bg-ink/6 text-ink-muted',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${colors[label] || 'bg-ink/6 text-ink-muted'}`}>
      {label}
    </span>
  );
}

function DashboardTab() {
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {dashboardKpis.map((kpi) => (
          <div key={kpi.label} className="bg-paper/80 rounded-xl p-4 border border-ink/8">
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-ink mt-1 font-medium">{kpi.label}</p>
            <p className="text-[10px] text-ink-muted mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-paper/80 rounded-xl p-4 border border-ink/8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-ink-muted" />
          <p className="text-xs font-medium text-ink">Progreso de cierre</p>
        </div>
        <div className="w-full h-2 bg-ink/10 rounded-full">
          <div className="w-[68%] h-2 bg-ink rounded-full transition-all duration-1000" />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px] text-ink-muted">Inicio del mes</span>
          <span className="text-[10px] text-ink-muted font-medium">68% completado</span>
        </div>
      </div>
    </div>
  );
}

function ServicesTab() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-ink/10">
            {['Proveedor', 'Servicio', 'Presupuesto', 'Owner', 'Estado'].map((h) => (
              <th key={h} className="text-[10px] uppercase tracking-wider text-ink-muted pb-3 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {services.map((row, i) => (
            <tr key={i} className="border-b border-ink/[0.06] hover:bg-ink/[0.02] transition-colors">
              <td className="py-3 pr-4 text-xs font-medium text-ink">{row.provider}</td>
              <td className="py-3 pr-4 text-xs text-ink-muted">{row.service}</td>
              <td className="py-3 pr-4 text-xs text-ink font-mono">{row.budget}</td>
              <td className="py-3 pr-4">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink/6 text-ink-muted">{row.owner}</span>
              </td>
              <td className="py-3"><StatusChip label={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfirmationsTab() {
  return (
    <div className="space-y-3">
      {confirmations.map((c) => (
        <div key={c.owner} className="bg-paper/80 rounded-xl p-4 border border-ink/8 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-ink/[0.06] flex items-center justify-center">
            <UserCheck className={`w-4 h-4 ${c.percent === 100 ? 'text-ink' : c.percent >= 70 ? 'text-accent-blue' : 'text-accent-coral'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-ink">{c.owner}</p>
              <p className="text-xs text-ink-muted">{c.confirmed}/{c.total} confirmados</p>
            </div>
            <div className="w-full h-1.5 bg-ink/10 rounded-full">
              <div
                className={`h-1.5 rounded-full transition-all duration-700 ${c.percent === 100 ? 'bg-ink' : c.percent >= 70 ? 'bg-accent-blue' : 'bg-accent-coral'}`}
                style={{ width: `${c.percent}%` }}
              />
            </div>
          </div>
          {c.pending > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-coral/12 text-accent-coral whitespace-nowrap">
              {c.pending} pendientes
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function InvoicesTab() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-ink/10">
            {['Proveedor', 'Numero', 'Importe', 'Fecha', 'Match'].map((h) => (
              <th key={h} className="text-[10px] uppercase tracking-wider text-ink-muted pb-3 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv, i) => (
            <tr key={i} className="border-b border-ink/[0.06] hover:bg-ink/[0.02] transition-colors">
              <td className="py-3 pr-4 text-xs font-medium text-ink">{inv.provider}</td>
              <td className="py-3 pr-4 text-xs text-ink-muted font-mono">{inv.number}</td>
              <td className="py-3 pr-4 text-xs text-ink font-mono">{inv.amount}</td>
              <td className="py-3 pr-4 text-xs text-ink-muted">{inv.date}</td>
              <td className="py-3">
                {inv.matched ? (
                  <CheckCircle className="w-4 h-4 text-ink-muted" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-accent-coral" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionsTab() {
  return (
    <div className="overflow-x-auto">
      {/* TODO: convertir demo visual en workflow funcional real */}
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-ink/10">
            {['Accion', 'Proveedor', 'Servicio', 'Importe', 'Motivo', 'Estado'].map((h) => (
              <th key={h} className="text-[10px] uppercase tracking-wider text-ink-muted pb-3 pr-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {actionsData.map((row, i) => (
            <tr key={i} className="border-b border-ink/[0.06] hover:bg-ink/[0.02] transition-colors">
              <td className="py-3 pr-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink">
                  {row.action === 'Reversal' && <RotateCcw className="w-3 h-3 text-ink-muted" />}
                  {row.action === 'Provisionar' && <Clock className="w-3 h-3 text-accent-blue" />}
                  {row.action === 'Revisar' && <AlertCircle className="w-3 h-3 text-accent-coral" />}
                  {row.action === 'Nueva provision' && <Zap className="w-3 h-3 text-accent-amber" />}
                  {row.action}
                </span>
              </td>
              <td className="py-3 pr-4 text-xs text-ink font-medium">{row.provider}</td>
              <td className="py-3 pr-4 text-xs text-ink-muted">{row.service}</td>
              <td className="py-3 pr-4 text-xs text-ink font-mono">{row.amount}</td>
              <td className="py-3 pr-4 text-xs text-ink-muted max-w-[160px] truncate">{row.reason}</td>
              <td className="py-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${row.statusBg} ${row.statusColor}`}>
                  {row.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DemoInterface() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { ref, visible } = useScrollAnimation();

  const tabContent: Record<string, JSX.Element> = {
    dashboard: <DashboardTab />,
    services: <ServicesTab />,
    confirmations: <ConfirmationsTab />,
    invoices: <InvoicesTab />,
    actions: <ActionsTab />,
  };

  return (
    <section id="demo" className="py-24 lg:py-32 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_50%,rgba(188,168,150,0.12),transparent)]" />

      <div ref={ref} className="relative max-w-7xl mx-auto px-6 lg:px-8">
        <div className={`text-center max-w-2xl mx-auto mb-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight text-ink mb-4">
            Maqueta visual:{' '}
            <span className="text-ink font-semibold">panel + acciones.</span>
          </h2>
          <p className="text-ink-muted text-sm lg:text-base max-w-2xl mx-auto leading-relaxed">
            El MVP en vivo combina tres fuentes —{' '}
            <span className="text-ink font-medium">ZIP de facturas</span>,{' '}
            <span className="text-ink font-medium">fichero de devengos abiertos</span> y{' '}
            <span className="text-ink font-medium">solicitudes de provisión / controlling</span> — y devuelve acciones
            recomendadas, revisión de antigüedad, preguntas para owners y exportación Excel tipo pack de cierre.
          </p>
          <Link
            to="/ocr-test"
            className="inline-flex items-center mt-6 text-xs font-medium text-ink-muted hover:text-ink transition-colors"
          >
            Abrir revisión MVP (subidas + exportación) →
          </Link>
        </div>

        <div className={`editorial-glass-strong rounded-2xl lg:rounded-3xl overflow-hidden transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
          <div className="border-b border-ink/10 px-4 sm:px-6 overflow-x-auto bg-paper/40">
            <div className="flex gap-1 min-w-max">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all duration-200 border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-ink text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6 lg:p-8">
            {tabContent[activeTab]}
          </div>
        </div>
      </div>
    </section>
  );
}
