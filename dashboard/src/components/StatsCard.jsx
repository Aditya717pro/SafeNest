import React from 'react';

export default function StatsCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colorStyles = {
    rose: {
      bg: 'bg-rose-100',
      border: 'border-rose-200',
      text: 'text-rose-600',
      badge: 'bg-rose-100 text-rose-700'
    },
    amber: {
      bg: 'bg-amber-100',
      border: 'border-amber-200',
      text: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-700'
    },
    sky: {
      bg: 'bg-sky-100',
      border: 'border-sky-200',
      text: 'text-sky-600',
      badge: 'bg-sky-100 text-sky-700'
    },
    blue: {
      bg: 'bg-blue-100',
      border: 'border-blue-200',
      text: 'text-blue-600',
      badge: 'bg-blue-100 text-blue-700'
    }
  }[color] || {
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    text: 'text-slate-600',
    badge: 'bg-slate-100 text-slate-700'
  };

  return (
    <div className="glass-card p-5 relative overflow-hidden transition-all hover:border-sky-300 hover:shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</span>
        {Icon && (
          <div className={`w-9 h-9 rounded-lg ${colorStyles.bg} border ${colorStyles.border} flex items-center justify-center ${colorStyles.text}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-extrabold text-sky-950 tracking-tight">
          {Number(value || 0).toLocaleString()}
        </span>
      </div>

      {subtitle && (
        <p className="text-xs text-slate-500 mt-2 font-medium flex items-center gap-1.5">
          {subtitle}
        </p>
      )}
    </div>
  );
}
