import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';

interface PlaceholderSectionProps {
  title: string;
  phase: string;
  description: string;
  icon: LucideIcon;
  features?: string[];
}

export const PlaceholderSection: React.FC<PlaceholderSectionProps> = ({
  title,
  phase,
  description,
  icon: Icon,
  features = []
}) => {
  return (
    <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
      <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
        <Icon className="w-8 h-8" />
      </div>

      <div className="space-y-1">
        <div className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px] font-medium border border-slate-700">
          <Sparkles className="w-3 h-3 text-cyan-400" />
          <span>{phase}</span>
        </div>
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {features.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 text-left max-w-sm mx-auto">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Planned Capabilities</p>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {features.map((feat, i) => (
              <li key={i} className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2">
        <span className="text-[11px] font-medium text-slate-500 bg-slate-800/50 px-3 py-1 rounded-md border border-slate-800">
          Coming in a later phase.
        </span>
      </div>
    </div>
  );
};