// Background service worker for handling audio notifications
let isExtensionEnabled = true;

// Initialize extension state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'playNotificationSound') {
    playNotificationSound(sender.tab?.id).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error playing notification sound:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep message channel open for async response
  }
  
  if (request.action === 'getExtensionState') {
    chrome.storage.sync.get(['enabled'], (result) => {
      sendResponse({ enabled: result.enabled !== false });
    });
    return true;
  }
  
  if (request.action === 'setExtensionState') {
    chrome.storage.sync.set({ enabled: request.enabled }, () => {
      isExtensionEnabled = request.enabled;
      sendResponse({ success: true });
    });
    return true;
  }
});

// Function to play notification sound by sending message to content script
async function playNotificationSound(tabId) {
  try {
    // Check if extension is enabled (keep this in sync storage since it's small)
    const result = await chrome.storage.sync.get(['enabled']);
    if (result.enabled === false) {
      return;
    }

    // Get active tab if no tabId provided
    let targetTabId = tabId;
    if (!targetTabId) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0) {
        targetTabId = tabs[0].id;
      } else {
        throw new Error('No active tab found');
      }
    }

    // Send message to content script to play sound (it will access storage directly)
    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(targetTabId, { 
        action: 'playCustomNotificationSound'
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Failed to play sound'));
        }
      });
    });
    
  } catch (error) {
    console.error('Error in playNotificationSound:', error);
    throw error;
  }
}

// Handle extension state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.enabled) {
    isExtensionEnabled = changes.enabled.newValue;
  }
});
