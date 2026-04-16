import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import ConversationsPage from "@/pages/conversations";
import KnowledgePage from "@/pages/knowledge";
import MarketingPage from "@/pages/marketing";
import CalendarPage from "@/pages/calendar";
import WhatsappInboxPage from "@/pages/whatsapp-inbox";
import WhatsappTicketsPage from "@/pages/whatsapp-tickets";
import WhatsappSettingsPage from "@/pages/whatsapp-settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 mins
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/chat/:id" component={ChatPage} />
      <Route path="/conversations" component={ConversationsPage} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/marketing" component={MarketingPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/whatsapp" component={WhatsappInboxPage} />
      <Route path="/whatsapp/tickets" component={WhatsappTicketsPage} />
      <Route path="/whatsapp/settings" component={WhatsappSettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
