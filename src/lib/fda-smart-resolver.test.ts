import { describe, expect, it, vi } from 'vitest';
import {
  buildOfficialHssClinicQueryVariants,
  buildOfficialFdaQueryVariants,
  mapTrustedSourceRows,
  resolveMultiChannelSearch,
  searchOfficialFdaProducts,
  searchOfficialHssClinics,
  searchOfficialHssPublicNews,
  searchOfficialOryorNews,
  searchOfficialHssSpaBusinesses,
  searchOfficialNhsoProviders,
} from './fda-smart-resolver';

vi.mock('server-only', () => ({}));

describe('FDA public search fallback', () => {
  it('builds a broader clinic-name fallback without generic service terms', () => {
    expect(buildOfficialHssClinicQueryVariants(' มิราเคิล   คลินิก ')).toEqual([
      'มิราเคิล คลินิก',
      'มิราเคิล',
    ]);
  });

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
        metadata: { 'เลขที่ใบอนุญาต': '33101001165', ignored: { nested: true } },
      },
      {
        id: 'unsafe-1', title: 'ไม่ควรผ่าน', category: 'FRAUD_ALERTS',
        snippet: 'ไม่มี HTTPS', source: 'unknown', source_url: 'http://example.test',
        published_date: '2569-08-01', status: 'WARNING',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'official-1',
      confidenceScore: 1,
      metadata: { 'เลขที่ใบอนุญาต': '33101001165' },
    });
    expect(rows[0]?.metadata).not.toHaveProperty('ignored');
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

  it('refreshes the public HSS server-action reference when the source deploys a new action', async () => {
    const replacementAction = '1234567890abcdef1234567890abcdef12345678';
    const rsc = '1:{"found":true,"query":{"mode":"name","text":"รุ่งทิวา"},"results":[{"shop":{"memberID":"100200046-65","shopType":"นวดเพื่อสุขภาพ","nameThai":"รุ่งทิวา นวดเพื่อสุขภาพ","status":7,"statusText":"ได้รับอนุญาต","addressText":"กรุงเทพมหานคร","provName":"กรุงเทพมหานคร","shopArea":"90"}}]}';
    const submittedActions: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'POST') {
        const action = String((init.headers as Record<string, string>)['Next-Action']);
        submittedActions.push(action);
        if (action !== replacementAction) return new Response('Server action not found.', { status: 404 });
        return new Response(rsc, { status: 200 });
      }
      if (url === 'https://spa-services.hss.moph.go.th/permit/spa/establishment') {
        return new Response('<script src="/_next/static/chunks/establishment.js"></script>', { status: 200 });
      }
      if (url === 'https://spa-services.hss.moph.go.th/_next/static/chunks/establishment.js') {
        return new Response(`const action = createServerReference("${replacementAction}", callServer, undefined, findSourceMapURL, "searchSpaShopDrizzle");`, { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const [result] = await searchOfficialHssSpaBusinesses('รุ่งทิวา', fetchImpl);

    expect(submittedActions).toHaveLength(2);
    expect(submittedActions[1]).toBe(replacementAction);
    expect(result).toMatchObject({
      title: 'รุ่งทิวา นวดเพื่อสุขภาพ',
      status: 'SAFE',
      metadata: { 'เลขที่ใบอนุญาต': '100200046-65' },
    });
  });

  it('retries a transient HSS SPA response before marking the source unavailable', async () => {
    const rsc = '1:{"found":true,"query":{"mode":"name","text":"รุ่งทิวา"},"results":[{"shop":{"memberID":"100200046-65","shopType":"นวดเพื่อสุขภาพ","nameThai":"รุ่งทิวา นวดเพื่อสุขภาพ","status":7,"statusText":"ได้รับอนุญาต","addressText":"กรุงเทพมหานคร"}}]}';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('Temporary upstream error', { status: 502 }))
      .mockResolvedValueOnce(new Response(rsc, { status: 200 }));

    const [result] = await searchOfficialHssSpaBusinesses('รุ่งทิวา', fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      title: 'รุ่งทิวา นวดเพื่อสุขภาพ',
      status: 'SAFE',
    });
  });

  it('returns a related HSS public announcement as a review lead with its original citation', async () => {
    const html = `<B style="font-size:18px;"><A href='fileupload_doc/2023-12-18-alert.png' target=_blank>เตือนภัยมิจฉาชีพ แอบอ้างกรม สบส.</a></B><br>กรมสนับสนุนบริการสุขภาพเตือนประชาชนอย่ากดลิงก์ที่น่าสงสัย <BR><p>&nbsp;</p><B>[ลงประกาศโดย : ประชาสัมพันธ์ &nbsp;&nbsp;วันที่ : 18 ธ.ค. 2566]</B><!--<B><A href='show_picture_all.php?linkID=1'>สำเนาข่าวที่ซ่อนอยู่</a></B><br>ไม่ควรอ่าน <B>[ลงประกาศโดย : ประชาสัมพันธ์ วันที่ : 18 ธ.ค. 2566]</B>-->`;
    const fetchImpl = vi.fn(async () => new Response(html, { status: 200 }));

    const [result] = await searchOfficialHssPublicNews('มิจฉาชีพ', fetchImpl, () => new Date('2026-09-03T01:00:00.000Z'));

    expect(result).toMatchObject({
      title: 'เตือนภัยมิจฉาชีพ แอบอ้างกรม สบส.',
      category: 'FRAUD_ALERTS',
      status: 'WARNING',
      source: 'กรมสนับสนุนบริการสุขภาพ (สบส.) — ข่าวประชาสัมพันธ์',
    });
    expect(result.sourceUrl).toBe('https://hss.moph.go.th/fileupload_doc/2023-12-18-alert.png');
    expect(await searchOfficialHssPublicNews('มิจฉาชีพ', fetchImpl)).toHaveLength(1);
  });

  it('filters the FDA public-news feed by query and preserves the FDA media citation', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [{
      id: 81, _table_name: 'news', title: 'อย. เตือนภัยผลิตภัณฑ์สุขภาพ',
      shortDescription: 'ประชาชนควรตรวจสอบเลขทะเบียนก่อนซื้อ', publishDate: '3 ก.ย. 2569',
    }] }), { status: 200 }));

    const [result] = await searchOfficialOryorNews('ผลิตภัณฑ์', fetchImpl);

    expect(result).toMatchObject({
      title: 'อย. เตือนภัยผลิตภัณฑ์สุขภาพ',
      category: 'FRAUD_ALERTS',
      source: 'สำนักงานคณะกรรมการอาหารและยา (อย.) — ข่าวและประกาศ',
    });
    expect(result.sourceUrl).toBe('https://oryor.com/media/newsUpdate/news/81');
  });

  it('sends a direct public POST to the clinic registry and maps its records', async () => {
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

    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://hosp.hss.moph.go.th/key-searchs') {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://hosp.hss.moph.go.th',
          Referer: 'https://hosp.hss.moph.go.th/',
          'User-Agent': expect.stringContaining('Mozilla/5.0'),
          'X-Requested-With': 'XMLHttpRequest',
        });
        expect(String(init?.body)).toContain('keyword=%E0%B9%81%E0%B8%A7%E0%B8%84%E0%B8%97%E0%B8%B9%E0%B9%82%E0%B8%AE%E0%B8%A1%E0%B8%84%E0%B8%A5%E0%B8%B4%E0%B8%99%E0%B8%B4%E0%B8%81%E0%B9%80%E0%B8%A7%E0%B8%8A%E0%B8%81%E0%B8%A3%E0%B8%A3%E0%B8%A1');
        expect(String(init?.body)).toContain('type=name');
        expect(String(init?.body)).toContain('token=');
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
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('uses the live HSS hospital directory when the modern clinic endpoint is blocked', async () => {
    const directoryHtml = `
      ผลลัพธ์จากการค้าหา 'ยิ่งรัก' พบจำนวน : 1 แห่ง
      <table>
        <tr><td><img src="image/dot7.jpg"><B>คลินิกเฉพาะทางด้านเวชกรรมกุมารเวชศาสตร์แพทย์ยิ่งรัก</B></td></tr>
        <tr><td></td><td><B>ที่อยู่ :</B>174 5 ด่านขุนทด นครราชสีมา 30210 <br><B>เบอโทรศัพท์ :</B></td></tr>
      </table>`;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://hosp.hss.moph.go.th/key-searchs') return new Response('Not found', { status: 404 });
      expect(url).toBe('https://privatehospital.hss.moph.go.th/view_hospital.php');
      expect(init?.method).toBe('POST');
      expect(String(init?.body)).toContain('s_data=MedicalName');
      expect(String(init?.body)).toContain('q=%E0%B8%A2%E0%B8%B4%E0%B9%88%E0%B8%87%E0%B8%A3%E0%B8%B1%E0%B8%81');
      return new Response(directoryHtml, { status: 200 });
    });

    const [result] = await searchOfficialHssClinics('ยิ่งรัก', fetchImpl, () => new Date('2026-09-02T15:20:00.000Z'));

    expect(result).toMatchObject({
      title: 'คลินิกเฉพาะทางด้านเวชกรรมกุมารเวชศาสตร์แพทย์ยิ่งรัก',
      category: 'CLINICS',
      status: 'WARNING',
      productCategoryLabel: 'ผลสดจากรายชื่อโรงพยาบาลและคลินิก สบส.',
      metadata: { 'ที่ตั้ง': '174 5 ด่านขุนทด นครราชสีมา 30210' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries the HSS directory with a broader clinic-name variant before reporting no match', async () => {
    const directoryHtml = `
      ผลลัพธ์จากการค้าหา 'มิราเคิล' พบจำนวน : 1 แห่ง
      <table>
        <tr><td><img src="image/dot7.jpg"><B>่มิราเคิล รีเจนเนอเรทีฟ คลินิกเวชกรรม</B></td></tr>
        <tr><td></td><td><B>ที่อยู่ :</B>2/42-43 สุขุมวิท 42 คลองเตย กรุงเทพมหานคร 10110 <br><B>เบอโทรศัพท์ :</B></td></tr>
      </table>`;
    const submittedQueries: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://hosp.hss.moph.go.th/key-searchs') return new Response('Unavailable', { status: 503 });
      const body = new URLSearchParams(String(init?.body));
      const submittedQuery = body.get('q') || '';
      submittedQueries.push(submittedQuery);
      if (submittedQuery === 'มิราเคิล') return new Response(directoryHtml, { status: 200 });
      return new Response("ผลลัพธ์จากการค้าหา 'มิราเคิล คลินิก' พบจำนวน : 0 แห่ง", { status: 200 });
    });

    const [result] = await searchOfficialHssClinics('มิราเคิล คลินิก', fetchImpl);

    expect(submittedQueries).toEqual(['มิราเคิล คลินิก', 'มิราเคิล']);
    expect(result).toMatchObject({
      title: 'มิราเคิล รีเจนเนอเรทีฟ คลินิกเวชกรรม',
      status: 'WARNING',
      metadata: {
        'คำค้นที่ผู้ใช้กรอก': 'มิราเคิล คลินิก',
        'รูปแบบคำค้นที่ส่งให้ สบส.': 'มิราเคิล',
        'ปรับคำค้นอัตโนมัติ': 'ใช่',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('reads the official NHSO provider directory by its public query URL and preserves the profile citation', async () => {
    const nhsoHtml = `
      <div class="gt-result-search-tile">ผลลัพธ์การค้นหา <span> (พบทั้งหมด 1 ผลลัพธ์)</span></div>
      <a href="/profile/?hcode=14683" style="display: inline-block;" class="gt-result-search-info-name">
        (14683) รพ.กรุงสยามเซนต์คาร์ลอสโรงพยาบาลทั่วไปขนาดใหญ่
      </a><span>เบอร์โทรศัพท์ : 029756700</span><span>ที่อยู่ : <b>เลขที่</b> 5/84 ถนนติวานนท์ จังหวัดปทุมธานี</span></div></td>`;
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe('https://cpp.nhso.go.th/search/?q=%E0%B8%81%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B8%AA%E0%B8%A2%E0%B8%B2%E0%B8%A1');
      expect(init?.method).toBe('GET');
      return new Response(nhsoHtml, { status: 200 });
    });

    const [result] = await searchOfficialNhsoProviders('กรุงสยาม', fetchImpl, () => new Date('2026-09-03T01:00:00.000Z'));

    expect(result).toMatchObject({
      id: 'nhso-provider-14683',
      title: 'รพ.กรุงสยามเซนต์คาร์ลอสโรงพยาบาลทั่วไปขนาดใหญ่',
      category: 'CLINICS',
      source: 'ไดเรกทอรีหน่วยบริการ สำนักงานหลักประกันสุขภาพแห่งชาติ (สปสช.)',
      sourceUrl: 'https://cpp.nhso.go.th/profile/?hcode=14683',
      status: 'WARNING',
      metadata: {
        'รหัสหน่วยบริการ สปสช.': '14683',
        'เบอร์โทรศัพท์': '029756700',
        'ผลลัพธ์ทั้งหมดจาก สปสช.': '1',
      },
    });
    expect(result.snippet).toContain('เลขที่ 5/84 ถนนติวานนท์ จังหวัดปทุมธานี');
  });

  it('does not report an NHSO source-format failure as a not-found result', async () => {
    const [result] = await searchOfficialNhsoProviders('โรงพยาบาลตัวอย่าง', async () => new Response('<html>changed</html>', { status: 200 }));
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('searches every official registry for an ambiguous text query in automatic mode', async () => {
    const directoryHtml = `
      ผลลัพธ์จากการค้าหา 'ยิ่งรัก' พบจำนวน : 1 แห่ง
      <table>
        <tr><td><img src="image/dot7.jpg"><B>คลินิกเฉพาะทางด้านเวชกรรมกุมารเวชศาสตร์แพทย์ยิ่งรัก</B></td></tr>
        <tr><td></td><td><B>ที่อยู่ :</B>174 5 ด่านขุนทด นครราชสีมา 30210 <br><B>เบอโทรศัพท์ :</B></td></tr>
      </table>`;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('FDA_SEARCH_CENTER_BACKEND')) return new Response('[]', { status: 200 });
      if (url.includes('privatehospital.hss.moph.go.th')) return new Response(directoryHtml, { status: 200 });
      if (url.includes('spa-services.hss.moph.go.th')) {
        return new Response('1:{"found":false,"results":[]}', { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const results = await resolveMultiChannelSearch('ยิ่งรัก', {
      category: 'ALL', searchDb: false, searchOfficial: true, fetchImpl,
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      title: 'คลินิกเฉพาะทางด้านเวชกรรมกุมารเวชศาสตร์แพทย์ยิ่งรัก',
      category: 'CLINICS',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('keeps an explicit clinic search on the clinic registry for a short name', async () => {
    const cardHtml = `
      <span>ชื่อสถานพยาบาล :</span><span>คลินิกเวชกรรมนายแพทย์ศรีไพร</span>
      <span>สถานที่ตั้ง :</span><span>เลขที่ 163 หมู่ 1 ตำบลพยุห์ อำเภอพยุห์ จังหวัดศรีสะเกษ</span>
      <span>เลขที่ใบอนุญาตประกอบกิจการ :</span><span>33101001165</span>
      <span>ใช้ได้ถึงวันที่ :</span><span>31 ธันวาคม 2574</span>`;
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === 'https://hosp.hss.moph.go.th/key-searchs') return new Response(JSON.stringify({ code: 200, data: [cardHtml] }), { status: 200 });
      if (url.startsWith('https://cpp.nhso.go.th/search/')) return new Response('พบทั้งหมด 0 ผลลัพธ์', { status: 200 });
      return new Response('Not found', { status: 404 });
    });

    const [result] = await resolveMultiChannelSearch('ศรีไพร', {
      category: 'CLINICS', searchDb: false, searchOfficial: true, fetchImpl,
    });

    expect(result).toMatchObject({
      title: 'คลินิกเวชกรรมนายแพทย์ศรีไพร',
      category: 'CLINICS',
      metadata: { 'เลขที่ใบอนุญาต': '33101001165' },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
