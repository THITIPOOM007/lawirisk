import { describe, expect, it, vi } from 'vitest';
import {
  buildOfficialFdaQueryVariants,
  mapTrustedSourceRows,
  resolveMultiChannelSearch,
  searchOfficialFdaProducts,
  searchOfficialHssClinics,
  searchOfficialHssSpaBusinesses,
} from './fda-smart-resolver';

vi.mock('server-only', () => ({}));

describe('FDA public search fallback', () => {
  it.each([
    ['2A972/29', ['2A 972/29', '2A972/29']],
    ['2A 972/29', ['2A 972/29', '2A972/29']],
    ['2 A 972 / 29', ['2A 972/29', '2A972/29']],
    ['２ａ９７２／２９', ['2A 972/29', '2A972/29']],
  ])('normalizes equivalent FDA drug-registration spacing for %s', (query, expected) => {
    expect(buildOfficialFdaQueryVariants(query)).toEqual(expected);
  });

  it('keeps ordinary product-name searches exact instead of widening them', () => {
    expect(buildOfficialFdaQueryVariants('ยาแก้ไอเด็ก บี.เอ็ม.')).toEqual(['ยาแก้ไอเด็ก บี.เอ็ม.']);
  });

  it('treats a plausible registration number as unverified guidance', async () => {
    const [result] = await resolveMultiChannelSearch('10-1-6500012345', false);
    expect(result.category).toBe('HEALTH_PRODUCTS');
    expect(result.status).toBe('UNREGISTERED');
    expect(result.confidenceScore).toBe(0);
    expect(result.productCategoryLabel).toContain('ไม่ใช่ผลรับรอง');
  });

  it('classifies an advertisement-license-shaped query without claiming validity', async () => {
    const [result] = await resolveMultiChannelSearch('ฆพ. 1234/2565', false);
    expect(result.category).toBe('LICENSES');
    expect(result.status).toBe('UNREGISTERED');
  });

  it('classifies a company query without fabricating a registry match', async () => {
    const [result] = await resolveMultiChannelSearch('บริษัท ตัวอย่าง', false);
    expect(result.category).toBe('COMPANIES');
    expect(result.status).toBe('UNREGISTERED');
    expect(result.snippet).toContain('ยังไม่ได้ยืนยัน');
  });

  it('does not turn suspicious marketing text into an official finding', async () => {
    const [result] = await resolveMultiChannelSearch('อาหารเสริม ลดน้ำหนัก ทันใจ', false);
    expect(result.status).toBe('UNREGISTERED');
    expect(result.confidenceScore).toBe(0);
  });

  it('does not return a hard-coded product record for a generic term', async () => {
    const [result] = await resolveMultiChannelSearch('พาราเซตามอล', false);
    expect(result.id).toContain('unverified-');
    expect(result.sourceUrl).toMatch(/^https:\/\//);
  });

  it('accepts only complete HTTPS registry rows', () => {
    const rows = mapTrustedSourceRows([
      {
        id: 'official-1', title: 'ประกาศทางการ', category: 'FRAUD_ALERTS',
        product_category_label: 'ประกาศเตือนภัย', snippet: 'รายละเอียดที่ตรวจสอบได้',
        source: 'หน่วยงานรัฐ', source_url: 'https://example.go.th/notices/1',
        published_date: '2569-08-01', status: 'WARNING',
      },
      {
        id: 'unsafe-1', title: 'ไม่ควรผ่าน', category: 'FRAUD_ALERTS',
        snippet: 'ไม่มี HTTPS', source: 'unknown', source_url: 'http://example.test',
        published_date: '2569-08-01', status: 'WARNING',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'official-1', confidenceScore: 1 });
  });

  it('maps a live FDA product response to explicit registry fields', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([{
      IDA: '2359067',
      typepro: 'อาหาร (สบ.5/สบ.7)',
      lcnno: '74-2-01859-6-0457',
      productha: 'มิกซ์นัทอบไม่ใส่เกลือ (ตรา นัท วอล์คเกอร์)',
      produceng: 'NATURAL TOASTED & UNSALTED MIXED NUTS',
      licen: 'บริษัท เฮอริเทจ สแน็ค แอนด์ ฟู้ด จำกัด',
      Newcode: 'U1FE00074117420185960457C',
      cncnm: 'สถานะผลิตภัณฑ์(คงอยู่)\\ สถานะสถานที่ (คงอยู่)',
      Addr: 'จังหวัดสมุทรสาคร',
      URLs_NEW: 'https://porta.fda.moph.go.th/FDA_SEARCH_ALL/PRODUCT/FRM_PRODUCT_FOOD.aspx?fdpdtno=7420185960457',
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const [result] = await searchOfficialFdaProducts(
      '7420185960457',
      fetchImpl,
      () => new Date('2026-08-31T02:09:00.000Z'),
    );

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      category: 'HEALTH_PRODUCTS',
      status: 'SAFE',
      source: 'ศูนย์ตรวจสอบการอนุญาต อย.',
      metadata: {
        'เลขใบสำคัญ/ใบอนุญาต': '74-2-01859-6-0457',
        'ผู้รับอนุญาต': 'บริษัท เฮอริเทจ สแน็ค แอนด์ ฟู้ด จำกัด',
      },
    });
    expect(result.title).toContain('นัท วอล์คเกอร์');
    expect(result.sourceUrl).toContain('fdpdtno=7420185960457');
  });

  it('finds 2A972/29 by submitting the canonical spaced form automatically', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as FormData;
      expect(body.get('search_input')).toBe('2A 972/29');
      return new Response(JSON.stringify([{
        IDA: 'drug-2a972', typepro: 'ยาสำเร็จรูป', lcnno: '2A972/29',
        productha: 'ยาแก้ไอเด็ก บี.เอ็ม.', produceng: 'B.M. BABY COUGH SYRUP',
        licen: 'บริษัท บี.เอ็ม.ฟาร์มาซี จำกัด', Newcode: 'U1DR2A1022290097211C',
        cncnm: 'สถานะผลิตภัณฑ์(คงอยู่)', URLs_NEW: 'https://porta.fda.moph.go.th/fda_search_center_new/',
      }]), { status: 200 });
    });

    const [result] = await searchOfficialFdaProducts('2A972/29', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      title: 'ยาแก้ไอเด็ก บี.เอ็ม.', status: 'SAFE',
      metadata: {
        'เลขใบสำคัญ/ใบอนุญาต': '2A972/29',
        'คำค้นที่ผู้ใช้กรอก': '2A972/29',
        'รูปแบบคำค้นที่ส่งให้ อย.': '2A 972/29',
        'ปรับรูปแบบอัตโนมัติ': 'ใช่',
      },
    });
  });

  it('falls back to the compact equivalent when an FDA contract expects it', async () => {
    const submitted: string[] = [];
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const query = String((init?.body as FormData).get('search_input'));
      submitted.push(query);
      if (query === '2A 972/29') return new Response('[]', { status: 200 });
      return new Response(JSON.stringify([{
        IDA: 'drug-compact', typepro: 'ยาสำเร็จรูป', lcnno: '2A972/29',
        productha: 'ยาแก้ไอเด็ก บี.เอ็ม.', licen: 'บริษัท บี.เอ็ม.ฟาร์มาซี จำกัด',
        Newcode: 'U1DR2A1022290097211C', cncnm: 'คงอยู่',
        URLs_NEW: 'https://porta.fda.moph.go.th/fda_search_center_new/',
      }]), { status: 200 });
    });

    const [result] = await searchOfficialFdaProducts('2 A 972 / 29', fetchImpl);

    expect(submitted).toEqual(['2A 972/29', '2A972/29']);
    expect(result.status).toBe('SAFE');
    expect(result.metadata?.['รูปแบบคำค้นที่ส่งให้ อย.']).toBe('2A972/29');
  });

  it('routes massage businesses to the public HSS registry and maps status', async () => {
    const rsc = [
      '0:{"a":"$@1"}',
      '1:{"found":true,"query":{"mode":"name","text":"สวัสดี"},"results":[{"doName":"กรมสนับสนุนบริการสุขภาพ","shop":{"memberID":"100200110-61","shopType":"นวดเพื่อสุขภาพ","nameThai":"บ้านสวัสดี นวดเพื่อสุขภาพ","nameEng":"-","status":7,"statusText":"ได้รับอนุญาต","addressText":"กรุงเทพมหานคร","provName":"กรุงเทพมหานคร","shopArea":"80"}}]}',
    ].join('\n');
    const fetchImpl = vi.fn(async () => new Response(rsc, {
      status: 200,
      headers: { 'Content-Type': 'text/x-component' },
    }));

    const [result] = await searchOfficialHssSpaBusinesses(
      'สวัสดี นวดเพื่อสุขภาพ',
      fetchImpl,
      () => new Date('2026-08-31T02:09:00.000Z'),
    );

    expect(result).toMatchObject({
      category: 'MASSAGE_SPA',
      status: 'SAFE',
      source: 'กรมสนับสนุนบริการสุขภาพ (สบส.)',
      metadata: { 'เลขที่ใบอนุญาต': '100200110-61' },
    });
  });

  it('maps clinic names from the new hosp.hss.moph.go.th registry', async () => {
    const cardHtml = `
      <div class="testimonial-card11-text1-12">ชื่อสถานพยาบาล :</div>
      <div class="testimonial-card11-text1-13"> แวคทูโฮมคลินิกเวชกรรม</div>
      <div class="testimonial-card11-text1-16">สถานที่ตั้ง :</div>
      <div class="testimonial-card11-text1-17"> 42 ชั้น 1 เพชรเกษม 80 แยก 2 บางแค กรุงเทพมหานคร 10160</div>
      <div class="testimonial-card11-text1-1">เลขที่ใบอนุญาตประกอบกิจการ :</div>
      <div class="testimonial-card11-text1-11"> 10101012369</div>
      <div class="testimonial-card11-text1-14">ใช้ได้ถึงวันที่ :</div>
      <div class="testimonial-card11-text1-15"> 31 ธันวาคม 2577</div>
    `;

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://hosp.hss.moph.go.th') {
        return new Response('<input type="hidden" id="token" value="fake-token">', {
          status: 200,
          headers: { 'set-cookie': 'ci_session=fake-session-cookie; path=/' },
        });
      }
      if (url === 'https://hosp.hss.moph.go.th/key-searchs') {
        return new Response(JSON.stringify({
          code: 200,
          data: [cardHtml],
          numRow: 'ค้นพบทั้งหมด 1 รายการ',
        }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const [result] = await searchOfficialHssClinics(
      'แวคทูโฮมคลินิกเวชกรรม',
      fetchImpl,
      () => new Date('2026-08-31T02:09:00.000Z'),
    );

    expect(result).toMatchObject({
      title: 'แวคทูโฮมคลินิกเวชกรรม',
      category: 'CLINICS',
      status: 'WARNING',
      metadata: {
        'ชื่อสถานพยาบาล': 'แวคทูโฮมคลินิกเวชกรรม',
        'เลขที่ใบอนุญาต': '10101012369',
        'ที่ตั้ง': '42 ชั้น 1 เพชรเกษม 80 แยก 2 บางแค กรุงเทพมหานคร 10160',
        'ใช้ได้ถึง': '31 ธันวาคม 2577',
      },
    });
  });

  it('selects FDA for products and HSS for massage queries without cross-searching', async () => {
    const fdaFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('FDA_SEARCH_CENTER_BACKEND');
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify([{
        IDA: '1', typepro: 'อาหาร', lcnno: '74-2-01859-6-0457', productha: 'ผลิตภัณฑ์ทดสอบ',
        licen: 'ผู้รับอนุญาต', Newcode: 'FDA-1', cncnm: 'คงอยู่', URLs_NEW: 'https://porta.fda.moph.go.th/fda_search_center_new/',
      }]), { status: 200 });
    });
    const [product] = await resolveMultiChannelSearch('7420185960457', {
      category: 'ALL', searchDb: false, searchOfficial: true, fetchImpl: fdaFetch,
    });
    expect(product.source).toContain('อย.');
    expect(String(fdaFetch.mock.calls[0]?.[0])).toContain('FDA_SEARCH_CENTER_BACKEND');

    const hssFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('spa-services.hss.moph.go.th');
      expect(init?.headers).toMatchObject({ 'Next-Action': expect.any(String) });
      return new Response('1:{"found":false,"results":[]}', { status: 200 });
    });
    const [business] = await resolveMultiChannelSearch('ร้านนวดตัวอย่าง', {
      category: 'ALL', searchDb: false, searchOfficial: true, fetchImpl: hssFetch,
    });
    expect(business.source).toContain('สบส.');
    expect(String(hssFetch.mock.calls[0]?.[0])).toContain('spa-services.hss.moph.go.th');
  });
});
