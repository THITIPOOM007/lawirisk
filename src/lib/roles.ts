import { z } from 'zod';

export const staffRoleSchema = z.enum(['ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER']);

export type StaffRole = z.infer<typeof staffRoleSchema>;

export const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  INVESTIGATOR: 'พนักงานสืบสวน',
  REVIEWER: 'ผู้ตรวจทาน',
  VIEWER: 'ผู้สังเกตการณ์',
};

export const ADMIN_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN']);
export const CASE_WRITE_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN', 'INVESTIGATOR']);
export const INTAKE_WRITE_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN', 'INVESTIGATOR']);
export const INTAKE_READ_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN', 'INVESTIGATOR', 'REVIEWER']);
export const REVIEW_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN', 'REVIEWER']);
export const STAFF_READ_ROLES: ReadonlySet<StaffRole> = new Set(['ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER']);

export function isStaffRole(value: string): value is StaffRole {
  return staffRoleSchema.safeParse(value).success;
}

export function roleLabel(value: string) {
  return isStaffRole(value) ? ROLE_LABELS[value] : ROLE_LABELS.VIEWER;
}
