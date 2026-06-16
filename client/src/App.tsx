import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar, MobileNav } from "@/components/Sidebar";

import Dashboard from "@/pages/Dashboard";
import Pos from "@/pages/Pos";
import Customers from "@/pages/Customers";
import CustomerDetails from "@/pages/CustomerDetails";
import Products from "@/pages/Products";
import Accounts from "@/pages/Accounts";
import AccountDetails from "@/pages/AccountDetails";
import AccountInvestmentDetails from "@/pages/AccountInvestmentDetails";
import Staff from "@/pages/Staff";
import Inventory from "@/pages/Inventory";
import Reporting from "@/pages/Reporting";
import Bills from "@/pages/Bills";
import BillDetails from "@/pages/BillDetails";
import BillEdit from "@/pages/BillEdit";
import Quotations from "@/pages/Quotations";
import QuotationCreate from "@/pages/QuotationCreate";
import QuotationEdit from "@/pages/QuotationEdit";
import QuotationDetails from "@/pages/QuotationDetails";
import NotFound from "@/pages/not-found";
import { VoiceAssistant } from "@/components/VoiceAssistant";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pos" component={Pos} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/:id" component={CustomerDetails} />
      <Route path="/products" component={Products} />
      <Route path="/accounts" component={Accounts} />
      <Route path="/accounts/investment" component={AccountInvestmentDetails} />
      <Route path="/accounts/:id" component={AccountDetails} />
      <Route path="/staff" component={Staff} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/reporting" component={Reporting} />
      <Route path="/bills" component={Bills} />
      <Route path="/bills/:id/edit" component={BillEdit} />
      <Route path="/bills/:id" component={BillDetails} />
      <Route path="/quotations" component={Quotations} />
      <Route path="/quotations/new" component={QuotationCreate} />
      <Route path="/quotations/:id/edit" component={QuotationEdit} />
      <Route path="/quotations/:id" component={QuotationDetails} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [, setLocation] = useLocation();
  const navigationVoiceCommands = [
    {
      label: "Open a page",
      examples: ["open billing", "customers", "open accounts"],
      run: ({ normalized }: { raw: string; normalized: string }) => {
        const routeMap: Record<string, string> = {
          billing: "/pos",
          billings: "/pos",
          pos: "/pos",
          customers: "/customers",
          customer: "/customers",
          products: "/products",
          product: "/products",
          accounts: "/accounts",
          account: "/accounts",
          staff: "/staff",
          bills: "/bills",
          "bill history": "/bills",
          quotations: "/quotations",
          quotation: "/quotations",
          dashboard: "/",
          inventory: "/inventory",
          reporting: "/reporting",
        };
        const target = normalized.startsWith("open ")
          ? normalized.replace(/^open\s+/, "").trim()
          : normalized.trim();
        const route = routeMap[target];
        if (!route) return null;
        setLocation(route);
        return `Opening ${target}.`;
      },
    },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background font-sans text-foreground">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <Router />
          </main>
          <MobileNav />
          <Toaster />
          <VoiceAssistant
            title="Voice Navigation"
            subtitle="Use voice to open pages from anywhere in the app."
            commands={navigationVoiceCommands}
            className="left-4 right-auto items-start"
          />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
