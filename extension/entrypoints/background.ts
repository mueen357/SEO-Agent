import { standaloneCoordinator } from '../standalone/coordinator';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';

export default defineBackground(() => {
  console.log('[Website Audit Agent] Service worker initialized.');

  // Set up periodic alarm to keep long crawls resilient across service worker idle termination
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.get('standalone_audit_watchdog', (alarm) => {
      if (!alarm) {
        chrome.alarms.create('standalone_audit_watchdog', { periodInMinutes: 0.5 });
      }
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'standalone_audit_watchdog') {
        standaloneCoordinator.checkAndResumeInterruptedJob().catch((err) => {
          console.warn('[ServiceWorker] Alarm resume check error:', err);
        });
      }
    });
  }

  // Check for interrupted audits on startup
  standaloneCoordinator.checkAndResumeInterruptedJob().catch((err) => {
    console.warn('[ServiceWorker] Startup resume check error:', err);
  });

  // Handle runtime messages
  chrome.runtime.onMessage.addListener(
    (message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
      const type = message?.type || message?.action;

      if (type === 'OPEN_SIDE_PANEL') {
        if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
          const windowId = message.payload?.windowId;
          if (windowId) {
            chrome.sidePanel.open({ windowId })
              .then(() => sendResponse({ success: true }))
              .catch((err: Error) => sendResponse({ success: false, error: err.message }));
            return true;
          }
        }
        sendResponse({ success: false, error: 'Side panel API not available in this browser window.' });
        return true;
      }

      if (type === 'OPEN_SIDEPANEL_TAB') {
        if (chrome.tabs && chrome.tabs.create) {
          chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') })
            .then((tab) => sendResponse({ success: true, tabId: tab.id }))
            .catch((err: Error) => sendResponse({ success: false, error: err.message }));
          return true;
        }
        sendResponse({ success: false, error: 'tabs.create not available' });
        return true;
      }

      // Fast job start acknowledgment: validates, persists job, and returns AUDIT_ACCEPTED in milliseconds!
      if (type === 'START_AUDIT' || type === 'START_STANDALONE_AUDIT') {
        const { targetUrl, options } = message.payload || {};
        if (!targetUrl) {
          sendResponse({
            success: false,
            type: 'AUDIT_REJECTED',
            error: 'targetUrl is required to start an audit.',
          });
          return true;
        }

        standaloneCoordinator
          .initiateAudit(targetUrl, options)
          .then((job) => {
            sendResponse({
              success: true,
              type: 'AUDIT_ACCEPTED',
              auditId: job.id,
              sequence: job.sequence,
              status: job.status,
              stage: job.currentStage,
              progress: job.progressPercent,
              job,
            });
          })
          .catch((err: Error) => {
            sendResponse({
              success: false,
              type: 'AUDIT_REJECTED',
              error: err.message || 'Failed to start audit',
            });
          });

        return true; // Asynchronous acknowledgment dispatched within milliseconds
      }

      if (type === 'CANCEL_AUDIT' || type === 'CANCEL_STANDALONE_AUDIT') {
        const auditId = message.payload?.auditId;
        const cancelled = standaloneCoordinator.cancelAudit(auditId);
        sendResponse({
          success: true,
          type: 'AUDIT_CANCELLED',
          cancelled,
        });
        return false;
      }

      if (type === 'GET_STATUS' || type === 'GET_STANDALONE_AUDIT_STATUS') {
        const current = standaloneCoordinator.getCurrentJob();
        if (current) {
          sendResponse({
            success: true,
            type: 'AUDIT_STATUS',
            job: current,
          });
          return false;
        }

        StandaloneAuditStorage.getLatestJob()
          .then((job) => {
            sendResponse({
              success: true,
              type: 'AUDIT_STATUS',
              job: job || null,
            });
          })
          .catch((err: Error) => {
            sendResponse({
              success: false,
              type: 'AUDIT_STATUS',
              job: null,
              error: err.message,
            });
          });
        return true;
      }

      if (type === 'RESUME_AUDIT' || type === 'RESUME_STANDALONE_AUDIT') {
        standaloneCoordinator
          .checkAndResumeInterruptedJob()
          .then((job) => {
            sendResponse({
              success: true,
              type: 'AUDIT_STATUS',
              job,
            });
          })
          .catch((err: Error) => {
            sendResponse({
              success: false,
              type: 'AUDIT_STATUS',
              job: null,
              error: err.message,
            });
          });
        return true;
      }
    }
  );
});