import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppNav } from '@/components/AppNav';
import { Home } from '@/pages/Home';
import { Dashboard } from '@/pages/Dashboard';
import { CalendarPage } from '@/pages/Calendar';
import { SetupWizard } from '@/pages/SetupWizard';
import { EmployeeDashboard } from '@/pages/EmployeeDashboard';
import { ProposalDoc } from '@/pages/ProposalDoc';
import { ProcessTimeline } from '@/pages/ProcessTimeline';

const queryClient = new QueryClient();

function Router() {
  return (
    <>
      <AppNav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/setup" component={SetupWizard} />
        <Route path="/employees" component={EmployeeDashboard} />
        <Route path="/proposal-doc" component={ProposalDoc} />
        <Route path="/timeline" component={ProcessTimeline} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
