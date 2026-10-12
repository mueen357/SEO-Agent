export default defineBackground(() => {
  console.log('[Website Audit Agent] Service worker initialized.');

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
  });
});