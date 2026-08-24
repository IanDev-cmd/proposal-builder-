import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppNav } from '@/components/AppNav';
import { ActiveLeadProvider } from '@/context/ActiveLeadContext';
import { Home } from '@/pages/Home';
import { Leads } from '@/pages/Leads';
import { Forms as QuoteBuilder } from '@/pages/Forms';
import { SavedQuotes } from '@/pages/SavedQuotes';
import { ProposalDoc } from '@/pages/ProposalDoc';
import { Timeline } from '@/pages/Timeline';
import { Settings } from '@/pages/Settings';
import { Apps } from '@/pages/Apps';
import NotFound from '@/pages/NotFound';
import { hydrateWorkspace } from '@/lib/hydrateWorkspace';

const queryClient = new QueryClient();

function scrollPagesToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  document.querySelectorAll('[data-page-scroll]').forEach((node) => {
    (node as HTMLElement).scrollTop = 0;
  });
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    scrollPagesToTop();
  }, [location]);
  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <AppNav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/leads" component={Leads} />
        <Route path="/quote-builder" component={QuoteBuilder} />
        <Route path="/saved-quotes/:id" component={SavedQuotes} />
        <Route path="/saved-quotes" component={SavedQuotes} />
        <Route path="/proposal-doc" component={ProposalDoc} />
        <Route path="/timeline" component={Timeline} />
        <Route path="/settings" component={Settings} />
        <Route path="/apps" component={Apps} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  useEffect(() => {
    void hydrateWorkspace();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ActiveLeadProvider>
            <Router />
          </ActiveLeadProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
