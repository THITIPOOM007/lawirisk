'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Database,
  FileBarChart,
  FileSearch,
  Fingerprint,
  Globe,
  History,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  Network,
  PlayCircle,
  ScanSearch,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  Zap,
} from 'lucide-react';

type GuideCategory = 'เริ่มต้น' | 'ปฏิบัติการ' | 'วิเคราะห์' | 'กำกับดูแล';

type FeatureGuide = {
  title: string;
  shortTitle: string;
  href: string;
  category: GuideCategory;
  icon: React.ComponentType<{ className?: string }>;
  image: string;
  imageAlt: string;
  summary: string;
  outcome: string;
  steps: string[];
  tips: string[];
  roles: string;
};

const featureGuides: FeatureGuide[] = [
  {
    title: 'ภาพรวมระบบและศูนย์บัญชาการ', shortTitle: 'ภาพรวมระบบ', href: '/', category: 'เริ่มต้น', icon: LayoutDashboard,
    image: '/help-assets/dashboard.png', imageAlt: 'หน้าภาพรวมระบบ LawiRisk-SSK แสดงสถานะ คิวงาน และตัวชี้วัด',
    summary: 'มองภาพรวมคดี คำร้อง หลักฐาน บุคคล และงานเร่งด่วนจากจุดเดียว พร้อมลิงก์ไปยังงานที่ต้องดำเนินการต่อ',
    outcome: 'ใช้กำหนดลำดับงานประจำวันและตรวจความพร้อมของสายการควบคุมหลักฐาน',
    steps: ['ตรวจแถบ SYSTEM STATUS และสถานะระบบก่อนเริ่มงาน', 'ดูตัวชี้วัดหลักเพื่อประเมินปริมาณงานในแต่ละโมดูล', 'เปิด Priority Queue และเลือกรายการเร่งด่วนที่ต้องคัดกรอง', 'ตรวจกล่องความพร้อมของสายการควบคุมก่อนทำงานกับหลักฐาน'],
    tips: ['เริ่มทุกกะงานจากหน้านี้เพื่อไม่พลาดคำร้องเร่งด่วน', 'ตัวเลขบนการ์ดกดได้และพาไปยังรายการต้นทาง'], roles: 'ผู้ใช้ภายในทุกบทบาท',
  },
  {
    title: 'รายการรับเรื่องและคัดกรอง', shortTitle: 'รับเรื่อง', href: '/intake', category: 'ปฏิบัติการ', icon: Inbox,
    image: '/help-assets/intake.png', imageAlt: 'หน้ารายการรับเรื่องและคัดกรองพร้อมตัวเลือกนำเข้าข้อมูล',
    summary: 'รับข้อมูลจากการกรอกด้วยมือ ไฟล์ CSV ช่องทางประชาชน หรือระบบพันธมิตร แล้วจัดระดับความเร่งด่วนก่อนเปิดคดี',
    outcome: 'ได้รายการรับเรื่องที่มีแหล่งที่มา ระดับความเร่งด่วน และผู้รับผิดชอบชัดเจน',
    steps: ['เลือกช่องทางรับข้อมูลให้ตรงกับแหล่งที่มา', 'กรอกเหตุผล ความเร่งด่วน เขตอำนาจ และข้อมูลติดต่อเท่าที่จำเป็น', 'ถ้านำเข้า CSV ให้ใช้ UTF-8 และตรวจผลผ่าน/ไม่ผ่านรายแถว', 'เปิดรายการเพื่อตรวจรายละเอียดและกำหนดว่าจะยกระดับเป็นสำนวนคดีหรือไม่'],
    tips: ['หลีกเลี่ยงการใส่ข้อมูลส่วนบุคคลเกินความจำเป็น', 'บันทึกเหตุผลของระดับความเร่งด่วนให้ผู้อื่นตรวจทานได้'], roles: 'พนักงานรับเรื่อง · พนักงานสืบสวน',
  },
  {
    title: 'ทะเบียนสำนวนคดีสืบสวน', shortTitle: 'สำนวนคดี', href: '/cases', category: 'ปฏิบัติการ', icon: BriefcaseBusiness,
    image: '/help-assets/dashboard.png', imageAlt: 'ตัวอย่างการจัดการสำนวนและงานในระบบ',
    summary: 'สร้างและบริหารห้องคดี จัดสมาชิก งาน สถานะ และเชื่อมหลักฐานหรือบุคคลที่เกี่ยวข้องเข้ากับสำนวนเดียวกัน',
    outcome: 'ทุกข้อมูลของคดีอยู่ในบริบทเดียว ค้นหาได้ และแบ่งความรับผิดชอบได้ชัดเจน',
    steps: ['กด “ลงทะเบียนสำนวนคดีใหม่” และระบุเลขคดี ชื่อเรื่อง และรายละเอียด', 'เปิดห้องคดีเพื่อตรวจข้อมูลพื้นฐานและรายการที่เชื่อมโยง', 'เพิ่มสมาชิกและมอบหมายงานตามขอบเขตสิทธิ์', 'เปลี่ยนสถานะเมื่อมีเหตุผลรองรับและตรวจรายการค้างก่อนปิดคดี'],
    tips: ['ใช้ชื่อคดีที่ค้นหาได้ง่ายและไม่เปิดเผยข้อมูลอ่อนไหวเกินจำเป็น', 'อย่าปิดคดีขณะยังมีการตรวจทานหรือหลักฐานค้างอยู่'], roles: 'พนักงานสืบสวน · ผู้ดูแลระบบ',
  },
  {
    title: 'แหล่งสืบค้นข้อมูลที่ได้รับอนุญาต', shortTitle: 'แหล่งสืบค้น', href: '/sources', category: 'ปฏิบัติการ', icon: ScanSearch,
    image: '/help-assets/intake.png', imageAlt: 'ตัวอย่างพื้นที่เชื่อมต่อและนำเข้าข้อมูลจากแหล่งที่ได้รับอนุญาต',
    summary: 'เปิดใช้เฉพาะระบบภายนอกที่ผ่านการทบทวนช่องทาง ความปลอดภัย และขอบเขตการใช้งานแล้ว โดย Recon Companion เก็บบัญชีไว้เฉพาะเครื่องเจ้าหน้าที่',
    outcome: 'สืบค้นข้อมูลจากแหล่งทางการพร้อมสถานะที่อ่านได้ชัด และมี PDF กับภาพผลค้นจริงสำหรับตรวจสอบย้อนหลังเมื่อการค้นสำเร็จ',
    steps: ['อ่านสถานะและข้อจำกัดของแต่ละแหล่งก่อนเปิดใช้งาน', 'เลือกแหล่งที่ตรงกับวัตถุประสงค์ของคดี แล้วกดตั้ง/เปลี่ยนบัญชีบนเครื่องนี้เฉพาะครั้งแรกหรือเมื่อต้องเปลี่ยนรหัส', 'เริ่มค้นหาและดูสถานะ LIVE ACQUISITION บนหน้าคดีแทนการรอหน้าต่าง PowerShell', 'เมื่อสถานะแจ้งว่า “พบผลแล้ว” ให้ตรวจ PDF และภาพผลค้นในคลังหลักฐาน พร้อมวันเวลา URL และ SHA-256', 'หากระบบแจ้งว่ารอสกัดตัวระบุหรือรอตรวจทาน ให้ทำขั้นตอนนั้นก่อน; หาก PAUSED หรือ FAILED ให้แก้เฉพาะสาเหตุที่แสดงแล้วจึงลองใหม่', 'หากระบบปิดปุ่มไว้ ให้ประสานผู้ดูแลแทนการหาทางเลี่ยงข้อจำกัด'],
    tips: ['ตั้งบัญชีผ่าน Recon Companion บนเครื่องเท่านั้น; HSS ต้องยืนยันความเสี่ยง HTTP ทุกครั้ง', 'คดีผลิตภัณฑ์สุขภาพควรตรวจชื่อผลิตภัณฑ์ เลขทะเบียน หรือเลขใบอนุญาตในหลักฐานก่อนสั่งค้น; Medicina และ MeshLog ค้นเชิงลึกอัตโนมัติได้เฉพาะตัวระบุที่ตรวจ field contract แล้ว', 'หน้าต่างเบราว์เซอร์อาจเปิดเมื่อ Companion ทำงาน แต่ PowerShell ถูกซ่อนไว้โดยออกแบบและไม่ใช่ตัวบ่งชี้ความล้มเหลว', 'นำเข้าข้อมูลเท่าที่เกี่ยวข้องกับภารกิจเท่านั้น'], roles: 'พนักงานสืบสวนที่ได้รับสิทธิ์',
  },
  {
    title: 'คลังหลักฐานดิจิทัล', shortTitle: 'หลักฐาน', href: '/evidence', category: 'ปฏิบัติการ', icon: FileSearch,
    image: '/help-assets/evidence.png', imageAlt: 'หน้าคลังหลักฐานดิจิทัลและคิวไฟล์ที่รออัปโหลด',
    summary: 'รับไฟล์ต้นฉบับ รวมถึง PDF และภาพหน้าผลค้นจาก Recon Companion ตรวจชนิดและความปลอดภัย เก็บค่าแฮช และรักษาประวัติการครอบครองหลักฐานตั้งแต่ต้นทาง',
    outcome: 'ได้หลักฐานที่ยืนยันต้นฉบับ ตรวจสอบย้อนกลับ และเห็นทั้งเอกสารกับภาพบริบทของผลค้นก่อนเข้าสู่ขั้นตอนสกัดข้อมูล',
    steps: ['เลือกสำนวนคดีที่หลักฐานสังกัดและระบุแหล่งที่มา', 'ลากไฟล์หรือเลือกได้หลายไฟล์ โดยตรวจสถานะของแต่ละไฟล์ในคิว', 'ผลค้นจาก Recon ที่สำเร็จจะนำเข้า PDF และภาพหน้าผลค้น PNG แยกเป็นหลักฐานสองรายการพร้อม SHA-256', 'เลือกหลักฐานชนิดภาพแล้วกด “ดูภาพ” เพื่อตรวจข้อความและบริบทบนหน้าผลค้นจริง', 'แก้รายการที่ไม่ผ่านการตรวจชนิด ขนาด หรือลายเซ็นไฟล์ก่อนอัปโหลด', 'รอให้ระบบตรวจขนาด ชนิด และโครงสร้างไฟล์ก่อนนำไปประมวลผล', 'ใช้การดาวน์โหลดผ่านระบบเพื่อให้มีบันทึกการเข้าถึง'],
    tips: ['เก็บไฟล์ต้นฉบับ ห้ามแก้ไขแล้วอัปโหลดทับ', 'ภาพผลค้นเป็นบริบทของแหล่งข้อมูล ไม่ใช่การรับรองข้อเท็จจริง: ต้องเทียบ PDF แหล่งอ้างอิง และค่าแฮชก่อนใช้งาน', 'ตั้งชื่อไฟล์ให้สื่อความหมายแต่ไม่เปิดเผยข้อมูลเกินจำเป็น'], roles: 'พนักงานสืบสวน · ผู้ดูแลหลักฐาน',
  },
  {
    title: 'ศูนย์สั่งการระบบงานอัตโนมัติ', shortTitle: 'ระบบอัตโนมัติ', href: '/automation', category: 'วิเคราะห์', icon: Workflow,
    image: '/help-assets/evidence.png', imageAlt: 'ตัวอย่างคิวประมวลผลหลักฐานและระบบงานอัตโนมัติ',
    summary: 'สร้างและติดตามงานสกัดข้อความ จัดหมวดหมู่ หรือประมวลผลผ่าน pipeline โดยส่งต่อเฉพาะรหัสงานเท่าที่จำเป็น',
    outcome: 'ลดงานซ้ำ พร้อมติดตามสถานะ การลองใหม่ และสาเหตุที่งานหยุดได้',
    steps: ['เลือกหลักฐาน CLEAN และประเภท workflow ที่ต้องการ', 'ตรวจขอบเขตข้อมูลก่อนส่งเข้าคิว', 'ติดตามสถานะ QUEUED, RUNNING, SUCCEEDED หรือ FAILED', 'งานล้มเหลวให้เปิดรายละเอียด แก้สาเหตุ แล้วจึงกดลองใหม่', 'ยกเลิกงานที่ไม่จำเป็นก่อนระบบเริ่มประมวลผล'],
    tips: ['โหมดสาธิตจะแสดง state model โดยไม่ส่งข้อมูลออกจริง', 'อย่ากดลองใหม่ซ้ำโดยไม่อ่านสาเหตุความล้มเหลว'], roles: 'พนักงานสืบสวน · ผู้ดูแลระบบงาน',
  },
  {
    title: 'ผลการวิเคราะห์และข้อเสนอแนะ', shortTitle: 'ตรวจทาน AI', href: '/review', category: 'วิเคราะห์', icon: Sparkles,
    image: '/help-assets/evidence.png', imageAlt: 'ตัวอย่างขั้นตอนตรวจทานผลสกัดจากพยานหลักฐาน',
    summary: 'ตรวจข้อความสกัด เอนทิตี และข้อเสนอแนะเทียบกับต้นฉบับ ก่อนรับรองหรือปฏิเสธด้วยเหตุผลและการยืนยันตัวตน',
    outcome: 'เปลี่ยนผลที่ระบบเสนอให้เป็นข้อมูลที่มนุษย์ตรวจยืนยันและอ้างกลับไปยังหลักฐานได้',
    steps: ['เลือกคดีและหลักฐาน CLEAN ที่ต้องการตรวจ', 'ทดลอง OCR/สกัดข้อมูลหรือเปิดผลที่รอตรวจทาน', 'เทียบข้อความ ตำแหน่งอ้างอิง และผู้ให้บริการกับไฟล์ต้นฉบับ', 'ระบุเหตุผล แล้วเลือกรับรอง แก้ไข หรือปฏิเสธ', 'ยืนยันการรับรองด้วย Passkey/ชีวมิติตามระดับความเสี่ยง'],
    tips: ['SUGGESTED ไม่ใช่ข้อเท็จจริงจนกว่าจะรับรอง', 'เหตุผลที่บันทึกควรอธิบายว่าตรวจอะไรและพบอะไร'], roles: 'ผู้ตรวจทาน · พนักงานสืบสวนที่ได้รับสิทธิ์',
  },
  {
    title: 'ทะเบียนข้อมูลบุคคลและนิติบุคคล', shortTitle: 'ทะเบียนข้อมูล', href: '/entities', category: 'วิเคราะห์', icon: Database,
    image: '/help-assets/universe.png', imageAlt: 'ผังตัวอย่างแสดงบุคคล หมายเลขโทรศัพท์ และข้อมูลที่เชื่อมโยง',
    summary: 'รวบรวมข้อมูลบุคคล นิติบุคคล บัญชี หมายเลขโทรศัพท์ และตัวระบุอื่นในรูปแบบมาตรฐานเพื่อลดรายการซ้ำ',
    outcome: 'ได้ทะเบียนกลางที่ค้นหาและใช้เชื่อมโยงข้ามคดีอย่างมีที่มา',
    steps: ['ค้นหาก่อนสร้างรายการใหม่เพื่อลดข้อมูลซ้ำ', 'เลือกประเภทข้อมูลและกรอกค่าตามรูปแบบที่กำหนด', 'เชื่อมรายการกับคดีหรือหลักฐานที่เป็นแหล่งอ้างอิง', 'ตรวจข้อเสนอแนะการรวมข้อมูลก่อนยืนยันทุกครั้ง'],
    tips: ['ชื่อคล้ายกันไม่ได้แปลว่าเป็นบุคคลเดียวกัน', 'ใช้ตัวระบุหลายชนิดและหลักฐานอ้างอิงประกอบการรวมข้อมูล'], roles: 'พนักงานสืบสวน · ผู้ตรวจทาน',
  },
  {
    title: 'การวิเคราะห์ความเชื่อมโยงข้ามคดี', shortTitle: 'จับคู่ข้อมูล', href: '/matches', category: 'วิเคราะห์', icon: Link2,
    image: '/help-assets/universe.png', imageAlt: 'ตัวอย่างเครือข่ายข้อมูลที่เชื่อมโยงข้ามสำนวน',
    summary: 'สแกนความเหมือนของตัวระบุและความสัมพันธ์ เพื่อเสนอคู่ข้อมูลที่อาจเกี่ยวข้องกันโดยยังไม่สรุปแทนเจ้าหน้าที่',
    outcome: 'ค้นพบความสัมพันธ์ที่ควรตรวจต่อ พร้อมคะแนนและเหตุผลที่ย้อนกลับได้',
    steps: ['กำหนดขอบเขตคดีหรือประเภทข้อมูลที่ต้องการสแกน', 'เริ่มการสแกนและรอผลลัพธ์', 'เรียงตามคะแนนแล้วตรวจเหตุผลของแต่ละคู่', 'เปิดหลักฐานต้นทางทั้งสองด้านก่อนยืนยันหรือปฏิเสธความสัมพันธ์'],
    tips: ['คะแนนสูงเป็นสัญญาณให้ตรวจ ไม่ใช่หลักฐานยืนยัน', 'บันทึกเหตุผลเมื่อปฏิเสธเพื่อช่วยลดข้อเสนอที่ผิดซ้ำ'], roles: 'นักวิเคราะห์ · พนักงานสืบสวน',
  },
  {
    title: 'ผังความเชื่อมโยง 2D/3D', shortTitle: 'Evidence Universe', href: '/universe', category: 'วิเคราะห์', icon: Network,
    image: '/help-assets/universe.png', imageAlt: 'หน้าผังความเชื่อมโยง Evidence Universe แบบกราฟ',
    summary: 'สำรวจคดี หลักฐาน บุคคล และความสัมพันธ์เป็นกราฟแบบ 2D ที่อ่านง่ายหรือ 3D สำหรับสำรวจเครือข่ายซับซ้อน',
    outcome: 'มองเห็นจุดเชื่อม กลุ่มข้อมูล และเส้นทางความสัมพันธ์ที่ตารางทั่วไปแสดงได้ยาก',
    steps: ['เริ่มด้วยโหมด 2D เพื่ออ่านโครงสร้างภาพรวม', 'ใช้ช่องค้นหาเพื่อโฟกัสโหนดที่สนใจ', 'คลิกโหนดเพื่อเปิดรายละเอียดและหลักฐานอ้างอิงด้านข้าง', 'สลับ 3D เมื่อเครือข่ายซ้อนกันมาก และปิดหมุนอัตโนมัติหากต้องการอ่านนิ่ง', 'กลับไปตรวจข้อมูลต้นทางก่อนนำความสัมพันธ์ไปใช้'],
    tips: ['สีและเส้นช่วยจำแนกประเภท แต่ต้องอ่านป้ายกำกับประกอบ', 'มือถือเหมาะกับการค้นหาและเปิดโหนดมากกว่าการลากกราฟขนาดใหญ่'], roles: 'นักวิเคราะห์ · พนักงานสืบสวน · ผู้ดูข้อมูล',
  },
  {
    title: 'รายงานและเอกสารสืบสวน', shortTitle: 'รายงาน', href: '/reports', category: 'วิเคราะห์', icon: FileBarChart,
    image: '/help-assets/dashboard.png', imageAlt: 'ตัวอย่างหน้าศูนย์บัญชาการที่ใช้สรุปข้อมูลก่อนออกรายงาน',
    summary: 'สร้าง snapshot ของข้อมูลที่ผ่านการตรวจทาน พร้อมรายการหลักฐาน แฮช และแหล่งอ้างอิง แล้วส่งออกเป็น PDF',
    outcome: 'ได้รายงาน ณ เวลาหนึ่งที่ตรวจความครบถ้วนและความไม่เปลี่ยนแปลงได้',
    steps: ['เลือกคดีและขอบเขตข้อมูลที่จะรวมในรายงาน', 'ตรวจรายการหลักฐาน สถานะตรวจทาน และข้อมูลอ้างอิง', 'สร้างรายงานฉบับร่างและตรวจความครบถ้วน', 'ส่งออก PDF เมื่อพร้อม และเก็บรหัส snapshot/hash ไว้กับการส่งมอบ'],
    tips: ['สร้างฉบับใหม่เมื่อข้อมูลเปลี่ยน แทนการแก้ไฟล์ PDF ที่ส่งออกแล้ว', 'ตัดข้อมูลที่ไม่เกี่ยวข้องกับผู้รับออกก่อนส่งมอบ'], roles: 'พนักงานสืบสวน · ผู้ตรวจทาน · ผู้บริหารคดี',
  },
  {
    title: 'บันทึกประวัติการใช้งาน', shortTitle: 'Audit Log', href: '/audit', category: 'กำกับดูแล', icon: History,
    image: '/help-assets/dashboard.png', imageAlt: 'ตัวอย่างสถานะการตรวจสอบและความพร้อมของระบบ',
    summary: 'ตรวจผู้กระทำ เวลา เหตุการณ์ และทรัพยากรที่เกี่ยวข้อง เพื่อสอบทานเหตุการณ์หรือเส้นทางการเข้าถึงข้อมูล',
    outcome: 'อธิบายได้ว่าใครทำอะไร เมื่อใด กับข้อมูลใด โดยไม่แก้ไขประวัติเดิม',
    steps: ['กำหนดช่วงเวลา ประเภทเหตุการณ์ หรือผู้ใช้งาน', 'ค้นหาทรัพยากรด้วยรหัสคดี หลักฐาน หรืองาน', 'เปิดรายละเอียดเหตุการณ์ที่สนใจและเทียบลำดับเวลา', 'ส่งต่อรหัสเหตุการณ์ให้ผู้ดูแลเมื่อพบความผิดปกติ'],
    tips: ['Audit log ใช้ตรวจสอบ ไม่ใช่พื้นที่แก้ข้อมูลธุรกิจ', 'เริ่มจากช่วงเวลาแคบแล้วค่อยขยายเพื่ออ่านเหตุการณ์ง่ายขึ้น'], roles: 'ผู้ตรวจสอบ · ผู้ดูแลระบบ · ผู้มีสิทธิ์กำกับดูแล',
  },
  {
    title: 'Passkey และการสแกนชีวมิติ', shortTitle: 'ความปลอดภัย', href: '/security', category: 'กำกับดูแล', icon: Fingerprint,
    image: '/help-assets/evidence.png', imageAlt: 'ตัวอย่างการทำงานกับข้อมูลสำคัญที่ต้องยืนยันตัวตน',
    summary: 'ลงทะเบียนและจัดการ Passkey เพื่อเข้าสู่ระบบหรือยืนยันงานสำคัญด้วยกลไกชีวมิติของอุปกรณ์ โดยระบบไม่เก็บภาพใบหน้า',
    outcome: 'ลดความเสี่ยงจากรหัสผ่านและยืนยันตัวผู้รับรองในขั้นตอนสำคัญ',
    steps: ['เปิดหน้าความปลอดภัยและตรวจรายการอุปกรณ์ที่ลงทะเบียน', 'เพิ่ม Passkey แล้วทำตามหน้าต่าง Windows Hello หรือระบบของอุปกรณ์', 'ตั้งชื่ออุปกรณ์ให้จำได้และทดสอบการเข้าสู่ระบบ', 'เพิกถอนอุปกรณ์ที่สูญหาย ไม่ใช้งาน หรือไม่รู้จักทันที'],
    tips: ['ลงทะเบียนอย่างน้อยสองอุปกรณ์ตามนโยบายเพื่อมีทางสำรอง', 'ชีวมิติถูกตรวจในอุปกรณ์และไม่ถูกอัปโหลดเป็นภาพเข้าสู่ระบบ'], roles: 'ผู้ใช้งานทุกบทบาท',
  },
  {
    title: 'บริการรับเรื่องสำหรับประชาชน', shortTitle: 'บริการประชาชน', href: '/public', category: 'กำกับดูแล', icon: Globe,
    image: '/help-assets/intake.png', imageAlt: 'ตัวอย่างขั้นตอนรับเรื่องจากหลายช่องทาง',
    summary: 'ให้ประชาชนค้นหาข้อมูลสาธารณะ ส่งเบาะแสแบบเปิดเผยหรือไม่ออกนาม และติดตามสถานะด้วยรหัสที่ได้รับ',
    outcome: 'รับเรื่องอย่างมีโครงสร้างโดยไม่เปิดข้อมูลภายในหรือบังคับให้ผู้แจ้งเปิดเผยตัวตน',
    steps: ['ค้นหาข้อมูลสาธารณะด้วยคำสำคัญหรือเลขอ้างอิง', 'เลือกแจ้งเรื่องและกรอกรายละเอียดที่เพียงพอต่อการคัดกรอง', 'เลือกไม่ประสงค์ออกนามเมื่อไม่ต้องการให้ข้อมูลระบุตัว', 'บันทึกรหัสติดตามที่ระบบแสดงหลังส่งสำเร็จ', 'กลับมาตรวจสถานะด้วยรหัสเดิมโดยไม่ต้องเข้าสู่ระบบ'],
    tips: ['แจ้งเตือนผู้ส่งไม่ให้ใส่ข้อมูลลับที่ไม่จำเป็น', 'รหัสติดตามเป็นข้อมูลสำคัญ ควรเก็บไว้ในที่ปลอดภัย'], roles: 'ประชาชนทั่วไป · เจ้าหน้าที่รับเรื่อง',
  },
  {
    title: 'การตั้งค่าและกำหนดสิทธิ์', shortTitle: 'ตั้งค่าระบบ', href: '/admin/settings', category: 'กำกับดูแล', icon: Settings,
    image: '/help-assets/dashboard.png', imageAlt: 'ภาพรวมระบบสำหรับผู้ดูแลและติดตามสถานะ',
    summary: 'กำหนดค่าการทำงาน สิทธิ์ และการเชื่อมต่อที่ผู้ดูแลระบบอนุญาต โดยแยกการตั้งค่าจากข้อมูลปฏิบัติการ',
    outcome: 'ระบบทำงานตามนโยบายองค์กรและใช้หลักสิทธิ์เท่าที่จำเป็น',
    steps: ['ตรวจสภาพแวดล้อมและคำอธิบายของค่าก่อนแก้ไข', 'เปลี่ยนเฉพาะค่าที่อยู่ในขอบเขตและมีผู้อนุมัติ', 'บันทึกแล้วทดสอบผลด้วยบัญชีบทบาทที่เกี่ยวข้อง', 'ตรวจ Audit Log หลังการเปลี่ยนแปลงสำคัญ'],
    tips: ['ทดลองใน staging ก่อนเปลี่ยนค่าที่กระทบ workflow', 'ห้ามวาง secret หรือ credential ในช่องข้อความทั่วไป'], roles: 'ผู้ดูแลระบบเท่านั้น',
  },
];

const categories: Array<'ทั้งหมด' | GuideCategory> = ['ทั้งหมด', 'เริ่มต้น', 'ปฏิบัติการ', 'วิเคราะห์', 'กำกับดูแล'];

const workflow = [
  { icon: Inbox, label: '01 · รับเรื่อง', detail: 'รวบรวมและคัดกรองข้อมูล' },
  { icon: BriefcaseBusiness, label: '02 · เปิดคดี', detail: 'กำหนดบริบทและผู้รับผิดชอบ' },
  { icon: FileSearch, label: '03 · เก็บหลักฐาน', detail: 'เก็บต้นฉบับและสายการควบคุม' },
  { icon: Bot, label: '04 · ประมวลผล', detail: 'OCR จัดหมวด และเสนอความเชื่อมโยง' },
  { icon: ClipboardCheck, label: '05 · ตรวจทาน', detail: 'มนุษย์ยืนยันกับหลักฐานต้นทาง' },
  { icon: FileBarChart, label: '06 · ออกรายงาน', detail: 'สร้าง snapshot ที่ตรวจสอบได้' },
];

export default function GuideCenter() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('ทั้งหมด');

  const filteredGuides = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('th');
    return featureGuides.filter((guide) => {
      const categoryMatches = category === 'ทั้งหมด' || guide.category === category;
      if (!normalizedQuery) return categoryMatches;
      const haystack = [guide.title, guide.summary, guide.outcome, guide.roles, ...guide.steps, ...guide.tips].join(' ').toLocaleLowerCase('th');
      return categoryMatches && haystack.includes(normalizedQuery);
    });
  }, [category, query]);

  const scrollToFeatures = () => document.getElementById('feature-guides')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-8 pb-24 lg:space-y-10">
      <section className="glass-panel guide-hero relative isolate overflow-hidden rounded-[30px] border border-white/[0.08] px-5 py-8 sm:px-8 sm:py-10 lg:min-h-[410px] lg:px-12 lg:py-12">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-teal-300/[0.1] blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-indigo-400/[0.09] blur-3xl" aria-hidden="true" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.08] px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-teal-200">
              <BookOpenText className="h-4 w-4" /> LawiRisk knowledge center
            </div>
            <h1 className="mt-5 max-w-4xl text-balance text-3xl font-black leading-[1.15] tracking-[-0.04em] text-white sm:text-4xl lg:text-5xl">
              คู่มือที่พาคุณทำงาน<br /><span className="bg-gradient-to-r from-teal-200 via-cyan-100 to-amber-200 bg-clip-text text-transparent">ตั้งแต่รับเรื่องจนถึงรายงานที่ตรวจสอบได้</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">เรียนรู้ตามงานจริง หรือเลือกอ่านรายฟีเจอร์ ทุกหัวข้อมีวัตถุประสงค์ ขั้นตอน เคล็ดลับ บทบาทที่เกี่ยวข้อง และทางลัดไปยังหน้าทำงาน</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={scrollToFeatures} className="primary-action inline-flex min-h-12 items-center gap-2 rounded-2xl px-6 text-sm font-black"><PlayCircle className="h-5 w-5" />เริ่มเรียนรู้ตามฟีเจอร์</button>
              <Link href="/intake" className="secondary-action inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/[0.1] px-5 text-sm font-bold text-slate-200">เริ่มรับเรื่องจริง<ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[440px]" aria-label="ภาพตัวอย่างหน้าจอระบบ">
            <div className="absolute -inset-4 rounded-[32px] bg-gradient-to-br from-teal-300/15 to-indigo-400/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-[24px] border border-white/[0.13] bg-[#06111c] p-2 shadow-[0_28px_90px_rgba(0,0,0,0.45)]">
              <div className="mb-2 flex items-center gap-1.5 px-2 py-1"><span className="h-2 w-2 rounded-full bg-rose-400/70" /><span className="h-2 w-2 rounded-full bg-amber-300/70" /><span className="h-2 w-2 rounded-full bg-emerald-300/70" /><span className="ml-2 font-mono text-[8px] text-slate-600">SECURE WORKSPACE</span></div>
              <Image src="/help-assets/dashboard.png" alt="หน้าภาพรวม LawiRisk-SSK" width={1440} height={900} priority className="aspect-[16/10] w-full rounded-[17px] border border-white/[0.08] object-cover object-top" />
            </div>
            <div className="absolute -bottom-4 -left-3 flex items-center gap-2 rounded-2xl border border-emerald-300/20 bg-[#091925]/95 px-4 py-3 text-[10px] font-bold text-emerald-200 shadow-2xl backdrop-blur-xl"><ShieldCheck className="h-4 w-4" />ตรวจสอบย้อนกลับถึงต้นฉบับ</div>
          </div>
        </div>
      </section>

      <section aria-labelledby="workflow-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Recommended workflow</p><h2 id="workflow-title" className="mt-1 text-2xl font-black text-white">เส้นทางการทำงานที่แนะนำ</h2></div>
          <p className="max-w-xl text-xs leading-6 text-slate-500">ใช้เป็นแม่แบบ แล้วปรับผู้รับผิดชอบและขั้นตอนย่อยให้สอดคล้องกับระเบียบของหน่วยงาน</p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {workflow.map(({ icon: Icon, label, detail }, index) => (
            <div key={label} className="soft-panel relative rounded-[22px] border border-white/[0.06] p-4">
              {index < workflow.length - 1 && <ArrowRight className="absolute -right-3 top-7 z-10 hidden h-4 w-4 text-teal-300/35 xl:block" aria-hidden="true" />}
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-teal-300/15 bg-teal-300/[0.07] text-teal-200"><Icon className="h-4 w-4" /></span>
              <p className="mt-4 text-xs font-black text-white">{label}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="feature-guides" className="scroll-mt-6 space-y-6" aria-labelledby="feature-title">
        <div className="sticky top-0 z-20 -mx-1 rounded-[24px] border border-white/[0.08] bg-[#06121e]/90 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <label htmlFor="guide-search" className="sr-only">ค้นหาคู่มือ</label>
              <input id="guide-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา เช่น อัปโหลดหลักฐาน, OCR, Passkey, ออกรายงาน..." className="min-h-12 w-full rounded-2xl border border-white/[0.09] bg-black/20 py-3 pl-11 pr-11 text-sm text-white placeholder:text-slate-600 focus:border-teal-300/30 focus:outline-none" />
              {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.05] hover:text-white" aria-label="ล้างคำค้น"><X className="h-4 w-4" /></button>}
            </div>
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1 xl:pb-0" aria-label="กรองหมวดคู่มือ">
              {categories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} aria-pressed={category === item} className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-bold transition ${category === item ? 'border-teal-300/25 bg-teal-300/10 text-teal-200' : 'border-white/[0.07] bg-white/[0.025] text-slate-500 hover:text-slate-200'}`}>{item}</button>)}
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300">Feature playbooks</p><h2 id="feature-title" className="mt-1 text-2xl font-black text-white">คู่มือทุกฟีเจอร์</h2></div>
          <p className="text-xs text-slate-500" role="status">พบ {filteredGuides.length} จาก {featureGuides.length} หัวข้อ</p>
        </div>

        {filteredGuides.length ? (
          <div className="grid gap-5 xl:grid-cols-2">
            {filteredGuides.map((guide, index) => {
              const Icon = guide.icon;
              return (
                <article key={guide.href} className="guide-feature-card glass-panel overflow-hidden rounded-[26px] border border-white/[0.07]">
                  <div className="relative aspect-[16/7] overflow-hidden border-b border-white/[0.06] bg-[#050f19]">
                    <Image src={guide.image} alt={guide.imageAlt} width={1440} height={900} className="h-full w-full object-cover object-top opacity-80 transition duration-700 hover:scale-[1.025] hover:opacity-100" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07131f] via-transparent to-transparent" />
                    <span className="absolute left-4 top-4 rounded-full border border-white/[0.12] bg-[#06121e]/85 px-3 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-300 backdrop-blur-xl">{String(index + 1).padStart(2, '0')} · {guide.category}</span>
                  </div>
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-300/20 bg-teal-300/[0.08] text-teal-200 shadow-[0_0_24px_rgba(45,212,191,0.08)]"><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1"><h3 className="text-lg font-black text-white sm:text-xl">{guide.title}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">เหมาะสำหรับ · {guide.roles}</p></div>
                    </div>
                    <p className="mt-5 text-sm leading-7 text-slate-300">{guide.summary}</p>
                    <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-emerald-300/12 bg-emerald-300/[0.045] p-3.5"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p className="text-xs leading-6 text-slate-400"><span className="font-bold text-emerald-200">ผลลัพธ์ที่ควรได้: </span>{guide.outcome}</p></div>

                    <details className="group mt-5 border-t border-white/[0.06] pt-4">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-1 text-xs font-black text-teal-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">เปิดขั้นตอนและเคล็ดลับ<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></summary>
                      <div className="grid gap-5 pb-2 pt-4 sm:grid-cols-2">
                        <div><p className="flex items-center gap-2 text-xs font-black text-white"><ListChecks className="h-4 w-4 text-teal-300" />ขั้นตอนใช้งาน</p><ol className="mt-3 space-y-3">{guide.steps.map((item, stepIndex) => <li key={item} className="flex gap-3 text-[11px] leading-5 text-slate-400"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-teal-300/20 bg-teal-300/[0.06] font-mono text-[9px] font-bold text-teal-200">{stepIndex + 1}</span><span>{item}</span></li>)}</ol></div>
                        <div><p className="flex items-center gap-2 text-xs font-black text-white"><Lightbulb className="h-4 w-4 text-amber-300" />นำไปใช้ให้ดีขึ้น</p><ul className="mt-3 space-y-3">{guide.tips.map((item) => <li key={item} className="flex gap-2.5 text-[11px] leading-5 text-slate-400"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />{item}</li>)}</ul></div>
                      </div>
                    </details>
                    <Link href={guide.href} className="secondary-action mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.09] text-xs font-black text-slate-200 hover:border-teal-300/25">ไปยังหน้า {guide.shortTitle}<ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-16 text-center">
            <Search className="mx-auto h-10 w-10 text-slate-700" /><h3 className="mt-4 text-lg font-black text-white">ยังไม่พบหัวข้อที่ตรงกัน</h3><p className="mt-2 text-sm text-slate-500">ลองค้นด้วยชื่อฟีเจอร์ งานที่ต้องการทำ หรือเลือกหมวด “ทั้งหมด”</p><button type="button" onClick={() => { setQuery(''); setCategory('ทั้งหมด'); }} className="mt-5 min-h-11 rounded-xl border border-teal-300/20 bg-teal-300/[0.07] px-5 text-xs font-bold text-teal-200">ล้างตัวกรอง</button>
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-3" aria-label="แนวทางใช้งานอย่างปลอดภัย">
        {[
          { icon: ShieldCheck, title: 'รักษาต้นฉบับเสมอ', text: 'อัปโหลดไฟล์ต้นฉบับ เก็บแหล่งที่มา ค่าแฮช และใช้สำเนาสำหรับการทำงาน เพื่อรักษาความน่าเชื่อถือของหลักฐาน' },
          { icon: Activity, title: 'ให้มนุษย์เป็นผู้ตัดสิน', text: 'OCR คะแนนจับคู่ และ AI เป็นข้อมูลช่วยงาน ต้องตรวจหลักฐานอ้างอิงและบันทึกเหตุผลก่อนรับรองทุกครั้ง' },
          { icon: CircleAlert, title: 'ใช้สิทธิ์เท่าที่จำเป็น', text: 'เข้าถึง ส่งออก และส่งต่อเฉพาะข้อมูลที่เกี่ยวข้องกับภารกิจ หากพบสิทธิ์หรือเหตุการณ์ผิดปกติให้แจ้งผู้ดูแลทันที' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="hud-panel rounded-[24px] p-5"><span className="grid h-11 w-11 place-items-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] text-amber-200"><Icon className="h-5 w-5" /></span><h2 className="mt-4 text-base font-black text-white">{title}</h2><p className="mt-2 text-xs leading-6 text-slate-400">{text}</p></div>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-[28px] border border-teal-300/15 bg-gradient-to-br from-teal-300/[0.09] via-[#081725] to-indigo-400/[0.08] p-6 sm:p-8">
        <div className="absolute -right-14 -top-16 h-56 w-56 rounded-full bg-teal-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300">Ready for your workflow</p><h2 className="mt-2 text-2xl font-black text-white">นำแม่แบบนี้ไปปรับใช้กับงานของคุณ</h2><p className="mt-3 text-sm leading-7 text-slate-300">เริ่มจากคดีสาธิต กำหนดผู้รับผิดชอบในแต่ละช่วง และทบทวนจุดที่ต้องให้มนุษย์ยืนยันก่อนใช้งานกับข้อมูลจริง</p></div>
          <Link href="/intake" className="primary-action inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl px-6 text-sm font-black"><Zap className="h-5 w-5" />เริ่มที่รายการรับเรื่อง</Link>
        </div>
      </section>
    </div>
  );
}
