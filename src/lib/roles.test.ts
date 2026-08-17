import { describe, expect, it } from 'vitest';
import { CASE_WRITE_ROLES, INTAKE_READ_ROLES, REVIEW_ROLES, isStaffRole, roleLabel } from './roles';

describe('canonical staff roles', () => {
  it('accepts only roles supported by the database constraint', () => {
    expect(['ADMIN', 'INVESTIGATOR', 'REVIEWER', 'VIEWER'].every(isStaffRole)).toBe(true);
    expect(isStaffRole('PLATFORM_ADMIN')).toBe(false);
    expect(isStaffRole('FIELD_OFFICER')).toBe(false);
  });

  it('keeps write and review permissions separate', () => {
    expect(CASE_WRITE_ROLES.has('INVESTIGATOR')).toBe(true);
    expect(CASE_WRITE_ROLES.has('REVIEWER')).toBe(false);
    expect(REVIEW_ROLES.has('REVIEWER')).toBe(true);
    expect(INTAKE_READ_ROLES.has('VIEWER')).toBe(false);
  });

  it('fails unknown role labels closed to viewer copy', () => {
    expect(roleLabel('UNKNOWN')).toBe('ผู้สังเกตการณ์');
  });
});
