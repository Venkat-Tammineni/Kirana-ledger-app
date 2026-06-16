import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyINR } from "@/lib/format";

type DeductionCustomer = {
  id: number;
  name: string;
  phone: string;
  balance?: number;
};

type CustomerDeductionSelectProps = {
  customers: DeductionCustomer[];
  value: number | null;
  onChange: (value: number | null) => void;
};

export function CustomerDeductionSelect({ customers, value, onChange }: CustomerDeductionSelectProps) {
  return (
    <Select
      value={value ? String(value) : "none"}
      onValueChange={(selectedValue) => onChange(selectedValue === "none" ? null : Number(selectedValue))}
    >
      <SelectTrigger className="h-10">
        <SelectValue placeholder="Do not deduct customer balance" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Do not deduct customer balance</SelectItem>
        {customers.map((customer) => {
          const balance = Number(customer.balance || 0);

          return (
            <SelectItem key={customer.id} value={String(customer.id)} textValue={`${customer.name} (${customer.phone})`}>
              <span className="flex w-full min-w-0 items-baseline gap-2">
                <span className="truncate">{customer.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  Old balance {formatCurrencyINR(balance)}
                </span>
                <span className="truncate text-sm text-muted-foreground">({customer.phone})</span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
