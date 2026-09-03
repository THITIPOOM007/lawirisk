export type CaseSourceCategory = 'DRUG' | 'FOOD' | 'HAZARDOUS' | 'COSMETIC' | 'HERBAL' | 'MEDICAL_DEVICE' | 'HEALTH_BUSINESS' | 'HEALTHCARE' | 'GENERAL';

export type CaseSourceRecommendation = {
  category: CaseSourceCategory;
  label: string;
  authority: string;
  url: string;
  purpose: string;
};

const SOURCE_BY_CATEGORY: Partial<Record<CaseSourceCategory, CaseSourceRecommendation[]>> = {
  DRUG: [{ category: 'DRUG', label: 'ระบบค้นหาข้อมูลสถานที่ด้านยา', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://medicina.fda.moph.go.th/FDA_DRUG/LCN_STAFF/FRM_STAFF_LCN_SEARCH.aspx', purpose: 'ตรวจชื่อร้าน/สถานที่ จังหวัด และเลขใบอนุญาตด้านยา' }],
  FOOD: [{ category: 'FOOD', label: 'ระบบค้นหาสถานที่และผลิตภัณฑ์อาหาร', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://alimentum.fda.moph.go.th/FDA_FOOD_LOCATION_MVC/FOOD_SEARCH/FRM_LIST_SEARCH_PRODUCTS', purpose: 'ตรวจสถานที่ผลิต/นำเข้า เลขสารบบ และชื่อผลิตภัณฑ์อาหาร' }],
  HAZARDOUS: [{ category: 'HAZARDOUS', label: 'ระบบค้นหาวัตถุอันตราย', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://excercitium.fda.moph.go.th/FDA_SEARCH_TXC/SEARCH_TXC/FRM_SEARCH_WO_TABEAN.aspx', purpose: 'ตรวจชื่อผลิตภัณฑ์ ผู้รับอนุญาต และเลขทะเบียนวัตถุอันตราย' }],
  COSMETIC: [{ category: 'COSMETIC', label: 'ระบบค้นหาเครื่องสำอาง', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://cosmetica.fda.moph.go.th/FDA_CMT_SSJ/CMT_RQT_STAFF/FRM_POST_ALL.aspx', purpose: 'ตรวจชื่อผู้ประกอบการ ชื่อการค้า ผลิตภัณฑ์ และเลขที่จดแจ้ง' }],
  HERBAL: [
    { category: 'HERBAL', label: 'ระบบสถานที่ผลิตสมุนไพร', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://meshlog.fda.moph.go.th/FDA_DRUG_HERB/LCN_STAFF/FRM_LCN_DRUG.aspx', purpose: 'ตรวจสถานที่และใบอนุญาตผลิตผลิตภัณฑ์สมุนไพร' },
    { category: 'HERBAL', label: 'ค้นใบอนุญาตสมุนไพร', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://meshlog.fda.moph.go.th/FDA_DRUG_HERB/LCN_STAFF/FRM_STAFF_LCN_SEARCH_2.aspx', purpose: 'ตรวจชื่อสถานที่และเลขใบอนุญาตสมุนไพร' },
    { category: 'HERBAL', label: 'ค้นสถานที่สมุนไพรด้วยเลขผู้รับอนุญาต', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://meshlog.fda.moph.go.th/FDA_DRUG_HERB/LCN_STAFF/FRM_STAFF_LCN_SEARCH.aspx', purpose: 'ตรวจผู้รับอนุญาตและเลขใบอนุญาตสถานที่ผลิต นำเข้า หรือขายผลิตภัณฑ์สมุนไพร' },
  ],
  MEDICAL_DEVICE: [{ category: 'MEDICAL_DEVICE', label: 'ระบบสถานที่เครื่องมือแพทย์', authority: 'สำนักงานคณะกรรมการอาหารและยา', url: 'https://medeva.fda.moph.go.th/FDA_MDC_LCN_FRONTEND/STAFF/STATION_NEW', purpose: 'ตรวจสถานที่และใบอนุญาตด้านเครื่องมือแพทย์' }],
  HEALTHCARE: [
    { category: 'HEALTHCARE', label: 'ทะเบียนสถานพยาบาล สบส.', authority: 'กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข', url: 'https://hosp.hss.moph.go.th/', purpose: 'ตรวจชื่อคลินิก สถานพยาบาล ผู้ประกอบกิจการ และสถานะใบอนุญาตจากฐาน สบส.' },
  ],
  HEALTH_BUSINESS: [
    { category: 'HEALTH_BUSINESS', label: 'ทะเบียนสถานประกอบการเพื่อสุขภาพ สบส.', authority: 'กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข', url: 'https://spa-services.hss.moph.go.th/permit/spa/establishment', purpose: 'ตรวจร้านนวด สปา และสถานประกอบการเพื่อสุขภาพที่ได้รับอนุญาต' },
  ],
};

const OFFICIAL_NEWS_SOURCES: CaseSourceRecommendation[] = [
  {
    category: 'GENERAL',
    label: 'ข่าวและประกาศเตือนภัยจาก อย.',
    authority: 'สำนักงานคณะกรรมการอาหารและยา',
    url: 'https://oryor.com/media/newsUpdate',
    purpose: 'ตรวจข่าว ประกาศเตือนภัย เรียกคืน และประชาสัมพันธ์ที่เกี่ยวข้องกับผลิตภัณฑ์สุขภาพ',
  },
  {
    category: 'GENERAL',
    label: 'ข่าวประชาสัมพันธ์จาก สบส.',
    authority: 'กรมสนับสนุนบริการสุขภาพ กระทรวงสาธารณสุข',
    url: 'https://hss.moph.go.th/s_show_topic2.php?id_form=1',
    purpose: 'ตรวจข่าวและประกาศเตือนภัยที่เกี่ยวข้องกับสถานพยาบาลและสถานประกอบการเพื่อสุขภาพ',
  },
];

export function classifyCaseSourceScope(context: string): CaseSourceCategory {
  const value = context.toLocaleLowerCase('th-TH');
  if (/ร้านยา|ขายยา|เภสัช|สถานที่ด้านยา|ผลิตยา|ทะเบียนยา|\bdrug\b/.test(value)) return 'DRUG';
  if (/อาหาร|น้ำดื่ม|เครื่องดื่ม|เลขสารบบ|สถานที่ผลิตอาหาร|ผลิตภัณฑ์เสริมอาหาร|\bfood\b/.test(value)) return 'FOOD';
  if (/วัตถุอันตราย|สารเคมี|ยาฆ่าแมลง|น้ำยาฆ่าเชื้อ|\bhazardous\b/.test(value)) return 'HAZARDOUS';
  if (/เครื่องสำอาง|ครีม|โลชั่น|เลขจดแจ้ง|\bcosmetic\b/.test(value)) return 'COSMETIC';
  if (/สมุนไพร|ยาแผนไทย|ผลิตภัณฑ์จากสมุนไพร|\bherbal\b/.test(value)) return 'HERBAL';
  if (/เครื่องมือแพทย์|อุปกรณ์การแพทย์|\bmedical_device\b/.test(value)) return 'MEDICAL_DEVICE';
  if (/ร้านนวด|นวดเพื่อสุขภาพ|สถานประกอบการเพื่อสุขภาพ|สปา|\bhealth_business\b/.test(value)) return 'HEALTH_BUSINESS';
  if (/คลินิก|โรงพยาบาล|สถานพยาบาล|ผู้ประกอบโรคศิลปะ|\bhealthcare\b/.test(value)) return 'HEALTHCARE';
  return 'GENERAL';
}

export function recommendCaseSources(context: string): CaseSourceRecommendation[] {
  const category = classifyCaseSourceScope(context);
  const categorySources = SOURCE_BY_CATEGORY[category] || [];
  return [...categorySources, ...OFFICIAL_NEWS_SOURCES].filter(
    (item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index,
  );
}
