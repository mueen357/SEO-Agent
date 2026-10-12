/**
 * Current Tab Detection and Lifecycle Service
 */

import type { ActiveTabInfo } from '../types/audit';
import { isAuditableUrl } from '../utils/url';

export async function getActiveTab(): Promise<ActiveTabInfo> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    return {
      isAuditable: false,
      unsupportedReason: 'Chrome extension APIs unavailable in current execution context.'
    };
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab) {
      return {
        isAuditable: false,
        unsupportedReason: 'No active browser tab found.'
      };
    }

    const rawUrl = tab.url || tab.pendingUrl || '';
    const auditCheck = isAuditableUrl(rawUrl);

    let hostname = '';
    let origin = '';
    if (auditCheck.isAuditable) {
      try {
        const u = new URL(rawUrl);
        hostname = u.hostname;
        origin = u.origin;
      } catch {
        // Ignored
      }
    }

    return {
      id: tab.id,
      url: rawUrl,
      origin,
      hostname,
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      isAuditable: auditCheck.isAuditable,
      unsupportedReason: auditCheck.reason
    };
  } catch (err: unknown) {
    return {
      isAuditable: false,
      unsupportedReason: `Failed to inspect active tab: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}