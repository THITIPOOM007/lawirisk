import { z } from 'zod';

export const intakeContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(30).optional(),
  email: z.string().email().max(254).optional(),
  address: z.string().trim().max(1000).optional(),
}).strict();

export const manualIntakeSchema = z.object({
  channel_id: z.enum(['ch-walkin', 'ch-phone']).default('ch-walkin'),
  complainant_mode: z.enum(['IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS']).default('IDENTIFIED'),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  urgency_reason: z.string().trim().min(1).max(2000).default('บันทึกด้วยเจ้าหน้าที่'),
  region: z.string().trim().max(200).optional(),
  agency: z.string().trim().max(200).optional(),
  document_ref: z.string().trim().max(200).optional(),
  accused: intakeContactSchema.optional(),
  complainant: intakeContactSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.complainant_mode === 'IDENTIFIED' && !value.complainant) {
    context.addIssue({
      code: 'custom',
      path: ['complainant'],
      message: 'กรุณาระบุข้อมูลผู้ร้อง หรือเลือกไม่ระบุตัวตน',
    });
  }
});

export const externalIntakeSchema = z.object({
  complainant_mode: z.enum(['IDENTIFIED', 'INCOMPLETE', 'ANONYMOUS']).default('IDENTIFIED'),
  urgency: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  urgency_reason: z.string().trim().max(2000).optional(),
  region: z.string().trim().max(200).optional(),
  agency: z.string().trim().max(200).optional(),
  ref_no: z.string().trim().max(200).optional(),
  external_case_id: z.string().trim().max(200).optional(),
  accused: intakeContactSchema.optional(),
  complainant: intakeContactSchema.optional(),
}).passthrough();

export const createCaseSchema = z.object({
  number: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  jurisdiction_region: z.string().trim().max(200).optional(),
  jurisdiction_agency: z.string().trim().max(200).optional(),
}).strict();

export const triageIntakeSchema = z.object({
  action: z.enum(['CREATE_CASE', 'MERGE_INTAKE', 'REQUEST_MORE_INFO', 'REJECT_SPAM']),
  reason: z.string().trim().min(1).max(4000),
  destination_case_id: z.string().uuid().optional(),
  new_case_number: z.string().trim().min(1).max(100).optional(),
  new_case_title: z.string().trim().min(1).max(300).optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'MERGE_INTAKE' && !value.destination_case_id) {
    context.addIssue({ code: 'custom', path: ['destination_case_id'], message: 'กรุณาเลือกสำนวนปลายทาง' });
  }
  if (value.action === 'CREATE_CASE') {
    if (!value.new_case_number) context.addIssue({ code: 'custom', path: ['new_case_number'], message: 'กรุณาระบุเลขคดี' });
    if (!value.new_case_title) context.addIssue({ code: 'custom', path: ['new_case_title'], message: 'กรุณาระบุชื่อคดี' });
  }
});
