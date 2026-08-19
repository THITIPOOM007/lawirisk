import 'server-only';

import { isAllowedAutomationUrl, secureTokenMatches } from '@/lib/automation-security';

const DISPATCH_TIMEOUT_MS = 10_000;

export class AutomationDispatchError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'INSECURE_URL' | 'UNAVAILABLE') {
    super(code);
    this.name = 'AutomationDispatchError';
  }
}

const valueOf = (name: string) => process.env[name]?.trim() || '';

export function isN8nAutomationConfigured() {
  const webhookUrl = valueOf('N8N_AUTOMATION_WEBHOOK_URL');
  const appOrigin = valueOf('APP_ORIGIN');
  return Boolean(
    webhookUrl
    && appOrigin
    && valueOf('N8N_DISPATCH_TOKEN').length >= 32
    && valueOf('N8N_CALLBACK_TOKEN').length >= 32
    && isAllowedAutomationUrl(webhookUrl)
    && isAllowedAutomationUrl(appOrigin),
  );
}

export function verifyN8nCallbackToken(supplied: string | null) {
  return secureTokenMatches(valueOf('N8N_CALLBACK_TOKEN'), supplied);
}

export async function dispatchAutomationJob(input: { jobId: string; dispatchId: string }) {
  const webhookUrl = valueOf('N8N_AUTOMATION_WEBHOOK_URL');
  const appOrigin = valueOf('APP_ORIGIN').replace(/\/$/, '');
  const dispatchToken = valueOf('N8N_DISPATCH_TOKEN');
  if (!webhookUrl || !appOrigin || !dispatchToken || !valueOf('N8N_CALLBACK_TOKEN')) {
    throw new AutomationDispatchError('NOT_CONFIGURED');
  }
  if (!isAllowedAutomationUrl(webhookUrl) || !isAllowedAutomationUrl(appOrigin)) {
    throw new AutomationDispatchError('INSECURE_URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-LawiRisk-Dispatch-Token': dispatchToken,
      },
      body: JSON.stringify({
        schema_version: 'lawirisk-automation-v1',
        job_id: input.jobId,
        dispatch_id: input.dispatchId,
        run_url: `${appOrigin}/api/v1/automation/jobs/${input.jobId}/run`,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new AutomationDispatchError('UNAVAILABLE');
  } catch (error: unknown) {
    if (error instanceof AutomationDispatchError) throw error;
    throw new AutomationDispatchError('UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}
