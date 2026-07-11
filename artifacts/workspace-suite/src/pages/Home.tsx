import { useState } from 'react';
import { useLocation } from 'wouter';
import { Users, LayoutDashboard, Settings2, GitBranch, CalendarDays, Check, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tile = {
  href: string;
  label: string;
  icon: LucideIcon;
  features: string[];
};

const TILES: Tile[] = [
  {
    href: '/employees',
    label: 'Leads',
    icon: Users,
    features: ['View team roster', 'Track attendance', 'Manage roles', 'Contact staff'],
  },
  {
    href: '/dashboard',
    label: 'Tasks',
    icon: LayoutDashboard,
    features: ['Track tasks', 'Manage projects', 'View progress', 'Quick search'],
  },
  {
    href: '/setup',
    label: 'Forms',
    icon: Settings2,
    features: ['Configure business info', 'Set modules & permissions', 'Import / export data', 'Map categories'],
  },
  {
    href: '/timeline',
    label: 'Timeline',
    icon: GitBranch,
    features: ['View process steps', 'Track milestones', 'Monitor progress', 'See completed stages'],
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    features: ['Schedule events', 'View bookings', 'Manage availability', 'Track appointments'],
  },
];

export function Home() {
  const [, navigate] = useLocation();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = TILES[activeIndex];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center bg-[#2ecc71] px-4 py-10">
      <div className="w-full max-w-[860px] overflow-hidden rounded-[28px] shadow-2xl">
        {/* ── white top section ── */}
        <div className="bg-white px-8 pb-10 pt-9 sm:px-12">
          <div className="text-center">
            <p className="text-[13px] font-medium text-gray-400">Please select a</p>
            <h1 className="mt-1 text-[26px] font-bold tracking-tight text-[#101a15] sm:text-[28px]">
              PAGE
            </h1>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5 sm:gap-5">
            {TILES.map((tile, i) => {
              const Icon = tile.icon;
              const isActive = i === activeIndex;
              return (
                <button
                  key={tile.href}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onFocus={() => setActiveIndex(i)}
                  onClick={() => navigate(tile.href)}
                  className={`group relative flex flex-col items-center gap-3 rounded-[16px] bg-[#f6f7f9] px-3 py-6 text-center shadow-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-white shadow-[0_10px_30px_-8px_rgba(16,60,40,0.25)] ring-2 ring-[#2ecc71]'
                      : 'hover:bg-white hover:shadow-md'
                  }`}
                >
                  <Icon
                    className={`h-7 w-7 transition-colors ${isActive ? 'text-[#101a15]' : 'text-gray-400 group-hover:text-gray-600'}`}
                    strokeWidth={1.6}
                  />
                  <span
                    className={`text-[13px] font-semibold transition-colors ${
                      isActive ? 'text-[#101a15]' : 'text-gray-500 group-hover:text-gray-700'
                    }`}
                  >
                    {tile.label}
                  </span>

                  {isActive && (
                    <span className="absolute -bottom-2.5 -right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#2ecc71] shadow-md ring-4 ring-white">
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── green bottom panel ── */}
        <div className="flex flex-col gap-6 bg-[#2ecc71] px-8 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <ul className="grid grid-cols-1 gap-x-10 gap-y-1.5 sm:grid-cols-2">
            {active.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-[13px] font-medium text-[#0d2318]">
                <Check className="h-3.5 w-3.5 shrink-0 text-[#0d2318]" strokeWidth={3} />
                {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => navigate(active.href)}
            className="flex shrink-0 items-center gap-3 self-start sm:self-auto"
          >
            <span className="text-right text-[11px] font-bold uppercase tracking-widest text-[#0d2318] sm:text-left">
              Open
              <br />
              {active.label}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#2ecc71] shadow-md transition-transform group-hover:scale-105 hover:scale-105">
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default Home;
