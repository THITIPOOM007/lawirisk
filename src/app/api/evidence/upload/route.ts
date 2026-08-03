import { NextRequest, NextResponse } from 'next/server';
import { createServer } from '@/lib/supabase-server';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const caseId = formData.get('case_id') as string | null;

    if (!file || !caseId) {
      return NextResponse.json(
        { error: 'ข้อมูลไม่ครบถ้วน (ต้องการไฟล์และรหัสคดี)' },
        { status: 400 }
      );
    }

    // 1. Server-side validation: size (limit: 20MB)
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'ขนาดไฟล์เกินกำหนด 20 MB' }, { status: 400 });
    }

    // 2. Server-side validation: extension
    const extension = file.name.split('.').pop()?.toLowerCase();
    const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    if (!extension || !allowedExtensions.includes(extension)) {
      return NextResponse.json({ error: 'นามสกุลไฟล์ไม่ได้รับอนุญาต' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 3. Server-side validation: SHA-256 Hash
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Server-side validation: Magic Bytes
    const magicBytesHex = buffer.subarray(0, 4).toString('hex').toUpperCase();
    const isPDF = magicBytesHex === '25504446';
    const isPNG = magicBytesHex === '89504E47';
    const isJPEG = magicBytesHex.startsWith('FFD8FF');

    if (extension === 'pdf' && !isPDF) {
      return NextResponse.json({ error: 'โครงสร้างไฟล์ PDF ไม่ถูกต้อง (Magic Bytes Mismatch)' }, { status: 400 });
    }
    if (extension === 'png' && !isPNG) {
      return NextResponse.json({ error: 'โครงสร้างไฟล์ PNG ไม่ถูกต้อง (Magic Bytes Mismatch)' }, { status: 400 });
    }
    if ((extension === 'jpg' || extension === 'jpeg') && !isJPEG) {
      return NextResponse.json({ error: 'โครงสร้างไฟล์ JPEG ไม่ถูกต้อง (Magic Bytes Mismatch)' }, { status: 400 });
    }

    // Detect if Supabase is configured
    const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

    if (!hasSupabase) {
      // Demo Mode Success Response
      return NextResponse.json({
        success: true,
        message: 'อัปโหลดสำเร็จในโหมดสาธิต',
        data: {
          id: `ev-${Date.now()}`,
          case_id: caseId,
          filename: file.name,
          file_size: file.size,
          sha256,
          status: 'PROCESSED',
          created_at: new Date().toISOString(),
        }
      });
    }

    // Supabase Mode
    const supabase = await createServer();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ในการเข้าถึง (กรุณาเข้าสู่ระบบ)' }, { status: 401 });
    }

    // Check duplicate hash
    const { data: duplicate } = await supabase
      .from('evidence_files')
      .select('id')
      .eq('sha256', sha256)
      .eq('case_id', caseId)
      .maybeSingle();

    if (duplicate) {
      return NextResponse.json(
        { error: 'ไฟล์พยานหลักฐานนี้มีอยู่ในสำนวนคดีแล้ว (SHA-256 ซ้ำซ้อน)' },
        { status: 409 }
      );
    }

    // Upload to Private Storage
    const bucketName = process.env.NEXT_PUBLIC_PRIVATE_BUCKET_NAME || 'evidence-vault';
    const storagePath = `${caseId}/${sha256}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `ไม่สามารถอัปโหลดไฟล์ไปที่ Private Storage: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Save metadata in database
    const { data: record, error: dbError } = await supabase
      .from('evidence_files')
      .insert({
        case_id: caseId,
        filename: file.name,
        file_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        sha256,
        status: 'PENDING',
        created_by: user.id,
      })
      .select()
      .single();

    if (dbError) {
      // Clean up uploaded file if DB insertion fails
      await supabase.storage.from(bucketName).remove([storagePath]);
      return NextResponse.json(
        { error: `ไม่สามารถบันทึกข้อมูลหลักฐานในฐานข้อมูล: ${dbError.message}` },
        { status: 500 }
      );
    }

    // Write audit log
    await supabase.from('audit_logs').insert({
      profile_id: user.id,
      action: 'EVIDENCE_UPLOAD',
      details: {
        evidence_id: record.id,
        filename: file.name,
        sha256,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'อัปโหลดและตรวจสอบสำเร็จ',
      data: record,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'เกิดข้อผิดพลาดภายในระบบ' },
      { status: 500 }
    );
  }
}
