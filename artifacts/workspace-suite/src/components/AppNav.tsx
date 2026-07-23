import { Link, useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import {
  Home,
  Users,
  ClipboardList,
  FileText,
  GitBranch,
  Settings,
  Grid2x2,
} from 'lucide-react';
import {
  getSheetsMode,
  setSheetsMode,
  subscribeSheetsMode,
  SHEETS,
  type SheetsMode,
} from '@/lib/sheetsSync';

const NAV_ITEMS = [
  { href: '/',             label: 'Home',         icon: Home           },
  { href: '/leads',        label: 'Leads',        icon: Users          },
  { href: '/quote-builder', label: 'Quote Builder', icon: ClipboardList  },
  { href: '/proposal-doc', label: 'Proposal Doc', icon: FileText       },
  { href: '/timeline',     label: 'Timeline',     icon: GitBranch      },
  { href: '/apps',         label: 'Apps',         icon: Grid2x2        },
] as const;

export function AppNav() {
  const [location] = useLocation();
  const [mode, setMode] = useState<SheetsMode>(() => getSheetsMode());

  useEffect(() => subscribeSheetsMode(setMode), []);

  const toggleMode = (next: SheetsMode) => {
    if (next === 'live') {
      const ok = window.confirm(
        `Switch to LIVE?\n\nWrites will go to the production Google Sheet:\n${SHEETS.live.label}\n\nOnly use this for approved go-live testing.`,
      );
      if (!ok) return;
    }
    setSheetsMode(next);
    setMode(next);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-black/8 bg-white">
      <div className="relative flex h-16 items-center px-6">
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex h-8 w-8 items-center justify-center bg-[#FF5A45] text-sm font-bold text-white">
            N
          </span>
          <span className="text-[15px] font-semibold text-gray-900">Nexus</span>
        </div>

        <nav className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 whitespace-nowrap px-4 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-[#FF5A45] text-white'
                    : 'text-black/50 hover:text-black hover:bg-black/4'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div
            className="flex items-center rounded-full border border-black/10 bg-black/[0.03] p-0.5"
            title={mode === 'demo' ? SHEETS.demo.url : SHEETS.live.url}
          >
            <button
              type="button"
              onClick={() => toggleMode('demo')}
              className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide transition-colors ${
                mode === 'demo'
                  ? 'bg-[#101a15] text-white'
                  : 'text-black/45 hover:text-black'
              }`}
            >
              Demo
            </button>
            <button
              type="button"
              onClick={() => toggleMode('live')}
              className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide transition-colors ${
                mode === 'live'
                  ? 'bg-[#FF5A45] text-white'
                  : 'text-black/45 hover:text-black'
              }`}
            >
              Live
            </button>
          </div>
          <Link
            href="/settings"
            className={`flex h-8 w-8 items-center justify-center transition-colors ${
              location === '/settings'
                ? 'bg-[#FF5A45] text-white'
                : 'text-black/35 hover:text-black hover:bg-black/4'
            }`}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

export default AppNav;
