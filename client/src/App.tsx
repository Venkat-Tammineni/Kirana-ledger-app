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
import Bills from "@/pages/Bills";
import BillDetails from "@/pages/BillDetails";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/pos" component={Pos} />
      <Route path="/customers" component={Customers} />
      <Route path="/customers/:id" component={CustomerDetails} />
      <Route path="/products" component={Products} />
      <Route path="/bills" component={Bills} />
      <Route path="/bills/:id" component={BillDetails} />
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
