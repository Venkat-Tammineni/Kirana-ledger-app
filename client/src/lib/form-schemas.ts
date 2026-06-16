import { z } from "zod";
import { UNIT_OPTIONS } from "@shared/units";

export const customerFormSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z.string().trim().min(7, "Phone must be at least 7 digits"),
});

export const productFormSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters"),
  price: z.coerce.number().min(0, "Selling price cannot be negative"),
  costPrice: z.coerce.number().min(0, "Cost price cannot be negative").default(0),
  primaryUnit: z.enum(UNIT_OPTIONS),
  secondaryUnit: z.enum(UNIT_OPTIONS).nullable().optional(),
  unitConversion: z.coerce.number().int().min(2, "Conversion must be at least 2").nullable().optional(),
  sku: z.string().trim().optional(),
  stock: z.coerce.number().min(0, "Stock cannot be negative").default(0),
  lowStockThreshold: z.coerce.number().min(0, "Threshold cannot be negative").default(10),
}).superRefine((value, ctx) => {
  if (value.secondaryUnit && value.secondaryUnit === value.primaryUnit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Primary and secondary units must be different",
      path: ["secondaryUnit"],
    });
  }

  if (value.secondaryUnit && !value.unitConversion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Conversion is required when secondary unit is enabled",
      path: ["unitConversion"],
    });
  }
});

export type CustomerFormInput = z.infer<typeof customerFormSchema>;
export type ProductFormInput = z.infer<typeof productFormSchema>;
