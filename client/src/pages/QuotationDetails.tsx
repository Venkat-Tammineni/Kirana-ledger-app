import { useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowLeft, CheckCircle2, Download, Pencil, Printer, Repeat, Send, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useConvertQuotationToBill, useQuotation, useUpdateQuotationStatus } from "@/hooks/use-pos";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatCurrencyINR, formatDate, formatDateTime } from "@/lib/format";
import { formatBillLabel } from "@shared/billing";

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatPdfMoney(value: number) {
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function padOrTrim(value: string, max = 30) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function estimatePdfTextWidth(text: string, size: number, font = "F1") {
  const factor = font === "F2" ? 0.56 : 0.52;
  return text.length * size * factor;
}

const STATUS_OPTIONS = [
  { value: "sent", label: "Mark Sent", icon: Send },
  { value: "accepted", label: "Mark Accepted", icon: CheckCircle2 },
  { value: "rejected", label: "Mark Rejected", icon: XCircle },
] as const;

export default function QuotationDetails() {
  const [, params] = useRoute("/quotations/:id");
  const id = Number(params?.id);
  const [, setLocation] = useLocation();
  const { data: quotation, isLoading } = useQuotation(id);
  const { mutate: convertToBill, isPending: isConverting } = useConvertQuotationToBill();
  const { mutate: updateStatus, isPending: isUpdatingStatus } = useUpdateQuotationStatus();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summaryRows = useMemo(
    () =>
      quotation
        ? [
            { label: "This Quotation Total", amount: Number(quotation.subtotalAmount || quotation.totalAmount || 0), emphasis: false },
            ...(quotation.charges || []).map((charge) => ({
              label: charge.label,
              amount: Number(charge.amount || 0),
              emphasis: false,
            })),
            { label: "Total", amount: Number(quotation.totalAmount || 0), emphasis: true },
          ]
        : [],
    [quotation],
  );

  const handleDownload = () => {
    if (!quotation) return;

    const pageWidth = 595;
    const pageHeight = 842;
    const left = 48;
    const right = 547;
    const centerX = pageWidth / 2;
    const qtyX = 305;
    const priceX = 420;
    const amtRight = right - 4;
    const gold = "0.788 0.659 0.298";
    const dark = "0.165 0.125 0.047";
    const mid = "0.361 0.290 0.165";
    const muted = "0.545 0.451 0.333";
    const light = "0.969 0.949 0.910";
    const pages: string[][] = [];

    const setRGB = (ops: string[], r: string) => ops.push(`${r} rg`);
    const setStrokeRGB = (ops: string[], r: string) => ops.push(`${r} RG`);
    const drawText = (ops: string[], text: string, x: number, y: number, font = "F1", size = 12) => {
      ops.push("BT");
      ops.push(`/${font} ${size} Tf`);
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
      ops.push(`(${escapePdfText(text)}) Tj`);
      ops.push("ET");
    };
    const drawCenteredText = (ops: string[], text: string, x: number, y: number, font = "F1", size = 12) =>
      drawText(ops, text, x - estimatePdfTextWidth(text, size, font) / 2, y, font, size);
    const drawRightText = (ops: string[], text: string, x: number, y: number, font = "F1", size = 12) =>
      drawText(ops, text, x - estimatePdfTextWidth(text, size, font), y, font, size);
    const drawLine = (ops: string[], x1: number, y1: number, x2: number, y2: number, width = 0.5) => {
      ops.push(`${width} w`);
      ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    };
    const fillRect = (ops: string[], x: number, y: number, w: number, h: number) => {
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    };
    const strokeRect = (ops: string[], x: number, y: number, w: number, h: number, lw = 0.5) => {
      ops.push(`${lw} w`);
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    };
    const drawDiamond = (ops: string[], cx: number, cy: number, r = 3) => {
      ops.push(`${cx.toFixed(2)} ${(cy + r).toFixed(2)} m`);
      ops.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} l`);
      ops.push(`${cx.toFixed(2)} ${(cy - r).toFixed(2)} l`);
      ops.push(`${(cx - r).toFixed(2)} ${cy.toFixed(2)} l`);
      ops.push("h f");
    };
    const drawOrnament = (ops: string[], y: number) => {
      setRGB(ops, gold);
      setStrokeRGB(ops, gold);
      drawLine(ops, left, y, centerX - 20, y, 0.6);
      drawLine(ops, centerX + 20, y, right, y, 0.6);
      drawDiamond(ops, centerX - 10, y);
      drawDiamond(ops, centerX, y);
      drawDiamond(ops, centerX + 10, y);
      setRGB(ops, dark);
      setStrokeRGB(ops, "0 0 0");
    };
    const drawTableHeader = (ops: string[], y: number) => {
      setRGB(ops, "0.961 0.941 0.898");
      fillRect(ops, left - 4, y - 10, right - left + 8, 22);
      setRGB(ops, muted);
      drawText(ops, "ITEM", left, y, "F2", 9);
      drawRightText(ops, "QTY", qtyX, y, "F2", 9);
      drawRightText(ops, "UNIT PRICE", priceX, y, "F2", 9);
      drawRightText(ops, "AMOUNT", amtRight, y, "F2", 9);
      setRGB(ops, dark);
      setStrokeRGB(ops, gold);
      drawLine(ops, left, y - 12, right, y - 12, 1);
      setStrokeRGB(ops, "0 0 0");
    };

    const startPage = (isFirst: boolean): { ops: string[]; y: number } => {
      const ops: string[] = [];
      pages.push(ops);
      setRGB(ops, gold);
      fillRect(ops, 0, pageHeight - 6, pageWidth, 6);
      setRGB(ops, dark);
      setStrokeRGB(ops, "0 0 0");

      if (isFirst) {
        drawCenteredText(ops, "SRI LAKSHMI TRADERS", centerX, 800, "F2", 22);
        drawOrnament(ops, 786);
        setRGB(ops, muted);
        drawCenteredText(ops, "Hyderabad, Telangana", centerX, 772, "F1", 10);
        drawCenteredText(ops, "Phone: 9550260069, 7981695206", centerX, 758, "F1", 10);
        drawOrnament(ops, 744);

        setRGB(ops, light);
        fillRect(ops, left - 4, 677, right - left + 8, 60);
        setStrokeRGB(ops, gold);
        strokeRect(ops, left - 4, 677, right - left + 8, 60, 0.6);
        setStrokeRGB(ops, "0 0 0");

        setRGB(ops, muted);
        drawText(ops, "QUOTED TO", left, 727, "F1", 8);
        setRGB(ops, dark);
        drawText(ops, quotation.customer?.name || "Walk-in Customer", left, 713, "F2", 13);
        if (quotation.customer?.phone) {
          setRGB(ops, mid);
          drawText(ops, quotation.customer.phone, left, 699, "F1", 10);
        }

        setRGB(ops, muted);
        drawRightText(ops, "QUOTATION", right, 727, "F1", 8);
        setRGB(ops, gold);
        drawRightText(ops, `#Q${quotation.id}`, right, 713, "F2", 13);
        setRGB(ops, mid);
        drawRightText(ops, quotation.date ? formatDate(quotation.date, "dd/MM/yyyy") : "-", right, 699, "F1", 10);
        drawRightText(ops, `Status: ${quotation.status}`, right, 685, "F1", 9);

        setRGB(ops, dark);
        drawTableHeader(ops, 658);
        return { ops, y: 632 };
      }

      drawCenteredText(ops, "SRI LAKSHMI TRADERS", centerX, 800, "F2", 14);
      setRGB(ops, muted);
      drawRightText(ops, `#Q${quotation.id}`, right, 782, "F1", 10);
      drawRightText(ops, quotation.date ? formatDate(quotation.date, "dd/MM/yyyy") : "-", right, 770, "F1", 10);
      drawOrnament(ops, 758);
      setRGB(ops, dark);
      drawTableHeader(ops, 738);
      return { ops, y: 712 };
    };

    let { ops: cur, y } = startPage(true);

    quotation.items.forEach((item, idx) => {
      if (y < 130) ({ ops: cur, y } = startPage(false));

      if (idx % 2 === 1) {
        setRGB(cur, light);
        fillRect(cur, left - 4, y - 10, right - left + 8, 22);
      }

      const qty = `${item.quantity} ${item.unit || item.baseUnit || ""}`.trim();
      setRGB(cur, muted);
      drawText(cur, `${idx + 1}.`, left, y, "F1", 10);
      setRGB(cur, dark);
      drawText(cur, padOrTrim(item.name, 32), left + 18, y, "F1", 11);
      setRGB(cur, mid);
      drawRightText(cur, qty, qtyX, y, "F1", 11);
      drawRightText(cur, formatPdfMoney(Number(item.price || 0)), priceX, y, "F1", 11);
      setRGB(cur, dark);
      drawRightText(cur, formatPdfMoney(Number(item.subtotal || 0)), amtRight, y, "F2", 11);
      setStrokeRGB(cur, "0.878 0.847 0.784");
      drawLine(cur, left, y - 11, right, y - 11, 0.4);
      setStrokeRGB(cur, "0 0 0");
      y -= 26;
    });

    if (y < 140) ({ ops: cur, y } = startPage(false));
    y -= 6;
    setStrokeRGB(cur, gold);
    drawLine(cur, left, y, right, y, 1.2);
    drawLine(cur, left, y - 3, right, y - 3, 0.4);
    setStrokeRGB(cur, "0 0 0");

    y -= 20;
    const summaryBoxHeight = 14 + summaryRows.length * 20;
    setRGB(cur, light);
    fillRect(cur, right - 220, y - summaryBoxHeight + 8, 224, summaryBoxHeight);
    setStrokeRGB(cur, gold);
    strokeRect(cur, right - 220, y - summaryBoxHeight + 8, 224, summaryBoxHeight, 0.6);
    setStrokeRGB(cur, "0 0 0");

    let summaryY = y;
    summaryRows.forEach((row, index) => {
      const isLast = index === summaryRows.length - 1;
      setRGB(cur, row.emphasis ? dark : mid);
      drawText(cur, row.label, right - 214, summaryY, row.emphasis ? "F2" : "F1", row.emphasis ? 12 : 11);
      drawRightText(cur, formatPdfMoney(row.amount), amtRight, summaryY, row.emphasis ? "F2" : "F1", row.emphasis ? 13 : 11);
      if (!isLast) {
        setStrokeRGB(cur, "0.878 0.847 0.784");
        drawLine(cur, right - 214, summaryY - 8, right, summaryY - 8, 0.4);
        setStrokeRGB(cur, "0 0 0");
      }
      summaryY -= 20;
    });

    y -= summaryBoxHeight + 18;

    if (quotation.notes) {
      const noteText = quotation.notes.replace(/\s+/g, " ").trim();
      const noteLines = noteText.match(/.{1,72}(\s|$)/g)?.map((line) => line.trim()).filter(Boolean) || [noteText];
      if (y - (noteLines.length * 14 + 34) < 70) ({ ops: cur, y } = startPage(false));
      setRGB(cur, light);
      fillRect(cur, left - 4, y - (noteLines.length * 14 + 18), right - left + 8, noteLines.length * 14 + 24);
      setStrokeRGB(cur, gold);
      strokeRect(cur, left - 4, y - (noteLines.length * 14 + 18), right - left + 8, noteLines.length * 14 + 24, 0.6);
      setStrokeRGB(cur, "0 0 0");
      setRGB(cur, muted);
      drawText(cur, "NOTES", left, y, "F2", 9);
      setRGB(cur, dark);
      noteLines.forEach((line, index) => {
        drawText(cur, line, left, y - 16 - index * 14, "F1", 10);
      });
      y -= noteLines.length * 14 + 34;
    }

    setStrokeRGB(cur, "0.878 0.847 0.784");
    drawLine(cur, left, y + 10, right, y + 10, 0.5);
    setStrokeRGB(cur, "0 0 0");
    setRGB(cur, muted);
    drawText(cur, "Quotation is subject to change until confirmed.", left, y - 4, "F1", 9);
    setRGB(cur, gold);
    drawRightText(cur, "Thank you!", amtRight, y - 4, "F2", 10);
    setRGB(cur, gold);
    fillRect(cur, 0, 0, pageWidth, 5);

    const objects: string[] = [];
    objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
    objects[3] = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj";
    objects[4] = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj";
    const pageIds: number[] = [];
    let nextId = 5;
    const enc = new TextEncoder();

    pages.forEach((pageOps) => {
      const contentId = nextId;
      const pageId = nextId + 1;
      const stream = pageOps.join("\n");
      const streamBytes = enc.encode(stream).length;
      objects[contentId] = `${contentId} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream\nendobj`;
      objects[pageId] =
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`;
      pageIds.push(pageId);
      nextId += 2;
    });

    objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((pageId) => `${pageId} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj`;

    const maxId = objects.length - 1;
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let index = 1; index <= maxId; index += 1) {
      const object = objects[index];
      if (!object) continue;
      offsets[index] = enc.encode(pdf).length;
      pdf += `${object}\n`;
    }
    const xrefStart = enc.encode(pdf).length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index <= maxId; index += 1) {
      pdf += `${String(offsets[index] || 0).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const blob = new Blob([enc.encode(pdf)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `quotation-${quotation.id}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleConvert = () => {
    convertToBill(id, {
      onSuccess: (result) => {
        toast({ title: "Quotation converted", description: `${formatBillLabel(result.bill)} created successfully.` });
        setConfirmOpen(false);
        setLocation(`/bills/${result.bill.id}`);
      },
      onError: (error: Error) => {
        toast({ title: "Conversion failed", description: error.message, variant: "destructive" });
      },
    });
  };

  const handleStatusChange = (status: "draft" | "sent" | "accepted" | "rejected") => {
    updateStatus(
      { id, status },
      {
        onSuccess: () => {
          toast({ title: "Quotation updated", description: `Status changed to ${status}.` });
        },
        onError: (error: Error) => {
          toast({ title: "Status update failed", description: error.message, variant: "destructive" });
        },
      },
    );
  };

  if (isLoading) return <div className="p-8"><Skeleton className="h-[720px] w-full" /></div>;
  if (!quotation) return <div className="flex items-center justify-center h-64 text-muted-foreground">Quotation not found</div>;

  return (
    <>
      <div className="p-6 md:p-8 max-w-4xl mx-auto pb-24 md:pb-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between print:hidden">
          <Link href="/quotations" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Quotations
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {quotation.status !== "converted" && (
              <Link href={`/quotations/${quotation.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
            )}
            {quotation.status !== "converted" && (
              <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={isConverting}>
                <Repeat className="w-4 h-4 mr-2" />
                {isConverting ? "Converting..." : "Convert to Bill"}
              </Button>
            )}
            <Button variant="outline" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {quotation.status !== "converted" && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {STATUS_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={quotation.status === option.value ? "default" : "outline"}
                onClick={() => handleStatusChange(option.value)}
                disabled={isUpdatingStatus}
                className={cn(
                  quotation.status === option.value && option.value === "sent" && "bg-blue-600 hover:bg-blue-700 text-white",
                  quotation.status === option.value && option.value === "accepted" && "bg-green-600 hover:bg-green-700 text-white",
                  quotation.status === option.value && option.value === "rejected" && "bg-red-600 hover:bg-red-700 text-white",
                )}
              >
                <option.icon className="w-4 h-4 mr-2" />
                {option.label}
              </Button>
            ))}
            {quotation.status !== "draft" && (
              <Button type="button" variant="ghost" onClick={() => handleStatusChange("draft")} disabled={isUpdatingStatus}>
                Reset to Draft
              </Button>
            )}
          </div>
        )}

        <div className="bg-card rounded-2xl border border-border shadow-sm p-8 md:p-10 space-y-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Quotation</p>
              <h1 className="font-display text-3xl font-bold mt-2">Sri Lakshmi Traders</h1>
              <p className="text-sm text-muted-foreground mt-2">Hyderabad, Telangana</p>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quotation No</div>
              <div className="text-2xl font-display font-bold mt-2">#Q{quotation.id}</div>
              <div className="text-sm text-muted-foreground mt-2">Date: {quotation.date ? formatDate(quotation.date, "dd/MM/yyyy") : "-"}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Status: <span className="capitalize">{quotation.status}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 rounded-xl border border-border bg-muted/20 p-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Quoted To</div>
              <div className="mt-2 text-lg font-semibold">{quotation.customer?.name || "Walk-in Customer"}</div>
              {quotation.customer?.phone && <div className="text-sm text-muted-foreground mt-1">{quotation.customer.phone}</div>}
            </div>
            <div className="md:text-right text-sm text-muted-foreground">
              {quotation.lastEditedAt && (
                <div>
                  Last edited on {formatDateTime(quotation.lastEditedAt, "dd MMM yyyy, hh:mm a")}
                  {quotation.lastEditedBy ? ` by ${quotation.lastEditedBy}` : ""}
                </div>
              )}
              {quotation.convertedBillId && <div className="mt-1">Converted to Bill #{quotation.convertedBillId}</div>}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-3 font-semibold">Item</th>
                  <th className="text-center py-3 font-semibold">Qty</th>
                  <th className="text-right py-3 font-semibold">Unit Price</th>
                  <th className="text-right py-3 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, index) => (
                  <tr key={item.id} className="border-b border-border/70 last:border-b-0">
                    <td className="py-3 pr-4">{index + 1}. {item.name}</td>
                    <td className="py-3 text-center">
                      {item.quantity} <span className="text-xs text-muted-foreground">{item.unit || item.baseUnit || ""}</span>
                    </td>
                    <td className="py-3 text-right font-mono">{formatCurrencyINR(Number(item.price || 0))}</td>
                    <td className="py-3 text-right font-mono font-semibold">{formatCurrencyINR(Number(item.subtotal || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-full max-w-sm rounded-xl border border-border bg-muted/20 p-5 space-y-3">
              {summaryRows.map((row, index) => (
                <div key={`${row.label}-${index}`} className="flex items-center justify-between">
                  <span className={row.emphasis ? "font-semibold uppercase tracking-[0.16em] text-muted-foreground" : "text-muted-foreground"}>
                    {row.label}
                  </span>
                  <span className={row.emphasis ? "text-xl font-bold font-mono" : "font-medium font-mono"}>
                    {formatCurrencyINR(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {quotation.notes && (
            <div className="rounded-xl border border-border bg-muted/20 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">Notes</div>
              <p className="text-sm leading-6 whitespace-pre-wrap">{quotation.notes}</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert quotation to bill?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a real bill from this quotation, deduct stock, and update customer ledger. The quotation will be marked as converted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConvert} disabled={isConverting}>
              {isConverting ? "Converting..." : "Convert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
