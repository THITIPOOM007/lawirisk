import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://keenndeevrwmembphckn.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlZW5uZGVldnJ3bWVtYnBoY2tuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzAzODk5NCwiZXhwIjoyMTAyNjE0OTk0fQ.NuZ798iPfMnxyuSy1Lfdz8QDx_6XieYuaG0ZkC7U6Ms';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🚀 Seeding real production showcase case to Supabase...');

  // 1. Get or create admin profile
  const { data: profiles } = await supabase.from('profiles').select('id, name, email').limit(1);
  let userId = profiles?.[0]?.id;

  if (!userId) {
    const { data: newProfile, error: profErr } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(),
      name: 'พ.ต.ท. ดร. นวพล อภิบาลนิติ (Super Admin)',
      email: 'admin@lawirisk.ssk.gov.th',
      role: 'ADMIN',
    }).select('id').single();
    if (profErr) {
      console.warn('Profile warning:', profErr.message);
    } else {
      userId = newProfile.id;
    }
  }

  console.log('Using Admin Profile ID:', userId);

  // 2. Create Primary Showcase Case
  const { data: existingCase1 } = await supabase.from('cases').select('id').eq('number', 'SSK-2026-08-0099').maybeSingle();
  let case1Id = existingCase1?.id;

  if (!case1Id) {
    const { data: c1, error: c1Err } = await supabase.from('cases').insert({
      number: 'SSK-2026-08-0099',
      title: 'ปฏิบัติการทลายเครือข่ายหลอกลงทุนผลิตภัณฑ์อาหารเสริมอันตรายข้ามชาติ (Operation DietPharma Nexus)',
      description: 'การสืบสวนเครือข่ายหลอกลวงจำหน่ายผลิตภัณฑ์ลดน้ำหนักผสมสารไซบูทรามีน (Sibutramine) และปลอมแปลงเลขสารบบ อย. พร้อมตรวจพบเส้นทางการเงินบัญชีม้า 3 บัญชีและเบอร์โทรศัพท์ Call Center เชื่อมโยงข้ามคดี',
      status: 'ACTIVE',
      created_by: userId,
    }).select('id').single();

    if (c1Err) throw new Error('Case 1 insert failed: ' + c1Err.message);
    case1Id = c1.id;
    console.log('✅ Created Case 1:', case1Id);
  } else {
    console.log('ℹ️ Case 1 already exists:', case1Id);
  }

  // 3. Create Secondary Showcase Case (Target for cross-case matching)
  const { data: existingCase2 } = await supabase.from('cases').select('id').eq('number', 'SSK-2026-07-0012').maybeSingle();
  let case2Id = existingCase2?.id;

  if (!case2Id) {
    const { data: c2, error: c2Err } = await supabase.from('cases').insert({
      number: 'SSK-2026-07-0012',
      title: 'คดีฉ้อโกงประชาชนผ่านแพลตฟอร์มหลอกกู้เงินออนไลน์ (Operation FastLoan Trap)',
      description: 'สำนวนคดีผู้เสียหายถูกหลอกโอนเงินค่าค้ำประกันเงินกู้เข้าสู่บัญชีม้าแถวที่ 1 และ 2',
      status: 'ACTIVE',
      created_by: userId,
    }).select('id').single();

    if (c2Err) throw new Error('Case 2 insert failed: ' + c2Err.message);
    case2Id = c2.id;
    console.log('✅ Created Case 2:', case2Id);
  } else {
    console.log('ℹ️ Case 2 already exists:', case2Id);
  }

  // Add case members
  if (userId) {
    await supabase.from('case_members').upsert([
      { case_id: case1Id, profile_id: userId, role: 'OWNER' },
      { case_id: case2Id, profile_id: userId, role: 'OWNER' },
    ], { onConflict: 'case_id,profile_id' });
  }

  // 4. Insert Evidence Files for Case 1
  const evidenceList = [
    {
      case_id: case1Id,
      filename: 'slip_transfer_kplus_9876543210.jpg',
      file_path: `evidence-vault/cases/${case1Id}/slip_transfer.jpg`,
      file_size: 245890,
      mime_type: 'image/jpeg',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      upload_state: 'STORED',
      malware_scan_status: 'CLEAN',
      created_by: userId,
    },
    {
      case_id: case1Id,
      filename: 'product_box_label_fda_scam.png',
      file_path: `evidence-vault/cases/${case1Id}/product_box.png`,
      file_size: 512400,
      mime_type: 'image/png',
      sha256: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
      upload_state: 'STORED',
      malware_scan_status: 'CLEAN',
      created_by: userId,
    },
    {
      case_id: case1Id,
      filename: 'line_chat_callcenter_threat.pdf',
      file_path: `evidence-vault/cases/${case1Id}/line_chat.pdf`,
      file_size: 1240890,
      mime_type: 'application/pdf',
      sha256: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      upload_state: 'STORED',
      malware_scan_status: 'CLEAN',
      created_by: userId,
    }
  ];

  for (const ev of evidenceList) {
    const { data: existingEv } = await supabase.from('evidence_files').select('id').eq('case_id', ev.case_id).eq('filename', ev.filename).maybeSingle();
    if (!existingEv) {
      await supabase.from('evidence_files').insert(ev);
    }
  }
  console.log('✅ Evidence files registered');

  // 5. Insert Extracted Entities for Case 1
  const entitiesCase1 = [
    { case_id: case1Id, type: 'BANK_ACCOUNT', value: '987-6-54321-0', normalized_value: '9876543210' },
    { case_id: case1Id, type: 'PHONE', value: '089-771-2345', normalized_value: '+66897712345' },
    { case_id: case1Id, type: 'PERSON', value: 'นายวีรชัย เจริญผล', normalized_value: null },
    { case_id: case1Id, type: 'ORGANIZATION', value: 'บริษัท สยามไบโอฟาร์มา ซินดิเคท จำกัด', normalized_value: null },
  ];

  const insertedEntities = [];
  for (const ent of entitiesCase1) {
    const { data: existingEnt } = await supabase.from('extracted_entities').select('id').eq('case_id', ent.case_id).eq('type', ent.type).eq('value', ent.value).maybeSingle();
    if (existingEnt) {
      insertedEntities.push({ ...ent, id: existingEnt.id });
    } else {
      const { data: newEnt } = await supabase.from('extracted_entities').insert(ent).select('id').single();
      if (newEnt) insertedEntities.push({ ...ent, id: newEnt.id });
    }
  }
  console.log('✅ Extracted Entities Case 1 registered');

  // 6. Insert Extracted Entities for Case 2 (Target)
  const entitiesCase2 = [
    { case_id: case2Id, type: 'BANK_ACCOUNT', value: '9876543210', normalized_value: '9876543210' },
    { case_id: case2Id, type: 'PHONE', value: '0897712345', normalized_value: '+66897712345' },
  ];

  const targetEntities = [];
  for (const ent of entitiesCase2) {
    const { data: existingEnt } = await supabase.from('extracted_entities').select('id').eq('case_id', ent.case_id).eq('type', ent.type).eq('value', ent.value).maybeSingle();
    if (existingEnt) {
      targetEntities.push({ ...ent, id: existingEnt.id });
    } else {
      const { data: newEnt } = await supabase.from('extracted_entities').insert(ent).select('id').single();
      if (newEnt) targetEntities.push({ ...ent, id: newEnt.id });
    }
  }
  console.log('✅ Extracted Entities Case 2 registered');

  // 7. Insert Investigation Tasks
  const entBank = insertedEntities.find((e) => e.type === 'BANK_ACCOUNT');
  const entPhone = insertedEntities.find((e) => e.type === 'PHONE');
  const entOrg = insertedEntities.find((e) => e.type === 'ORGANIZATION');

  const tasks = [
    {
      case_id: case1Id,
      entity_id: entBank?.id,
      title: 'ตรวจสอบสถานะบัญชีม้าในระบบ AOC 1441',
      description: 'ส่งคำขอตรวจสอบความเสี่ยงและประวัติการอายัดบัญชี 987-6-54321-0 (นายวีรชัย เจริญผล) ไปยังศูนย์ AOC 1441',
      priority: 'CRITICAL',
      status: 'IN_PROGRESS',
      assigned_to: userId,
      created_by: userId,
    },
    {
      case_id: case1Id,
      entity_id: entBank?.id,
      title: 'ขอรายการเดินบัญชีอิเล็กทรอนิกส์ (Bank Statement)',
      description: 'ออกหนังสือราชการขอ Statement ย้อนหลัง 6 เดือนและรายชื่อบัญชีปลายทางที่มีการโอนออก',
      priority: 'HIGH',
      status: 'TODO',
      assigned_to: userId,
      created_by: userId,
    },
    {
      case_id: case1Id,
      entity_id: entPhone?.id,
      title: 'ตรวจสอบประวัติการจดทะเบียนซิมการ์ด (กสทช. / NBTC)',
      description: 'ยื่นตรวจสอบชื่อผู้ลงทะเบียนซิมหมายเลข 089-771-2345 และพิกัดเสาสัญญาณล่าสุด (Cell Site Location)',
      priority: 'HIGH',
      status: 'TODO',
      assigned_to: userId,
      created_by: userId,
    },
    {
      case_id: case1Id,
      entity_id: entOrg?.id,
      title: 'ตรวจสอบสถานะการจดทะเบียนนิติบุคคล (กรมพัฒนาธุรกิจการค้า DBD)',
      description: 'ตรวจสอบรายชื่อกรรมการและทุนจดทะเบียนของ บริษัท สยามไบโอฟาร์มา ซินดิเคท จำกัด',
      priority: 'MEDIUM',
      status: 'TODO',
      assigned_to: userId,
      created_by: userId,
    }
  ];

  for (const task of tasks) {
    const { data: existingTask } = await supabase.from('investigation_tasks').select('id').eq('case_id', task.case_id).eq('title', task.title).maybeSingle();
    if (!existingTask) {
      await supabase.from('investigation_tasks').insert(task);
    }
  }
  console.log('✅ Investigation Tasks created');

  // 8. Cross-Case Match Candidates
  const targetBank = targetEntities.find((e) => e.type === 'BANK_ACCOUNT');
  const targetPhone = targetEntities.find((e) => e.type === 'PHONE');

  if (entBank && targetBank) {
    const { error: m1Err } = await supabase.from('match_candidates').upsert({
      source_case_id: case1Id,
      target_case_id: case2Id,
      entity_id: entBank.id,
      target_entity_id: targetBank.id,
      confidence: 1.0,
      status: 'PENDING',
      matching_signals: {
        method: 'EXACT_NORMALIZED',
        score: 1.0,
        signal: 'บัญชีม้าตรงกันข้ามคดี (9876543210)',
      },
    }, { onConflict: 'entity_id,target_entity_id' });
    if (m1Err) console.warn('Match 1 warning:', m1Err.message);
  }

  if (entPhone && targetPhone) {
    const { error: m2Err } = await supabase.from('match_candidates').upsert({
      source_case_id: case1Id,
      target_case_id: case2Id,
      entity_id: entPhone.id,
      target_entity_id: targetPhone.id,
      confidence: 1.0,
      status: 'PENDING',
      matching_signals: {
        method: 'EXACT_NORMALIZED',
        score: 1.0,
        signal: 'เบอร์โทรศัพท์ Call Center ตรงกัน (+66897712345)',
      },
    }, { onConflict: 'entity_id,target_entity_id' });
    if (m2Err) console.warn('Match 2 warning:', m2Err.message);
  }
  console.log('✅ Cross-Case Match Candidates linked');

  // 9. Trusted Sources Registry
  await supabase.from('trusted_sources_registry').upsert([
    {
      source_name: 'FDA_SKYNET',
      domain: 'fda.moph.go.th',
      record_identifier: '10-1-6500012345',
      entity_name: 'สลิมพลัส คอลลาเจน ไดเอท (SlimPlus Collagen Diet)',
      category: 'HEALTH_PRODUCTS',
      details: {
        status: 'CANCELLED',
        warning: 'ตรวจพบสารไซบูทรามีน (Sibutramine) และเลขทะเบียนถูกยกเลิกแล้ว',
        hazard_level: 'EXTREME',
      },
      status: 'CONFIRMED',
    },
    {
      source_name: 'AOC_1441',
      domain: 'aoc.thaigov.go.th',
      record_identifier: '9876543210',
      entity_name: 'บัญชีธนาคาร กสิกรไทย - นายวีรชัย เจริญผล',
      category: 'FINANCIAL_MULE',
      details: {
        risk_score: 98,
        freeze_status: 'FLAGGED_HIGH_RISK',
        report_count: 14,
      },
      status: 'CONFIRMED',
    },
  ], { onConflict: 'domain,record_identifier' });
  console.log('✅ Trusted Sources Registry seeded');

  console.log('\n🎉 Production Showcase Case successfully seeded to Supabase!');
}

main().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
