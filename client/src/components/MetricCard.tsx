import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: string;
  trendUp?: boolean;
  className?: string;
  subValue?: string;
  clickable?: boolean;
  titleClassName?: string;
}

export function MetricCard({ title, value, icon, trend, trendUp, className, subValue, clickable, titleClassName }: MetricCardProps) {
  return (
    <div className={cn(
      "min-w-0 bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-md transition-all duration-300",
      clickable && "cursor-pointer hover:-translate-y-0.5",
      className
    )}>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className={cn("mb-1 break-words text-sm font-medium text-muted-foreground", titleClassName)}>{title}</p>
          <h3 className="whitespace-nowrap text-xl font-display font-bold leading-tight tracking-tight text-foreground sm:text-2xl">{value}</h3>
          {subValue && (
            <p className="mt-1 break-words text-xs text-muted-foreground">{subValue}</p>
          )}
        </div>
        <div className="shrink-0 rounded-xl bg-primary/10 p-3 text-primary">
          {icon}
        </div>
      </div>
      
      {trend && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className={cn(
            "font-medium px-1.5 py-0.5 rounded-md",
            trendUp ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          )}>
            {trend}
          </span>
          <span className="text-muted-foreground">vs last month</span>
        </div>
      )}
    </div>
  );
}
