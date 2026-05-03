import { CheckCircle, Clock, FileText, AlertTriangle, ArrowDownRight, ArrowUpRight, RotateCcw, Eye } from 'lucide-react';

const kpis = [
  { label: 'Servicios esperados', value: '124', icon: FileText, color: 'text-accent-blue', bg: 'bg-accent-blue/12' },
  { label: 'Confirmados por owners', value: '87', icon: CheckCircle, color: 'text-ink', bg: 'bg-ink/10' },
  { label: 'Facturas recibidas', value: '96', icon: ArrowDownRight, color: 'text-accent-blue', bg: 'bg-accent-blue/12' },
  { label: 'Provisiones abiertas', value: '42', icon: Clock, color: 'text-amber-800', bg: 'bg-amber-500/15' },
];

const actions = [
  { label: 'Nueva provision', value: '18', icon: ArrowUpRight, color: 'bg-accent-blue' },
  { label: 'Reversal total', value: '11', icon: RotateCcw, color: 'bg-ink' },
  { label: 'Reversal parcial', value: '6', icon: ArrowDownRight, color: 'bg-accent-blue' },
  { label: 'Revisión necesaria', value: '14', icon: Eye, color: 'bg-accent-coral' },
];

const rows = [
  { provider: 'Google', service: 'Ads campana abril', owner: 'Marketing', invoice: false, provision: false, action: 'Provisionar 8.700\u20AC', actionColor: 'text-accent-blue' },
  { provider: 'Limpiezas Sol', service: 'Limpieza oficinas', owner: 'Office', invoice: true, provision: true, action: 'Reversal total', actionColor: 'text-ink-muted' },
  { provider: 'AWS', service: 'Cloud hosting', owner: 'Tech', invoice: 'Parcial', provision: true, action: 'Reversal parcial', actionColor: 'text-accent-blue' },
  { provider: 'Agencia X', service: 'SEO mensual', owner: 'Marketing', invoice: false, provision: true, action: 'Mantener provision', actionColor: 'text-amber-800' },
];

function StatusBadge({ value }: { value: boolean | string }) {
  if (value === true)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/[0.08] text-ink">
        Sí
      </span>
    );
  if (value === false)
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-ink/6 text-ink-subtle">
        No
      </span>
    );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-900">
      {value}
    </span>
  );
}

export default function HeroDashboard() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      <div className="absolute -inset-3 bg-gradient-to-b from-ink/[0.04] via-transparent to-transparent rounded-[2rem] blur-2xl" />

      <div className="relative editorial-glass-strong rounded-2xl lg:rounded-3xl p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-sm lg:text-base font-semibold text-ink font-sans">Revisión mensual de provisiones</h3>
            <p className="text-xs text-ink-muted mt-0.5">Abril 2026</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse" />
            <span className="text-[10px] text-ink-muted hidden sm:inline">En proceso</span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="bg-paper/80 rounded-xl p-3 lg:p-4 border border-ink/8 hover:border-ink/15 transition-colors group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-6 h-6 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`w-3 h-3 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-xl lg:text-2xl font-bold text-ink group-hover:text-ink/80 transition-colors">{kpi.value}</p>
              <p className="text-[10px] lg:text-xs text-ink-muted mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <p className="text-xs text-ink-muted mb-3 font-medium">Acciones sugeridas</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {actions.map((a) => (
              <div key={a.label} className="flex items-center gap-3 bg-paper/70 rounded-lg px-3 py-2.5 border border-ink/8">
                <div className={`w-1.5 h-8 rounded-full ${a.color}`} />
                <div>
                  <p className="text-sm lg:text-base font-bold text-ink">{a.value}</p>
                  <p className="text-[10px] text-ink-muted">{a.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ink/10">
                {['Proveedor', 'Servicio', 'Owner', 'Factura', 'Provisión', 'Acción'].map((h) => (
                  <th key={h} className="text-[10px] uppercase tracking-wider text-ink-muted pb-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-ink/[0.06] hover:bg-ink/[0.02] transition-colors">
                  <td className="py-2.5 pr-4 text-xs font-medium text-ink">{row.provider}</td>
                  <td className="py-2.5 pr-4 text-xs text-ink-muted">{row.service}</td>
                  <td className="py-2.5 pr-4">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-ink/6 text-ink-muted">{row.owner}</span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge value={row.invoice} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge value={row.provision} />
                  </td>
                  <td className={`py-2.5 text-xs font-medium ${row.actionColor}`}>{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 lg:-left-12 animate-float z-10 hidden sm:block">
        <div className="w-44 rounded-2xl p-4 bg-paper border border-ink/10 shadow-xl shadow-ink/10 -rotate-6">
          <p className="text-2xl font-bold text-ink">42</p>
          <p className="text-[10px] text-ink-muted mt-1">Provisiones abiertas</p>
          <div className="flex -space-x-1.5 mt-3">
            {[AlertTriangle, Clock, Eye].map((Icon, idx) => (
              <div key={idx} className="w-5 h-5 rounded-full bg-cream-deep border border-ink/10 flex items-center justify-center">
                <Icon className="w-2.5 h-2.5 text-ink-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -bottom-4 left-28 lg:left-24 animate-float-delayed z-20 hidden sm:block">
        <div className="w-40 rounded-2xl p-4 bg-paper border border-ink/10 shadow-lg shadow-ink/10 -rotate-3">
          <p className="text-2xl font-bold text-ink">18</p>
          <p className="text-[10px] text-ink-muted mt-1">Nuevas provisiones</p>
          <div className="w-full h-1 bg-ink/10 rounded-full mt-3">
            <div className="w-3/5 h-1 bg-accent-blue rounded-full" />
          </div>
        </div>
      </div>

      <div className="absolute -top-4 -right-4 lg:-right-8 animate-float-slow z-10 hidden lg:block">
        <div className="w-36 rounded-2xl p-3 bg-paper border border-ink/10 shadow-lg shadow-ink/10 rotate-3">
          <p className="text-lg font-bold text-ink">14</p>
          <p className="text-[10px] text-ink-muted mt-0.5">Revisión necesaria</p>
          <div className="flex items-center gap-1 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-coral animate-pulse" />
            <span className="text-[9px] text-ink-muted">Pendiente</span>
          </div>
        </div>
      </div>
    </div>
  );
}
