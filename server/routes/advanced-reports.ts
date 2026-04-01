import type { Express } from "express";
import { z } from "zod";
import { api } from "@shared/routes";
import {
  getAdvancedCashbook,
  getAdvancedOutstanding,
  getAdvancedOverview,
  getAdvancedProfitLoss,
  getAdvancedPurchaseReport,
  getAdvancedSalesReport,
  getAdvancedStockSummary,
  type AdvancedRange,
} from "../services/advanced-report-service";

function parseRange(input: z.infer<typeof api.advancedReports.overview.input>): AdvancedRange {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  endDate.setHours(23, 59, 59, 999);

  return {
    startDate,
    endDate,
    granularity: input.granularity ?? "day",
  };
}

export function registerAdvancedReportRoutes(app: Express) {
  app.get(api.advancedReports.overview.path, async (req, res) => {
    try {
      const input = api.advancedReports.overview.input.parse(req.query);
      res.json(await getAdvancedOverview(parseRange(input)));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0]?.message || "Invalid request" });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.sales.path, async (req, res) => {
    try {
      const input = api.advancedReports.sales.input.parse(req.query);
      res.json(await getAdvancedSalesReport(parseRange(input)));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0]?.message || "Invalid request" });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.purchases.path, async (req, res) => {
    try {
      const input = api.advancedReports.purchases.input.parse(req.query);
      res.json(await getAdvancedPurchaseReport(parseRange(input)));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0]?.message || "Invalid request" });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.profitLoss.path, async (req, res) => {
    try {
      const input = api.advancedReports.profitLoss.input.parse(req.query);
      res.json(await getAdvancedProfitLoss(parseRange(input)));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0]?.message || "Invalid request" });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.outstanding.path, async (_req, res) => {
    try {
      res.json(await getAdvancedOutstanding());
    } catch (err) {
      if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.stockSummary.path, async (_req, res) => {
    try {
      res.json(await getAdvancedStockSummary());
    } catch (err) {
      if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get(api.advancedReports.cashbook.path, async (req, res) => {
    try {
      const input = api.advancedReports.cashbook.input.parse(req.query);
      res.json(await getAdvancedCashbook(parseRange(input)));
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ message: err.errors[0]?.message || "Invalid request" });
      } else if (err instanceof Error) {
        res.status(400).json({ message: err.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });
}
