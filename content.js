// Content script to detect video play events
(function() {
  'use strict';
  
  let isExtensionEnabled = true;
  let processedVideos = new WeakSet();
  let notificationPlaying = false;
  
  // Check extension state on load
  chrome.runtime.sendMessage({ action: 'getExtensionState' }, (response) => {
    if (response) {
      isExtensionEnabled = response.enabled;
    }
  });
  
  // Function to handle video play events
  function handleVideoPlay(event) {
    const video = event.target;
    
    // Skip if extension is disabled or notification is already playing
    if (!isExtensionEnabled || notificationPlaying) {
      return;
    }
    
    // Allow the same video to trigger notification again after some time
    if (processedVideos.has(video)) {
      const lastPlayTime = video.dataset.lastNotificationTime;
      const now = Date.now();
      if (lastPlayTime && (now - parseInt(lastPlayTime)) < 5000) { // 5 second cooldown
        return;
      }
    }
    
    // Prevent immediate video playback
    video.pause();
    processedVideos.add(video);
    video.dataset.lastNotificationTime = Date.now().toString();
    notificationPlaying = true;
    
    // Send message to background script to play notification
    chrome.runtime.sendMessage({ action: 'playNotificationSound' }, (response) => {
      if (response && response.success) {
        // Wait a bit for the notification sound to play, then resume video
        setTimeout(() => {
          if (!video.paused) {
            return; // Video is already playing
          }
          video.play().catch(error => {
            console.log('Video play failed:', error);
          });
          notificationPlaying = false;
        }, 400); // Delay to allow notification sound to play
      } else {
        // If notification failed, just play the video
        video.play().catch(error => {
          console.log('Video play failed:', error);
        });
        notificationPlaying = false;
      }
    });
  }
  
  // Function to add event listeners to video elements
  function addVideoListeners(video) {
    if (video.dataset.notificationListenerAdded) {
      return;
    }
    
    video.dataset.notificationListenerAdded = 'true';
    
    // Listen for play events
    video.addEventListener('play', handleVideoPlay, { once: false });
    
    // Also handle autoplay videos by listening for when they start loading
    video.addEventListener('loadstart', () => {
      if (video.autoplay && !video.paused) {
        handleVideoPlay({ target: video });
      }
    });
  }
  
  // Function to scan for video elements
  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(addVideoListeners);
  }
  
  // Initial scan
  scanForVideos();
  
  // Use MutationObserver to detect dynamically added videos
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if the added node is a video
            if (node.tagName === 'VIDEO') {
              addVideoListeners(node);
            }
            // Check for videos within the added node
            const videos = node.querySelectorAll && node.querySelectorAll('video');
            if (videos) {
              videos.forEach(addVideoListeners);
            }
          }
        });
      }
    });
  });
  
  // Start observing
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Listen for extension state changes and custom sound requests
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extensionStateChanged') {
      isExtensionEnabled = request.enabled;
      sendResponse({ success: true });
    } else if (request.action === 'playCustomNotificationSound') {
      playCustomNotificationSound().then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        console.error('Error playing custom notification sound:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Keep message channel open for async response
    }
  });
  
  // Function to play custom notification sound
  async function playCustomNotificationSound() {
    try {
      // Get custom sound settings from Chrome storage (using local storage for larger files)
      const storage = await chrome.storage.local.get(['useCustomSound', 'customSoundData']);
      console.log('Storage result:', { useCustomSound: storage.useCustomSound, hasCustomData: !!storage.customSoundData });
      
      if (storage.useCustomSound && storage.customSoundData) {
        console.log('Attempting to play custom sound, data length:', storage.customSoundData.length);
        // Play custom sound
        const audio = new Audio(storage.customSoundData);
        audio.volume = 0.5;
        
        // Handle audio loading and playing
        const playAudio = () => {
          return audio.play().then(() => {
            console.log('Custom notification sound played');
          }).catch(error => {
            console.error('Error playing custom sound:', error);
            // Fallback to default sound if custom fails
            return playDefaultSound();
          });
        };
        
        if (audio.readyState >= 2) { // HAVE_CURRENT_DATA or higher
          await playAudio();
        } else {
          await new Promise((resolve, reject) => {
            audio.addEventListener('canplay', () => {
              playAudio().then(resolve).catch(reject);
            }, { once: true });
            audio.addEventListener('error', () => {
              console.error('Error loading custom sound');
              playDefaultSound().then(resolve).catch(reject);
            }, { once: true });
          });
        }
      } else {
        await playDefaultSound();
      }
    } catch (error) {
      console.error('Error in playCustomNotificationSound:', error);
      await playDefaultSound();
    }
  }
  
  // Function to play default beep sound
  function playDefaultSound() {
    return new Promise((resolve, reject) => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const duration = 0.3;
        const frequency = 880;
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
        
        setTimeout(() => {
          try {
            oscillator.disconnect();
            gainNode.disconnect();
            console.log('Default notification sound played');
            resolve();
          } catch (e) {
            resolve();
          }
        }, duration * 1000 + 100);
        
      } catch (error) {
        console.error('Error playing default sound:', error);
        reject(error);
      }
    });
  }
  
  // Handle YouTube and other single-page applications
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      // URL changed, rescan for videos after a short delay
      setTimeout(scanForVideos, 1000);
    }
  }).observe(document, { subtree: true, childList: true });
  
})();
