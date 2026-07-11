import { Link, useLocation } from 'wouter';
import { Home, LayoutDashboard, CalendarDays, Settings2, Users, GitBranch, FileText } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/setup', label: 'Setup', icon: Settings2 },
  { href: '/proposal-doc', label: 'Proposal Doc', icon: FileText },
  { href: '/timeline', label: 'Timeline', icon: GitBranch },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
];

export function AppNav() {
  const [location] = useLocation();
  const isHome = location === '/';

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-md transition-colors ${
        isHome ? 'border-emerald-100 bg-white/80' : 'border-white/10 bg-[#0a0a0a]/95'
      }`}
    >
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-500/30">
            W
          </span>
          <span className={`text-[15px] font-semibold ${isHome ? 'text-gray-900' : 'text-white'}`}>
            Workspace Suite
          </span>
        </div>

        <nav
          className={`flex items-center gap-1 rounded-full p-1 ${
            isHome ? 'bg-emerald-50/70' : 'bg-white/5 border border-white/10'
          }`}
        >
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/30'
                    : isHome
                    ? 'text-emerald-800/70 hover:text-emerald-900'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export default AppNav;
