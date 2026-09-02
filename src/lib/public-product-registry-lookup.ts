import 'server-only';

import {
  resolveMultiChannelSearch,
  type SmartSearchResult,
} from '@/lib/fda-smart-resolver';
import type { ProductScanResult } from '@/lib/public-product-scan-contract';

export type ProductRegistryLookup = {
  performed: boolean;
  query: string | null;
  queryType: 'FDA_NUMBER' | 'BARCODE' | 'PRODUCT_NAME' | 'NONE';
  status: 'MATCHED' | 'NOT_FOUND' | 'UNAVAILABLE' | 'SKIPPED';
  summary: string;
  results: SmartSearchResult[];
};

type RegistryResolver = typeof resolveMultiChannelSearch;

function selectLookupQuery(result: ProductScanResult) {
  const fdaNumber = result.identifiers.find((item) => item.type === 'FDA_NUMBER')?.value.trim();
  if (fdaNumber) return { query: fdaNumber.slice(0, 200), queryType: 'FDA_NUMBER' as const };
  const barcode = result.identifiers.find((item) => item.type === 'BARCODE')?.value.trim();
  if (barcode) return { query: barcode.slice(0, 200), queryType: 'BARCODE' as const };
  const productName = result.productName?.trim();
  if (productName && productName.length >= 2) return { query: productName.slice(0, 200), queryType: 'PRODUCT_NAME' as const };
  return null;
}
export async function lookupProductRegistration(
  result: ProductScanResult,
  resolver: RegistryResolver = resolveMultiChannelSearch,
): Promise<ProductRegistryLookup> {
  const selected = selectLookupQuery(result);
  if (!selected) {
    return {
      performed: false,
      query: null,
      queryType: 'NONE',
      status: 'SKIPPED',
      summary: 'ยังไม่พบเลขทะเบียน บาร์โค้ด หรือชื่อผลิตภัณฑ์ที่ชัดพอสำหรับค้นทะเบียนอัตโนมัติ',
      results: [],
    };
  }

  try {
    const results = (await resolver(selected.query, { category: 'HEALTH_PRODUCTS' })).slice(0, 5);
    const matched = results.filter((item) => ['SAFE', 'WARNING', 'REVOKED'].includes(item.status));
    if (matched.length > 0) {
      return {
        performed: true,
        ...selected,
        status: 'MATCHED',
        summary: selected.queryType === 'PRODUCT_NAME'
          ? `พบ ${matched.length} รายการที่อาจตรงกับชื่อผลิตภัณฑ์จากแหล่งข้อมูลทางการ กรุณาเทียบเลขทะเบียนและผู้รับอนุญาตกับฉลาก`
          : `พบ ${matched.length} รายการจากแหล่งข้อมูลทางการที่ตรงกับข้อมูลซึ่งอ่านได้จากภาพ`,
        results,
      };
    }
    if (results.some((item) => item.status === 'UNAVAILABLE')) {
      return {
        performed: true,
        ...selected,
        status: 'UNAVAILABLE',
        summary: 'แหล่งข้อมูลทะเบียนไม่ตอบกลับในขณะนี้ ระบบไม่ได้ตีความว่าไม่พบทะเบียน กรุณาลองใหม่ภายหลัง',
        results,
      };
    }
    return {
      performed: true,
      ...selected,
      status: 'NOT_FOUND',
      summary: 'ยังไม่พบรายการที่ตรงกันจากแหล่งข้อมูลทางการ การไม่พบข้อมูลไม่ใช่ข้อสรุปว่าสินค้าไม่มีทะเบียน',
      results,
    };
  } catch {
    return {
      performed: true,
      ...selected,
      status: 'UNAVAILABLE',
      summary: 'ตรวจทะเบียนอัตโนมัติไม่สำเร็จในขณะนี้ ผลวิเคราะห์ภาพยังใช้งานได้ และสามารถลองค้นด้วยตนเองอีกครั้ง',
      results: [],
    };
  }
}
