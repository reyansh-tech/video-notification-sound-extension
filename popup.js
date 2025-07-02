// Popup script for extension controls
document.addEventListener('DOMContentLoaded', function() {
  const enableToggle = document.getElementById('enableToggle');
  const testSoundBtn = document.getElementById('testSound');
  const statusElement = document.getElementById('status');
  const soundFileInput = document.getElementById('soundFile');
  const resetSoundBtn = document.getElementById('resetSound');
  const fileLabel = document.querySelector('.file-text');
  
  // Load current extension state
  loadExtensionState();
  loadCustomSoundState();
  
  // Handle toggle change
  enableToggle.addEventListener('change', function() {
    const enabled = enableToggle.checked;
    
    chrome.runtime.sendMessage({
      action: 'setExtensionState',
      enabled: enabled
    }, (response) => {
      if (response && response.success) {
        updateStatus(enabled);
        
        // Notify all content scripts about the state change
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'extensionStateChanged',
              enabled: enabled
            }).catch(() => {
              // Ignore errors for tabs that don't have content scripts
            });
          });
        });
      } else {
        console.error('Failed to update extension state');
        // Revert toggle if update failed
        enableToggle.checked = !enabled;
      }
    });
  });
  
  // Handle test sound button
  testSoundBtn.addEventListener('click', function() {
    testSoundBtn.disabled = true;
    testSoundBtn.textContent = 'Playing...';
    
    chrome.runtime.sendMessage({ action: 'playNotificationSound' }, (response) => {
      setTimeout(() => {
        testSoundBtn.disabled = false;
        testSoundBtn.textContent = 'Test Sound';
        
        if (chrome.runtime.lastError) {
          console.error('Chrome runtime error:', chrome.runtime.lastError);
          showTemporaryMessage('Extension error: ' + chrome.runtime.lastError.message, 'error');
        } else if (response && response.success !== false) {
          showTemporaryMessage('Sound played successfully!', 'success');
        } else {
          const errorMsg = response?.error || 'Unknown error playing sound';
          console.error('Sound play error:', errorMsg);
          showTemporaryMessage('Failed to play sound: ' + errorMsg, 'error');
        }
      }, 500);
    });
  });
  
  // Handle custom sound file upload
  soundFileInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showTemporaryMessage('File too large. Please choose a file under 5MB.', 'error');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const audioData = e.target.result;
        
        // Store the custom sound in chrome storage (using local storage for larger files)
        chrome.storage.local.set({
          customSoundData: audioData,
          customSoundName: file.name,
          useCustomSound: true
        }, () => {
          fileLabel.textContent = file.name;
          showTemporaryMessage('Custom sound uploaded successfully!', 'success');
        });
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Handle reset to default sound
  resetSoundBtn.addEventListener('click', function() {
    chrome.storage.local.set({
      useCustomSound: false,
      customSoundData: null,
      customSoundName: null
    }, () => {
      fileLabel.textContent = 'Choose Custom Sound';
      showTemporaryMessage('Reset to default sound', 'success');
    });
  });
  
  // Load extension state from storage
  function loadExtensionState() {
    chrome.runtime.sendMessage({ action: 'getExtensionState' }, (response) => {
      if (response) {
        const enabled = response.enabled !== false;
        enableToggle.checked = enabled;
        updateStatus(enabled);
      } else {
        updateStatus(false);
      }
    });
  }
  
  // Update status display
  function updateStatus(enabled) {
    const statusText = statusElement.querySelector('.status-text');
    if (enabled) {
      statusText.textContent = 'Active - Videos will trigger notifications';
      statusElement.className = 'status status-active';
    } else {
      statusText.textContent = 'Disabled - No notifications will play';
      statusElement.className = 'status status-disabled';
    }
  }
  
  // Show temporary message
  function showTemporaryMessage(message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = `message message-${type}`;
    messageElement.textContent = message;
    
    const container = document.querySelector('.container');
    container.appendChild(messageElement);
    
    setTimeout(() => {
      messageElement.classList.add('fade-out');
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageElement.parentNode.removeChild(messageElement);
        }
      }, 300);
    }, 2000);
  }
  
  // Load custom sound state
  function loadCustomSoundState() {
    chrome.storage.local.get(['useCustomSound', 'customSoundName'], (result) => {
      if (result.useCustomSound && result.customSoundName) {
        fileLabel.textContent = result.customSoundName;
      } else {
        fileLabel.textContent = 'Choose Custom Sound';
      }
    });
  }
});
