import { Switch, Route } from "wouter";
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
import AdvancedReports from "@/pages/advancedReports";
import Bills from "@/pages/Bills";
import BillDetails from "@/pages/BillDetails";
import BillEdit from "@/pages/BillEdit";
import Quotations from "@/pages/Quotations";
import QuotationCreate from "@/pages/QuotationCreate";
import QuotationEdit from "@/pages/QuotationEdit";
import QuotationDetails from "@/pages/QuotationDetails";
import Ops from "@/pages/Ops";
import NotFound from "@/pages/not-found";

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
      <Route path="/advanced-reports" component={AdvancedReports} />
      <Route path="/ops" component={Ops} />
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
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background font-sans text-foreground">
          <Sidebar />
          <main className="flex-1 overflow-x-hidden">
            <Router />
          </main>
          <MobileNav />
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
