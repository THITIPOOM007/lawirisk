import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAllowedAutomationUrl, secureTokenMatches } from './automation-security';

describe('n8n automation security', () => {
  it('compares callback tokens without accepting missing or different values', () => {
    const token = 'a'.repeat(64);
    expect(secureTokenMatches(token, token)).toBe(true);
    expect(secureTokenMatches(token, 'b'.repeat(64))).toBe(false);
    expect(secureTokenMatches(token, null)).toBe(false);
    expect(secureTokenMatches('', token)).toBe(false);
  });

  it('requires HTTPS in production and permits only local HTTP in development', () => {
    expect(isAllowedAutomationUrl('https://n8n.example.go.th/webhook/lawirisk', true)).toBe(true);
    expect(isAllowedAutomationUrl('http://n8n.example.go.th/webhook/lawirisk', true)).toBe(false);
    expect(isAllowedAutomationUrl('http://127.0.0.1:5678/webhook/lawirisk', false)).toBe(true);
    expect(isAllowedAutomationUrl('https://user:pass@n8n.example.go.th/webhook', true)).toBe(false);
    expect(isAllowedAutomationUrl('not-a-url', true)).toBe(false);
  });

  it('ships an inactive importable workflow without embedded credentials', () => {
    const workflowPath = path.join(process.cwd(), 'n8n/lawirisk-text-extraction-v1.json');
    const raw = fs.readFileSync(workflowPath, 'utf8');
    const workflow = JSON.parse(raw) as { active: boolean; nodes: Array<{ type: string }>; settings: Record<string, unknown> };
    expect(workflow.active).toBe(false);
    expect(workflow.nodes.map((node) => node.type)).toEqual([
      'n8n-nodes-base.webhook',
      'n8n-nodes-base.httpRequest',
    ]);
    expect(workflow.settings.saveDataSuccessExecution).toBe('none');
    expect(raw).not.toMatch(/sb_secret_|service_role|AIza|N8N_CALLBACK_TOKEN|N8N_DISPATCH_TOKEN/);
  });
});
