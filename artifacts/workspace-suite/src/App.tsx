import { useEffect, useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppNav } from '@/components/AppNav';
import { ActiveLeadProvider } from '@/context/ActiveLeadContext';
import { TeamPasswordGate } from '@/components/TeamPasswordGate';
import { Home } from '@/pages/Home';
import { Leads } from '@/pages/Leads';
import { Forms as QuoteBuilder } from '@/pages/Forms';
import { SavedQuotes } from '@/pages/SavedQuotes';
import { QuoteReview } from '@/pages/QuoteReview';
import { ProposalDoc } from '@/pages/ProposalDoc';
import { Timeline } from '@/pages/Timeline';
import { Settings } from '@/pages/Settings';
import { Apps } from '@/pages/Apps';
import NotFound from '@/pages/NotFound';
import { FRESH_QUOTE_BUILDER_EVENT } from '@/lib/quoteBuilderSession';

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
  const [quoteBuilderKey, setQuoteBuilderKey] = useState(0);
  useEffect(() => {
    const onFresh = () => setQuoteBuilderKey((n) => n + 1);
    window.addEventListener(FRESH_QUOTE_BUILDER_EVENT, onFresh);
    return () => window.removeEventListener(FRESH_QUOTE_BUILDER_EVENT, onFresh);
  }, []);
  return (
    <>
      <ScrollToTop />
      <AppNav />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/leads" component={Leads} />
        <Route path="/quote-builder">{() => <QuoteBuilder key={quoteBuilderKey} />}</Route>
        <Route path="/saved-quotes/:id" component={QuoteReview} />
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
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <TeamPasswordGate>
          <ActiveLeadProvider>
            <Router />
          </ActiveLeadProvider>
        </TeamPasswordGate>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
