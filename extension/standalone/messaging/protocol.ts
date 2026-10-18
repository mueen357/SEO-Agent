/**
 * Typed Runtime Message Protocol for Standalone In-Browser Audit.
 * Manifest V3 compliant communication between Background Service Worker,
 * Extension Side Panel UI, and Offscreen Documents.
 */

import type {
  StandaloneAuditConfig,
  StandaloneAuditJob,
  StandaloneAuditStatus,
} from '../types';
import type { ParsedHtmlEvidence } from '../audit/domParserEngine';

// ==========================================
// Request Message Schemas (Sent to Background)
// ==========================================

export interface StartAuditRequest {
  type: 'START_AUDIT';
  payload: {
    targetUrl: string;
    options?: Partial<StandaloneAuditConfig>;
  };
}

export interface CancelAuditRequest {
  type: 'CANCEL_AUDIT';
  payload?: {
    auditId?: string;
  };
}

export interface GetStatusRequest {
  type: 'GET_STATUS';
  payload?: {
    auditId?: string;
  };
}

export interface ResumeAuditRequest {
  type: 'RESUME_AUDIT';
  payload?: {
    auditId?: string;
  };
}

export interface OpenSidePanelRequest {
  type: 'OPEN_SIDE_PANEL';
  payload?: {
    windowId?: number;
  };
}

export interface OpenSidepanelTabRequest {
  type: 'OPEN_SIDEPANEL_TAB';
}

export interface ParseHtmlOffscreenRequest {
  type: 'PARSE_HTML_OFFSCREEN';
  payload: {
    html: string;
    pageUrl: string;
  };
}

export type StandaloneRuntimeRequest =
  | StartAuditRequest
  | CancelAuditRequest
  | GetStatusRequest
  | ResumeAuditRequest
  | OpenSidePanelRequest
  | OpenSidepanelTabRequest
  | ParseHtmlOffscreenRequest;

// ==========================================
// Direct Response Schemas (Returned to Caller)
// ==========================================

export interface AuditAcceptedResponse {
  success: true;
  type: 'AUDIT_ACCEPTED';
  auditId: string;
  sequence: number;
  status: StandaloneAuditStatus;
  stage: string;
  progress: number;
  job: StandaloneAuditJob;
}

export interface AuditRejectedResponse {
  success: false;
  type: 'AUDIT_REJECTED';
  error: string;
}

export interface AuditStatusResponse {
  success: boolean;
  type: 'AUDIT_STATUS';
  job: StandaloneAuditJob | null;
  error?: string;
}

export interface AuditCancelResponse {
  success: boolean;
  type: 'AUDIT_CANCELLED';
  cancelled: boolean;
}

export interface ParseHtmlResponse {
  success: boolean;
  type: 'PARSE_HTML_RESULT';
  evidence?: ParsedHtmlEvidence;
  error?: string;
}

export type StandaloneRuntimeResponse =
  | AuditAcceptedResponse
  | AuditRejectedResponse
  | AuditStatusResponse
  | AuditCancelResponse
  | ParseHtmlResponse
  | { success: boolean; error?: string; tabId?: number };

// ==========================================
// Broadcast Event Schemas (Sent to Sidepanel)
// ==========================================

export interface AuditProgressEvent {
  type: 'AUDIT_PROGRESS';
  auditId: string;
  sequence: number;
  status: StandaloneAuditStatus;
  stage: string;
  progress: number;
  job: StandaloneAuditJob;
}

export interface AuditCompletedEvent {
  type: 'AUDIT_COMPLETED';
  auditId: string;
  sequence: number;
  status: 'completed';
  stage: string;
  progress: 100;
  job: StandaloneAuditJob;
}

export interface AuditFailedEvent {
  type: 'AUDIT_FAILED';
  auditId: string;
  sequence: number;
  status: 'error';
  stage: string;
  progress: number;
  error: string;
  job?: StandaloneAuditJob;
}

export interface AuditCancelledEvent {
  type: 'AUDIT_CANCELLED';
  auditId: string;
  sequence: number;
  status: 'cancelled';
  stage: string;
  progress: number;
  job?: StandaloneAuditJob;
}

export type StandaloneBroadcastEvent =
  | AuditProgressEvent
  | AuditCompletedEvent
  | AuditFailedEvent
  | AuditCancelledEvent;

// Legacy compatibility event
export interface LegacyAuditProgressEvent {
  action: 'STANDALONE_AUDIT_PROGRESS';
  payload: {
    job: StandaloneAuditJob;
  };
}

export function isStandaloneBroadcast(msg: any): msg is StandaloneBroadcastEvent {
  if (!msg || typeof msg !== 'object') return false;
  return (
    msg.type === 'AUDIT_PROGRESS' ||
    msg.type === 'AUDIT_COMPLETED' ||
    msg.type === 'AUDIT_FAILED' ||
    msg.type === 'AUDIT_CANCELLED'
  );
}
