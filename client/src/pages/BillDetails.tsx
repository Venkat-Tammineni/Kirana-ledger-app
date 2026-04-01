import { useBill } from "@/hooks/use-pos";
import { useRoute } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowLeft, Download, Pencil, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrencyINR, formatDate, formatDateTime } from "@/lib/format";

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatPdfMoney(value: number) {
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function padOrTrim(value: string, max = 28) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function estimatePdfTextWidth(text: string, size: number, font = "F1") {
  const factor = font === "F3" ? 0.6 : 0.52;
  return text.length * size * factor;
}

export default function BillDetails() {
  const [, params] = useRoute("/bills/:id");
  const id = Number(params?.id);
  const { data: bill, isLoading } = useBill(id);
  const summaryRows = bill
    ? [
        { label: "This Bill Total", amount: Number(bill.subtotalAmount || bill.totalAmount || 0), emphasis: false },
        ...(bill.charges || []).map((charge) => ({
          label: charge.label,
          amount: Number(charge.amount || 0),
          emphasis: false,
        })),
        ...(Number(bill.extraChargesTotal || 0) > 0
          ? [{ label: "Bill Total", amount: Number(bill.totalAmount || 0), emphasis: false }]
          : []),
        { label: "Old Balance", amount: Number(bill.oldBalanceAmount || 0), emphasis: false },
        { label: "Grand Total", amount: Number(bill.grandTotal || bill.totalAmount || 0), emphasis: true },
      ]
    : [];

  const handleDownload = () => {
    if (!bill) return;

    // ── Page constants ──────────────────────────────────────────────
    const pageWidth  = 595;
    const pageHeight = 842;
    const left       = 48;
    const right      = 547;
    const centerX    = pageWidth / 2;
    const qtyX       = 305;
    const priceX     = 420;
    const amtRight   = right - 4;

    // Gold colour (approximated in PDF DeviceRGB)
    const gold   = "0.788 0.659 0.298";   // #c9a84c
    const dark   = "0.165 0.125 0.047";   // #2a2018
    const mid    = "0.361 0.290 0.165";   // #5c4a2a
    const muted  = "0.545 0.451 0.333";   // #8b7355
    const light  = "0.969 0.949 0.910";   // #f7f2e8  (row-alt bg)

    const pages: string[][] = [];

    // ── Helpers ─────────────────────────────────────────────────────
    const setRGB = (ops: string[], r: string) => ops.push(`${r} rg`);
    const setStrokeRGB = (ops: string[], r: string) => ops.push(`${r} RG`);

    const drawText = (
      ops: string[], text: string, x: number, y: number,
      font = "F1", size = 12
    ) => {
      ops.push("BT");
      ops.push(`/${font} ${size} Tf`);
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
      ops.push(`(${escapePdfText(text)}) Tj`);
      ops.push("ET");
    };

    const drawCenteredText = (
      ops: string[], text: string, x: number, y: number,
      font = "F1", size = 12
    ) => drawText(ops, text, x - estimatePdfTextWidth(text, size, font) / 2, y, font, size);

    const drawRightText = (
      ops: string[], text: string, x: number, y: number,
      font = "F1", size = 12
    ) => drawText(ops, text, x - estimatePdfTextWidth(text, size, font), y, font, size);

    const drawLine = (
      ops: string[], x1: number, y1: number, x2: number, y2: number,
      width = 0.5
    ) => {
      ops.push(`${width} w`);
      ops.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    };

    // Filled rectangle (uses current fill colour)
    const fillRect = (ops: string[], x: number, y: number, w: number, h: number) => {
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    };

    // Stroked rectangle
    const strokeRect = (ops: string[], x: number, y: number, w: number, h: number, lw = 0.5) => {
      ops.push(`${lw} w`);
      ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
    };

    // Small diamond ornament
    const drawDiamond = (ops: string[], cx: number, cy: number, r = 3) => {
      ops.push(`${cx.toFixed(2)} ${(cy + r).toFixed(2)} m`);
      ops.push(`${(cx + r).toFixed(2)} ${cy.toFixed(2)} l`);
      ops.push(`${cx.toFixed(2)} ${(cy - r).toFixed(2)} l`);
      ops.push(`${(cx - r).toFixed(2)} ${cy.toFixed(2)} l`);
      ops.push("h f");
    };

    // Ornamental divider: line — ◆ — line
    const drawOrnament = (ops: string[], y: number) => {
      setRGB(ops, gold);
      setStrokeRGB(ops, gold);
      drawLine(ops, left, y, centerX - 20, y, 0.6);
      drawLine(ops, centerX + 20, y, right, y, 0.6);
      drawDiamond(ops, centerX - 10, y);
      drawDiamond(ops, centerX,      y);
      drawDiamond(ops, centerX + 10, y);
      setRGB(ops, dark);
      setStrokeRGB(ops, "0 0 0");
    };

    // Table header row
    const drawTableHeader = (ops: string[], y: number) => {
      // header background
      setRGB(ops, "0.961 0.941 0.898");   // #f5f0e5
      fillRect(ops, left - 4, y - 10, right - left + 8, 22);
      setRGB(ops, muted);
      drawText(ops,      "ITEM",       left,     y, "F2", 9);
      drawRightText(ops, "QTY",        qtyX,     y, "F2", 9);
      drawRightText(ops, "UNIT PRICE", priceX,   y, "F2", 9);
      drawRightText(ops, "AMOUNT",     amtRight, y, "F2", 9);
      setRGB(ops, dark);
      setStrokeRGB(ops, gold);
      drawLine(ops, left, y - 12, right, y - 12, 1);
      setStrokeRGB(ops, "0 0 0");
    };

    // ── Page factory ────────────────────────────────────────────────
    const startPage = (isFirst: boolean): { ops: string[]; y: number } => {
      const ops: string[] = [];
      pages.push(ops);

      // Default colours
      setRGB(ops, dark);
      setStrokeRGB(ops, "0 0 0");

      // Gold top bar
      setRGB(ops, gold);
      fillRect(ops, 0, pageHeight - 6, pageWidth, 6);

      if (isFirst) {
        // ── Store name ──
        setRGB(ops, dark);
        drawCenteredText(ops, "SRI LAKSHMI TRADERS", centerX, 800, "F2", 22);

        // ornament below name
        drawOrnament(ops, 786);

        // address / phone
        setRGB(ops, muted);
        drawCenteredText(ops, "Hyderabad, Telangana", centerX, 772, "F1", 10);
        drawCenteredText(ops, "Phone: 9550260069, 7981695206",   centerX, 758, "F1", 10);

        // ornament below address
        drawOrnament(ops, 744);

        // ── Meta box ──
        setRGB(ops, light);
        fillRect(ops, left - 4, 685, right - left + 8, 52);
        setStrokeRGB(ops, gold);
        strokeRect(ops, left - 4, 685, right - left + 8, 52, 0.6);
        setStrokeRGB(ops, "0 0 0");

        setRGB(ops, muted);
        drawText(ops, "BILLED TO", left, 727, "F1", 8);
        setRGB(ops, dark);
        drawText(ops, bill.customer?.name || "Walk-in Customer", left, 713, "F2", 13);
        if (bill.customer?.phone) {
          setRGB(ops, mid);
          drawText(ops, bill.customer.phone, left, 699, "F1", 10);
        }

        setRGB(ops, muted);
        drawRightText(ops, "INVOICE", right, 727, "F1", 8);
        setRGB(ops, gold);
        drawRightText(ops, `#${bill.id}`, right, 713, "F2", 13);
        setRGB(ops, mid);
        const dateStr = bill.date ? formatDate(bill.date, "dd/MM/yyyy") : "-";
        drawRightText(ops, dateStr, right, 699, "F1", 10);

        setRGB(ops, dark);
        drawTableHeader(ops, 668);
        return { ops, y: 642 };
      }

      // ── Continuation header ──
      setRGB(ops, dark);
      drawCenteredText(ops, "SRI LAKSHMI TRADERS", centerX, 800, "F2", 14);
      setRGB(ops, muted);
      drawRightText(ops, `#${bill.id}`, right, 782, "F1", 10);
      drawRightText(ops, bill.date ? formatDate(bill.date, "dd/MM/yyyy") : "-", right, 770, "F1", 10);
      drawOrnament(ops, 758);
      setRGB(ops, dark);
      drawTableHeader(ops, 738);
      return { ops, y: 712 };
    };

    // ── Render items ─────────────────────────────────────────────────
    let { ops: cur, y } = startPage(true);

    bill.items.forEach((item, idx) => {
      if (y < 130) ({ ops: cur, y } = startPage(false));

      // Alternate row background
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
      drawRightText(cur, qty,                                       qtyX,     y, "F1", 11);
      drawRightText(cur, formatPdfMoney(Number(item.price || 0)),   priceX,   y, "F1", 11);

      setRGB(cur, dark);
      drawRightText(cur, formatPdfMoney(Number(item.subtotal || 0)), amtRight, y, "F2", 11);

      setStrokeRGB(cur, "0.878 0.847 0.784");   // #e0d8c8
      drawLine(cur, left, y - 11, right, y - 11, 0.4);
      setStrokeRGB(cur, "0 0 0");

      y -= 26;
    });

    // ── Total section ────────────────────────────────────────────────
    if (y < 130) ({ ops: cur, y } = startPage(false));

    y -= 6;

    // Gold double-line above total
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
      drawRightText(
        cur,
        formatPdfMoney(row.amount),
        amtRight,
        summaryY,
        row.emphasis ? "F2" : "F1",
        row.emphasis ? 13 : 11,
      );
      if (!isLast) {
        setStrokeRGB(cur, "0.878 0.847 0.784");
        drawLine(cur, right - 214, summaryY - 8, right, summaryY - 8, 0.4);
        setStrokeRGB(cur, "0 0 0");
      }
      summaryY -= 20;
    });

    y -= summaryBoxHeight + 14;

    // ── Footer ───────────────────────────────────────────────────────
    setStrokeRGB(cur, "0.878 0.847 0.784");
    drawLine(cur, left, y + 10, right, y + 10, 0.5);
    setStrokeRGB(cur, "0 0 0");

    setRGB(cur, muted);
    drawText(cur, "Goods once sold will not be taken back.", left, y - 4, "F1", 9);
    setRGB(cur, gold);
    drawRightText(cur, "Thank you for your business!", amtRight, y - 4, "F2", 10);

    // Gold bottom bar
    setRGB(cur, gold);
    fillRect(cur, 0, 0, pageWidth, 5);

    // ── Build PDF objects ────────────────────────────────────────────
    const objects: string[] = [];
    objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj";
    objects[3] = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj";
    objects[4] = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj";
    objects[5] = "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj";

    const pageIds: number[] = [];
    let nextId = 6;

    const enc = new TextEncoder();

    pages.forEach((pageOps) => {
      const contentId = nextId;
      const pageId    = nextId + 1;
      const stream    = pageOps.join("\n");
      const streamBytes = enc.encode(stream).length;
      objects[contentId] =
        `${contentId} 0 obj\n<< /Length ${streamBytes} >>\nstream\n${stream}\nendstream\nendobj`;
      objects[pageId] =
        `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`;
      pageIds.push(pageId);
      nextId += 2;
    });

    objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj`;

    const maxId = objects.length - 1;
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let i = 1; i <= maxId; i++) {
      const obj = objects[i];
      if (!obj) continue;
      offsets[i] = enc.encode(pdf).length;
      pdf += `${obj}\n`;
    }
    const xrefStart = enc.encode(pdf).length;
    pdf += `xref\n0 ${maxId + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= maxId; i++)
      pdf += `${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const pdfBytes = enc.encode(pdf);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `bill-${bill.id}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return (
    <div className="p-8 max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-[600px] w-full rounded-2xl" />
    </div>
  );
  if (!bill) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      Bill not found
    </div>
  );

  return (
    <>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=DM+Sans:wght@300;400;500;600&display=swap');

        .bill-root {
          font-family: 'DM Sans', sans-serif;
        }

        .bill-display-font {
          font-family: 'Playfair Display', serif;
        }

        .bill-paper {
          background: #fffdf8;
          border: 1px solid #e8e0d0;
          box-shadow:
            0 1px 2px rgba(0,0,0,0.04),
            0 4px 16px rgba(0,0,0,0.06),
            0 24px 48px rgba(0,0,0,0.08);
          position: relative;
          overflow: hidden;
        }

        .bill-paper::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(90deg, #c9a84c 0%, #e8c97a 40%, #c9a84c 100%);
        }

        .bill-paper::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, #c9a84c 0%, #e8c97a 40%, #c9a84c 100%);
        }

        .bill-header-ornament {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 0 auto 8px;
          width: fit-content;
        }

        .bill-ornament-line {
          height: 1px;
          width: 60px;
          background: linear-gradient(90deg, transparent, #c9a84c);
        }

        .bill-ornament-line.right {
          background: linear-gradient(90deg, #c9a84c, transparent);
        }

        .bill-ornament-diamond {
          width: 6px;
          height: 6px;
          background: #c9a84c;
          transform: rotate(45deg);
          flex-shrink: 0;
        }

        .bill-divider {
          border: none;
          border-top: 1px solid #e0d5c0;
          margin: 0;
          position: relative;
        }

        .bill-divider-double {
          border: none;
          border-top: 2px double #c9a84c;
          margin: 0;
        }

        .bill-table th {
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8b7355;
          padding: 10px 0 10px;
          border-bottom: 1.5px solid #d4c5a9;
        }

        .bill-table td {
          padding: 13px 0;
          font-size: 14px;
          color: #2a2018;
          border-bottom: 1px solid #efe7d6;
        }

        .bill-table tr:last-child td {
          border-bottom: none;
        }

        .bill-table tr:hover td {
          background: rgba(201, 168, 76, 0.04);
        }

        .bill-badge {
          display: inline-block;
          background: linear-gradient(135deg, #c9a84c22, #e8c97a11);
          border: 1px solid #c9a84c55;
          color: #9a7a2e;
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
          padding: 3px 10px;
          border-radius: 4px;
        }

        .bill-total-section {
          background: linear-gradient(135deg, #fdf6e3 0%, #fffdf8 100%);
          border: 1px solid #d4c5a9;
          border-radius: 12px;
          padding: 20px 24px;
        }

        .bill-action-btn {
          font-family: 'DM Sans', sans-serif;
          font-weight: 500;
          font-size: 13px;
          letter-spacing: 0.02em;
          transition: all 0.2s ease;
        }

        .bill-action-btn:hover {
          background: #2a2018;
          color: #fffdf8;
          border-color: #2a2018;
        }

        .bill-watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-30deg);
          font-family: 'Playfair Display', serif;
          font-size: 120px;
          font-weight: 700;
          color: rgba(201,168,76,0.04);
          pointer-events: none;
          letter-spacing: -4px;
          white-space: nowrap;
          user-select: none;
          z-index: 0;
        }

        .bill-content {
          position: relative;
          z-index: 1;
        }

        .bill-item-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #f0e8d6;
          color: #8b7355;
          font-size: 10px;
          font-weight: 600;
          margin-right: 8px;
          flex-shrink: 0;
        }

        @media print {
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="bill-root p-6 md:p-8 max-w-3xl mx-auto space-y-5 pb-24 md:pb-8">

        {/* Top nav */}
        <div className="flex justify-between items-center print:hidden">
          <Link
            href="/bills"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Bills
          </Link>
          <div className="flex items-center gap-2">
            {bill.status === "completed" && (
              <Link href={`/bills/${bill.id}/edit`}>
                <Button variant="outline" className="bill-action-btn h-9 px-4 rounded-lg border-stone-300">
                  <Pencil className="w-3.5 h-3.5 mr-2" />
                  Edit
                </Button>
              </Link>
            )}
            <Button variant="outline" onClick={handleDownload} className="bill-action-btn h-9 px-4 rounded-lg border-stone-300">
              <Download className="w-3.5 h-3.5 mr-2" />
              Download
            </Button>
            <Button variant="outline" onClick={() => window.print()} className="bill-action-btn h-9 px-4 rounded-lg border-stone-300">
              <Printer className="w-3.5 h-3.5 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Bill Paper */}
        <div className="bill-paper rounded-2xl px-8 pt-10 pb-10 md:px-12">

          {/* Watermark */}
          <div className="bill-watermark">PAID</div>

          <div className="bill-content">

            {/* ── Header ── */}
            <div className="text-center mb-7">
              <div className="bill-header-ornament">
                <div className="bill-ornament-line"></div>
                <div className="bill-ornament-diamond"></div>
                <div className="bill-ornament-diamond" style={{width:4,height:4,opacity:0.5}}></div>
                <div className="bill-ornament-diamond"></div>
                <div className="bill-ornament-line right"></div>
              </div>

              <h1
                className="bill-display-font text-3xl font-bold tracking-wide uppercase mb-1"
                style={{ color: "#2a2018", letterSpacing: "0.06em" }}
              >
                Sri Lakshmi Traders
              </h1>

              <p className="text-sm font-light" style={{ color: "#8b7355", letterSpacing: "0.03em" }}>
                Hyderabad, Telangana
              </p>
              <p className="text-sm" style={{ color: "#8b7355" }}>
                Phone: <span className="font-medium" style={{ color: "#5c4a2a" }}>9550260069, 7981695206</span>
              </p>

              <div className="bill-header-ornament mt-5">
                <div className="bill-ornament-line"></div>
                <div className="bill-ornament-diamond" style={{width:4,height:4,opacity:0.5}}></div>
                <div className="bill-ornament-diamond"></div>
                <div className="bill-ornament-diamond" style={{width:4,height:4,opacity:0.5}}></div>
                <div className="bill-ornament-line right"></div>
              </div>
            </div>

            {/* ── Meta row ── */}
            <div
              className="flex justify-between items-start mb-8 px-5 py-4 rounded-xl"
              style={{ background: "linear-gradient(135deg, #fdf6e3, #fffdf8)", border: "1px solid #e8dcc8" }}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#b8a070" }}>
                  Billed To
                </p>
                <p
                  className="bill-display-font text-lg font-semibold"
                  style={{ color: "#2a2018" }}
                >
                  {bill.customer?.name || "Walk-in Customer"}
                </p>
                {bill.customer?.phone && (
                  <p className="text-sm mt-0.5" style={{ color: "#7a6040" }}>
                    {bill.customer.phone}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#b8a070" }}>
                    Invoice
                  </span>
                  <div className="bill-badge mt-1">#{bill.id}</div>
                </div>
                <p className="text-sm mt-2" style={{ color: "#7a6040" }}>
                  <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: "#b8a070" }}>Date </span>
                  {bill.date ? formatDate(bill.date, "dd/MM/yyyy") : "—"}
                </p>
                {bill.lastEditedAt && (
                  <p className="text-xs mt-2 max-w-[260px]" style={{ color: "#8b7355" }}>
                    Last edited on {formatDateTime(bill.lastEditedAt, "dd MMM yyyy, hh:mm a")}
                    {bill.lastEditedBy ? ` by ${bill.lastEditedBy}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* ── Table ── */}
            <table className="bill-table w-full mb-6">
              <thead>
                <tr>
                  <th className="text-left w-1/2">Item</th>
                  <th className="text-center w-1/6">Qty</th>
                  <th className="text-right w-1/6">Unit Price</th>
                  <th className="text-right w-1/6">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="flex items-center">
                        <span className="bill-item-num">{idx + 1}</span>
                        <span className="font-medium" style={{ color: "#2a2018" }}>{item.name}</span>
                      </div>
                    </td>
                    <td className="text-center" style={{ color: "#5c4a2a" }}>
                      {item.quantity}{" "}
                      <span className="text-xs" style={{ color: "#8b7355" }}>
                        {item.unit || item.baseUnit || ""}
                      </span>
                    </td>
                    <td className="text-right" style={{ color: "#5c4a2a" }}>
                      {formatCurrencyINR(Number(item.price || 0))}
                    </td>
                    <td className="text-right font-semibold" style={{ color: "#2a2018", fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrencyINR(Number(item.subtotal || 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Total ── */}
            <div className="flex justify-end mb-6">
              <div className="bill-total-section w-full max-w-xs">
                <div className="space-y-3">
                {summaryRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex justify-between items-center">
                    <span
                      className={row.emphasis ? "text-sm font-semibold uppercase tracking-widest" : "text-sm"}
                      style={{ color: row.emphasis ? "#8b7355" : "#5c4a2a", fontFamily: "'DM Sans', sans-serif" }}
                    >
                      {row.label}
                    </span>
                    <span
                      className={row.emphasis ? "text-xl font-bold" : "font-medium"}
                      style={{
                        color: "#2a2018",
                        fontFamily: "'DM Sans', sans-serif",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {formatCurrencyINR(row.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

            {/* ── Footer ── */}
            <div style={{ borderTop: "1px dashed #d4c5a9", paddingTop: "20px" }}>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: "#b8a070" }}>
                    Terms
                  </p>
                  <p className="text-xs" style={{ color: "#9a8060" }}>
                    Goods once sold will not be taken back.
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className="bill-display-font text-lg font-semibold italic"
                    style={{ color: "#c9a84c" }}
                  >
                    Thank you!
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#b8a070", letterSpacing: "0.04em" }}>
                    Sri Lakshmi Traders
                  </p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
