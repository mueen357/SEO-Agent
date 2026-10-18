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
  chrome.runtime.onMessage.addListener((message: any, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
    if (message.action === 'OPEN_SIDE_PANEL') {
      if (chrome.sidePanel && typeof chrome.sidePanel.open === 'function') {
        const windowId = message.payload?.windowId;
        if (windowId) {
          chrome.sidePanel.open({ windowId })
            .then(() => sendResponse({ success: true }))
            .catch((err: Error) => sendResponse({ success: false, error: err.message }));
          return true; // Keep message channel open for async response
        }
      }
      sendResponse({ success: false, error: 'Side panel API not available in this browser window.' });
      return true;
    }

    if (message.action === 'OPEN_SIDEPANEL_TAB') {
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html') })
          .then((tab) => sendResponse({ success: true, tabId: tab.id }))
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: 'tabs.create not available' });
      return true;
    }

    if (message.action === 'START_STANDALONE_AUDIT') {
      const { targetUrl, options } = message.payload || {};
      if (!targetUrl) {
        sendResponse({ success: false, error: 'targetUrl is required' });
        return true;
      }

      // Start audit in background worker context
      standaloneCoordinator.startAudit(targetUrl, options)
        .then((job) => sendResponse({ success: true, job }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));

      return true; // Keep channel open for async start
    }

    if (message.action === 'CANCEL_STANDALONE_AUDIT') {
      standaloneCoordinator.cancelAudit();
      sendResponse({ success: true, cancelled: true });
      return false;
    }

    if (message.action === 'GET_STANDALONE_AUDIT_STATUS') {
      const current = standaloneCoordinator.getCurrentJob();
      if (current) {
        sendResponse({ success: true, job: current });
      } else {
        StandaloneAuditStorage.getLatestJob()
          .then((job) => sendResponse({ success: true, job }))
          .catch((err: Error) => sendResponse({ success: false, error: err.message }));
        return true;
      }
      return false;
    }

    if (message.action === 'RESUME_STANDALONE_AUDIT') {
      standaloneCoordinator.checkAndResumeInterruptedJob()
        .then((job) => sendResponse({ success: true, job }))
        .catch((err: Error) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  });
});