/**
 * Chrome Local Storage Helper for Audits
 */

import type { QuickAuditResult } from '../types/audit';

const STORAGE_KEY_PREFIX = 'website_audit_';
const LATEST_KEY = 'website_audit_latest';

export async function saveAuditResult(result: QuickAuditResult): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${result.url}`;
    await chrome.storage.local.set({
      [key]: result,
      [LATEST_KEY]: result
    });
  } catch (err) {
    console.warn('Failed to save audit result to chrome.storage.local:', err);
  }
}

export async function getAuditResultForUrl(url: string): Promise<QuickAuditResult | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  try {
    const key = `${STORAGE_KEY_PREFIX}${url}`;
    const data = await chrome.storage.local.get([key, LATEST_KEY]);
    if (data[key]) {
      return data[key] as QuickAuditResult;
    }
    if (data[LATEST_KEY] && (data[LATEST_KEY] as QuickAuditResult).url === url) {
      return data[LATEST_KEY] as QuickAuditResult;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getLatestAuditResult(): Promise<QuickAuditResult | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return null;
  }

  try {
    const data = await chrome.storage.local.get(LATEST_KEY);
    return (data[LATEST_KEY] as QuickAuditResult) || null;
  } catch {
    return null;
  }
}

export async function clearAudits(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }
  try {
    await chrome.storage.local.clear();
  } catch {
    // Ignored
  }
}
const ACTIVE_FULL_AUDIT_KEY = 'website_audit_active_full_id';

export async function saveActiveFullAuditId(auditId: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({ [ACTIVE_FULL_AUDIT_KEY]: auditId });
  } catch (err) {
    console.warn('Failed to save active full audit ID:', err);
  }
}

export async function getActiveFullAuditId(): Promise<string | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  try {
    const data = await chrome.storage.local.get(ACTIVE_FULL_AUDIT_KEY);
    return (data[ACTIVE_FULL_AUDIT_KEY] as string) || null;
  } catch {
    return null;
  }
}

export async function clearActiveFullAuditId(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.remove(ACTIVE_FULL_AUDIT_KEY);
  } catch {
    // Ignored
  }
}
