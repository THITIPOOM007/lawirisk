# EvidenceVerse incident response runbook

Status: **staging-ready template; owner names and contact channels must be assigned**

## Roles

| Role | Responsibility | Assigned owner/channel |
| --- | --- | --- |
| Incident commander | Coordinates, timestamps decisions, closes incident | TBD |
| Security lead | Containment, credential rotation, forensic preservation | TBD |
| Application owner | Fail closed, rollback, deploy remediation | TBD |
| Database/storage owner | Revoke access, preserve/restore data and objects | TBD |
| DPO/Legal | Assess personal-data impact and notification duties | TBD |
| Communications owner | Approved internal/external communication | TBD |

No single person should both approve and perform destructive evidence deletion during an incident.

## First 30 minutes

1. Open an incident record with UTC time, reporter, affected environment, observable symptoms, and known data classes. Do not copy evidence contents into chat or tickets.
2. Classify severity and appoint the incident commander. Notify Security and DPO/Legal immediately when personal data may be affected.
3. Preserve Cloudflare deployment/version identifiers, Supabase logs, audit events, object hashes, scanner response metadata, and relevant request IDs.
4. Contain with the least destructive action: disable the affected intake channel, revoke/rotate the scoped credential, block a route, or roll back the Worker. Do not delete originals or audit events.
5. Record each action, actor, reason, start/end time, and result in an append-only incident timeline.

## Severity

- **SEV-1:** confirmed unauthorized evidence access, destructive loss, service-role exposure, active malware distribution, or widespread authentication bypass.
- **SEV-2:** suspected unauthorized access, failed integrity check, material outage, scanner unavailable with queued uploads, or isolated privilege defect.
- **SEV-3:** contained reliability defect without evidence/confidentiality impact.

## Containment playbooks

- Supabase key exposure: revoke/rotate the key, stop affected deployment, inspect Auth/admin and database activity, redeploy with a new secret, invalidate sessions when required.
- Cloudflare credential exposure: revoke token/session, inspect deployments and routes, roll back to a known version, rotate Worker secrets.
- Scanner failure: uploads remain fail closed; pause intake if backlog cannot be protected; never mark an unscanned object CLEAN.
- Integrity mismatch: quarantine the object and derived outputs, preserve both expected/observed hashes, prevent download, and escalate to Security.
- RLS/auth defect: take the affected route offline, preserve access logs, revoke sessions as scoped, and run the full role-boundary test before reopening.

## Recovery and closure

Recovery requires health status `ready`, clean release gates, confirmed secret rotation, role-boundary tests, scanner tests, evidence hash verification, and approval by the incident commander plus Security. Complete root cause, affected-data assessment, notification decision, corrective actions, owners, due dates, and a post-incident review.

The DPO/Legal owner—not the application—decides whether and when an incident must be notified to regulators or data subjects. Keep an internal assessment clock from the first confirmed awareness and preserve the decision evidence.
