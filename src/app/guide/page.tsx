import type { Metadata } from 'next';
import GuideCenter from '@/components/GuideCenter';

export const metadata: Metadata = {
  title: 'ศูนย์คู่มือการใช้งาน',
  description: 'คู่มือการใช้งาน LawiRisk-SSK แบบครบทุกฟีเจอร์ พร้อมขั้นตอน ตัวอย่าง และแนวทางนำไปประยุกต์ใช้',
};

export default function GuidePage() {
  return <GuideCenter />;
}
