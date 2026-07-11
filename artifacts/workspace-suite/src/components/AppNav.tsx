import { Link, useLocation } from 'wouter';
import { LayoutDashboard, CalendarDays } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
];

export function AppNav() {
  const [location] = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-emerald-100 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-lime-400 to-emerald-600 text-sm font-bold text-white shadow-md shadow-emerald-500/30">
            W
          </span>
          <span className="text-[15px] font-semibold text-gray-900">Workspace Suite</span>
        </div>

        <nav className="flex items-center gap-1 rounded-full bg-emerald-50/70 p-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'bg-gradient-to-br from-emerald-600 to-green-600 text-white shadow-sm'
                    : 'text-emerald-800/70 hover:text-emerald-900'
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
