import { Link, useLocation } from 'wouter';
import { Home, Users, ClipboardList, Bookmark, FileText, GitBranch, Settings, Grid2x2 } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/',             label: 'Home',         icon: Home           },
  { href: '/leads',        label: 'Leads',        icon: Users          },
  { href: '/quote-builder', label: 'Quote Builder', icon: ClipboardList  },
  { href: '/saved-quotes', label: 'Saved Quotes', icon: Bookmark },
  { href: '/proposal-doc', label: 'Proposal Doc', icon: FileText       },
  { href: '/timeline',     label: 'Timeline',     icon: GitBranch      },
  { href: '/apps',         label: 'Apps',         icon: Grid2x2        },
] as const;

export function AppNav() {
  const [location] = useLocation();

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
            const isActive = href === '/saved-quotes' ? location.startsWith('/saved-quotes') : location === href;
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
