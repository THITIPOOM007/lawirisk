import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('Recon Companion installer regression', () => {
  const builder = read('scripts/build-recon-distribution.mjs');
  const protocolInstaller = read('scripts/recon/install-protocol.ps1');
  const protocolHandler = read('scripts/recon/protocol-handler.ps1');
  const bridgeStarter = read('scripts/recon/start-bridge.ps1');
  const sourcePage = read('src/app/sources/page.tsx');

  it('ships a one-click launcher and a diagnosable PowerShell fallback', () => {
    expect(builder).toContain("path.join(output, 'install.cmd')");
    expect(builder).toContain('ExecutionPolicy Bypass');
    expect(builder).toContain('Start-Transcript');
    expect(builder).toContain('install.log');
    expect(builder).toContain("[int]$Matches[1] -lt 20");
    expect(builder).toContain('`\\uFEFF${installer}`');
    expect(builder).toContain("if (file.endsWith('.ps1'))");
    expect(builder).toContain('`\\uFEFF${contents}`');
  });

  it('pins the Node executable and verifies that the restarted loopback bridge is ready', () => {
    expect(protocolInstaller).toContain('node-path.txt');
    expect(protocolInstaller).toContain("CommandLine -like '*local-bridge.mjs*'");
    expect(protocolInstaller).toContain("Invoke-WebRequest -Uri 'http://127.0.0.1:32147/health'");
    expect(protocolHandler).toContain('node-path.txt');
    expect(bridgeStarter).toContain('bridge.log');
  });

  it('presents the one-click installer without requiring the PowerShell context menu', () => {
    expect(sourcePage).toContain('href="/recon/install.cmd"');
    expect(sourcePage).toContain('ดาวน์โหลดตัวติดตั้ง 1 คลิก');
    expect(sourcePage).toContain('ดับเบิลคลิกเพื่อติดตั้ง Chromium');
    expect(sourcePage).not.toContain('คลิกขวาไฟล์แล้วเลือก Run with PowerShell');
  });
});
