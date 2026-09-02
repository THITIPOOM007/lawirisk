import { z } from 'zod';

export const productScanResultSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  productName: z.string().trim().max(180).nullable(),
  brand: z.string().trim().max(120).nullable(),
  productCategory: z.string().trim().max(120).nullable(),
  visibleText: z.array(z.string().trim().min(1).max(180)).max(12),
  identifiers: z.array(z.object({
    type: z.enum(['FDA_NUMBER', 'LOT', 'BARCODE', 'EXPIRY_DATE', 'OTHER']),
    value: z.string().trim().min(1).max(120),
  })).max(12),
  generalInformation: z.array(z.string().trim().min(1).max(260)).max(8),
  concernLevel: z.enum(['LOW', 'REVIEW', 'HIGH', 'UNDETERMINED']),
  concernSignals: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    detail: z.string().trim().min(1).max(280),
    evidence: z.string().trim().max(180).nullable(),
  })).max(8),
  positiveSignals: z.array(z.string().trim().min(1).max(220)).max(6),
  recommendedActions: z.array(z.string().trim().min(1).max(220)).min(1).max(6),
  confidence: z.number().min(0).max(1),
  limitations: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
});

export type ProductScanResult = z.infer<typeof productScanResultSchema>;

export const PRODUCT_SCAN_PROMPT_SCHEMA_VERSION = 'public-product-scan-v1' as const;
