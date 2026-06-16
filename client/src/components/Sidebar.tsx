import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Package,
  History,
  Store,
  Warehouse,
  BarChart3,
  Landmark,
  UsersRound,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Billing", href: "/pos", icon: ShoppingCart },
  { label: "Quotations", href: "/quotations", icon: ScrollText },
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Accounts", href: "/accounts", icon: Landmark },
  { label: "Staff", href: "/staff", icon: UsersRound },
  { label: "Inventory", href: "/inventory", icon: Warehouse },
  { label: "Reporting", href: "/reporting", icon: BarChart3 },
  { label: "Bills History", href: "/bills", icon: History },
];

export function Sidebar() {
  const [location] = useLocation();
  const year = new Date().getFullYear();

  return (
    <div className="hidden md:flex flex-col w-64 bg-card border-r border-border h-screen sticky top-0">
      <div className="p-6 border-b border-border flex items-center gap-3">
        <div className="bg-primary/10 p-2 rounded-lg">
          <Store className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="font-display font-bold text-lg leading-none">Ganesh</h1>
          <p className="text-xs text-muted-foreground mt-1">POS System</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? location === item.href
              : location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer text-sm font-medium",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="bg-muted/50 rounded-xl p-4">
          <p className="text-xs text-muted-foreground font-medium">Support</p>
          <a
            href="mailto:venkatinvitesyou@gmail.com"
            className="inline-block text-xs text-primary hover:underline mt-2"
          >
            Email
          </a>
          <p className="text-[11px] text-muted-foreground mt-3">(c) {year} Venkat Tammineni. All rights reserved.</p>

        </div>
      </div>
    </div>
  );
}

export function MobileNav() {
  const [location] = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 px-4 py-2 shadow-xl">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? location === item.href
              : location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href}>
              <div className="flex flex-col items-center gap-1 p-2 cursor-pointer">
                <div className={cn("p-1.5 rounded-lg transition-colors", isActive ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
                  <item.icon className="w-5 h-5" />
                </div>
                <span className={cn("text-[10px] font-medium", isActive ? "text-primary" : "text-muted-foreground")}>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
