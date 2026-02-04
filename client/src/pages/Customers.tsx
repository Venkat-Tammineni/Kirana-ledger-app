import { useState } from "react";
import { useCustomers, useCreateCustomer } from "@/hooks/use-pos";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, User, Phone, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useCustomers(search);
  const { mutate: createCustomer, isPending } = useCreateCustomer();
  const [isOpen, setIsOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });

  const handleCreate = () => {
    createCustomer(newCustomer, {
      onSuccess: () => {
        setIsOpen(false);
        setNewCustomer({ name: "", phone: "" });
      }
    });
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Customers</h1>
          <p className="text-muted-foreground mt-1">Manage customer profiles and view ledgers.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary shadow-lg shadow-primary/25">
              <Plus className="w-4 h-4 mr-2" /> Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-9" 
                    placeholder="John Doe" 
                    value={newCustomer.name}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-9" 
                    placeholder="9876543210" 
                    value={newCustomer.phone}
                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={isPending || !newCustomer.name}>
                {isPending ? "Creating..." : "Create Customer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input 
          className="pl-10 h-12 bg-card border-border shadow-sm text-base"
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-3">
          {customers?.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <div className="bg-card p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all cursor-pointer group flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{customer.name}</h3>
                    <p className="text-sm text-muted-foreground">{customer.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Balance</p>
                    <p className={cn(
                      "font-mono font-bold",
                      Number(customer.balance) > 0 ? "text-red-500" : "text-green-600"
                    )}>
                      ₹{Number(customer.balance).toFixed(2)}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </Link>
          ))}
          {customers?.length === 0 && (
            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
              <User className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>No customers found matching "{search}"</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
