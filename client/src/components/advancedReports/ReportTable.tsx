import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type ReportColumn<T> = {
  key: keyof T | string;
  label: string;
  className?: string;
  render?: (row: T) => ReactNode;
};

export function processReportRows<T extends Record<string, unknown>>(
  rows: T[],
  search: string,
  sortDirection: "asc" | "desc",
  sortKey: keyof T | undefined,
  searchKeys: Array<keyof T>,
  page: number,
  rowsPerPage: number,
) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (!normalizedSearch) return true;
    return searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(normalizedSearch));
  });

  const sorted = sortKey
    ? [...filtered].sort((left, right) => {
        const leftValue = left[sortKey];
        const rightValue = right[sortKey];

        if (typeof leftValue === "number" && typeof rightValue === "number") {
          return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
        }

        const leftString = String(leftValue ?? "");
        const rightString = String(rightValue ?? "");
        return sortDirection === "asc"
          ? leftString.localeCompare(rightString)
          : rightString.localeCompare(leftString);
      })
    : filtered;

  const totalPages = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  return {
    rows: paged,
    totalRows: sorted.length,
    totalPages,
    currentPage: safePage,
    allRows: sorted,
  };
}

type ReportTableProps<T extends Record<string, unknown>> = {
  title: string;
  columns: Array<ReportColumn<T>>;
  rows: T[];
  emptyMessage: string;
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (page: number) => void;
};

export function ReportTable<T extends Record<string, unknown>>({
  title,
  columns,
  rows,
  emptyMessage,
  page,
  totalPages,
  totalRows,
  onPageChange,
}: ReportTableProps<T>) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{totalRows} matching rows</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={column.className}>
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${title}-${index}`}>
                {columns.map((column) => (
                  <TableCell key={`${title}-${index}-${String(column.key)}`} className={cn(column.className)}>
                    {column.render ? column.render(row) : String(row[column.key as keyof T] ?? "")}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
