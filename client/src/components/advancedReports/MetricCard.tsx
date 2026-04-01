import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyINR } from "@/lib/format";

type MetricCardProps = {
  title: string;
  value: number;
  subtitle?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning";
  onClick?: () => void;
};

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "default",
  onClick,
}: MetricCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-primary";

  return (
    <Card
      className={onClick ? "cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md" : undefined}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className={`mt-2 text-2xl font-bold font-display ${toneClass}`}>{formatCurrencyINR(value)}</p>
            {subtitle ? <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
          {Icon ? (
            <div className="rounded-xl bg-primary/10 p-3">
              <Icon className={`h-5 w-5 ${toneClass}`} />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
