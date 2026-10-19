import React from 'react';

export default function StatsCard({ title, value, subtitle, icon: Icon, color = 'emerald' }) {
  const colorStyles = {
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
      text: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300'
    },
    rose: {
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
      text: 'text-rose-400',
      badge: 'bg-rose-500/20 text-rose-300'
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
      text: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300'
    },
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
      text: 'text-cyan-400',
      badge: 'bg-cyan-500/20 text-cyan-300'
    }
  }[color] || {
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/20',
    text: 'text-slate-400',
    badge: 'bg-slate-500/20 text-slate-300'
  };

  return (
    <div className="glass-card p-5 relative overflow-hidden transition-all hover:border-white/15 hover:shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg ${colorStyles.bg} border ${colorStyles.border} flex items-center justify-center ${colorStyles.text}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-white tracking-tight">
          {Number(value || 0).toLocaleString()}
        </span>
      </div>

      {subtitle && (
        <p className="text-xs text-slate-400 mt-2 font-medium flex items-center gap-1.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}
