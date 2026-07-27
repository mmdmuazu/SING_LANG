document.addEventListener('DOMContentLoaded', () => {
  const targetLang = document.getElementById('targetLang');
  const opacity = document.getElementById('opacity');
  const showAvatar = document.getElementById('showAvatar');
  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');

  let currentSettings = {
    opacity: 0.9,
    targetLang: 'es',
    showAvatar: true,
    position: null,
    size: null
  };

  chrome.storage.sync.get(['speechSettings'], (data) => {
    if (data.speechSettings) {
      currentSettings = { ...currentSettings, ...data.speechSettings };
      targetLang.value = currentSettings.targetLang;
      opacity.value = currentSettings.opacity;
      showAvatar.checked = currentSettings.showAvatar !== false;
    }
  });

  function pushToActiveTab(settings) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "update_settings", settings });
      }
    });
  }

  saveBtn.addEventListener('click', () => {
    currentSettings = {
      ...currentSettings,
      targetLang: targetLang.value,
      opacity: parseFloat(opacity.value),
      showAvatar: showAvatar.checked
    };
    chrome.storage.sync.set({ speechSettings: currentSettings }, () => {
      pushToActiveTab(currentSettings);
      window.close();
    });
  });

  resetBtn.addEventListener('click', () => {
    currentSettings = { ...currentSettings, position: null, size: null };
    chrome.storage.sync.set({ speechSettings: currentSettings }, () => {
      pushToActiveTab(currentSettings);
      window.close();
    });
  });
});
