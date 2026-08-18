# Staging data governance baseline

Status: **implemented as a safe staging default; organizational approval still required before real data**

## Scope and location

- Staging uses synthetic or irreversibly anonymized data only. Real evidence, real complainant identity, national identifiers, health data, biometrics, and production credentials are prohibited.
- The staging Supabase primary region is **Southeast Asia (Singapore)**. It is deployed for synthetic staging data only and remains subject to Security/DPO approval before real data. The production region must be approved separately.
- Staging and production must use separate Supabase projects, Cloudflare Workers, domains, secrets, storage buckets, users, and audit evidence.

## Access baseline

- Least privilege with ADMIN, INVESTIGATOR, REVIEWER, and VIEWER roles.
- At least two investigators must be isolated into different cases to prove RLS boundaries.
- MFA is required for ADMIN and service owners before staging sign-off; target is MFA for all staff accounts.
- Access review occurs monthly during staging and at least quarterly after production approval.
- Shared user accounts are prohibited. Service keys are stored only in the platform secret manager and rotated after any suspected exposure.

## Retention baseline

| Data class | Staging default | Production decision owner |
| --- | --- | --- |
| Synthetic case/evidence data | Delete within 30 days after the test cycle | Product + Security |
| Failed upload/quarantine | Delete within 7 days unless retained for an active incident | Security |
| Application/security logs | 90 days, with access restricted to operations/security | Security/DPO |
| Audit trail | Retain for the full staging project lifetime and export before teardown | Product + Legal/DPO |
| Real evidence/identity data | **Not permitted in staging** | Legal/DPO + records owner |

Production retention must be mapped to a lawful purpose, records schedule, litigation hold, investigation requirements, and deletion procedure before real data is admitted. This document does not select a legal retention period for evidence.

## Backup and recovery

- Use a paid Supabase staging plan when backup/restore acceptance is being tested; daily database backup availability and retention depend on the plan.
- Database backups do not restore deleted Storage objects. Evidence storage therefore needs a separate export/replication and restore test.
- Proposed staging objectives: RPO 24 hours and RTO 8 hours until PITR and operational ownership are approved.
- Before production, the owners must select RPO/RTO, enable the matching backup/PITR plan, encrypt any off-platform export, and complete a documented restore drill.
- A successful backup is not accepted as recoverable until both PostgreSQL data and private evidence objects have been restored and hash-verified in an isolated environment.

## Approval record

Fill this section without placing secrets in the file:

| Decision | Selected value | Owner | Approved date |
| --- | --- | --- | --- |
| Staging region | Deployed: Singapore (synthetic data only) | TBD | TBD |
| Staging contains synthetic data only | Required | TBD | TBD |
| Staging RPO/RTO | Proposed: 24h / 8h | TBD | TBD |
| Production data residency | TBD | DPO/Security | TBD |
| Production evidence retention | TBD | Legal/records owner | TBD |
| Backup/PITR plan and storage-object backup | TBD | DB/operations owner | TBD |

References: [Supabase available regions](https://supabase.com/docs/guides/platform/regions), [Supabase database backups](https://supabase.com/docs/guides/platform/backups).
