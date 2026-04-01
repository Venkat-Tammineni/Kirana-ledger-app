import { User, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  value: { name: string; phone: string };
  onChange: (next: { name: string; phone: string }) => void;
};

export function CustomerFormFields({ value, onChange }: Props) {
  return (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Full Name</label>
        <div className="relative">
          <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="John Doe"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
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
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

