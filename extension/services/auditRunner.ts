/**
 * Audit Execution Coordinator
 *
 * Uses chrome.scripting.executeScript with activeTab for on-demand programmatic audit.
 * Avoids broad declarative content scripts.
 */

import type { QuickAuditResult } from '../types/audit';
import { extractPageAudit } from './extractor';
import { saveAuditResult } from './storage';
import { isAuditableUrl } from '../utils/url';

export async function runQuickAudit(tabId?: number, tabUrl?: string): Promise<QuickAuditResult> {
  if (!tabId || !tabUrl) {
    throw new Error('Valid Tab ID and URL are required to execute a Quick Audit.');
  }

  const check = isAuditableUrl(tabUrl);
  if (!check.isAuditable) {
    throw new Error(check.reason || 'This page cannot be audited.');
  }

  if (!chrome.scripting) {
    throw new Error('Chrome scripting permission is not available.');
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractPageAudit,
    });

    if (results && results[0] && results[0].result) {
      const auditData = results[0].result as QuickAuditResult;
      await saveAuditResult(auditData);
      return auditData;
    }

    throw new Error('No audit data returned from script execution.');
  } catch (scriptErr: unknown) {
    throw new Error(`Failed to extract audit data: ${scriptErr instanceof Error ? scriptErr.message : String(scriptErr)}`);
  }
}
