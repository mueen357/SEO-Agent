/**
 * Website Audit Agent - Extension Messaging Protocol Types
 */

import type { ActiveTabInfo, QuickAuditResult, BackendHealthResponse } from './audit';

export type MessageAction =
  | 'GET_ACTIVE_TAB'
  | 'EXECUTE_QUICK_AUDIT'
  | 'OPEN_SIDE_PANEL'
  | 'GET_STORED_AUDIT'
  | 'SAVE_AUDIT'
  | 'CHECK_BACKEND_HEALTH';

export interface ExtensionMessage<T = unknown> {
  action: MessageAction;
  payload?: T;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface StoredAuditState {
  audit: QuickAuditResult | null;
  tabUrl: string | null;
  timestamp: number | null;
}