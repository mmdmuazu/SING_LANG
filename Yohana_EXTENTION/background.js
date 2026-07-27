// Service worker for Live Speech Translator & Caption Overlay

chrome.runtime.onInstalled.addListener(() => {
  console.log("Live Speech Translator extension installed.");

  chrome.storage.sync.get(['speechSettings'], (data) => {
    if (!data.speechSettings) {
      chrome.storage.sync.set({
        speechSettings: {
          opacity: 0.9,
          targetLang: 'es',
          showAvatar: true,
          position: null, // {top, left} in px, null = default bottom-left
          size: null       // {width, height} in px, null = default
        }
      });
    }
  });
});

/**
 * Real translation call.
 * Uses MyMemory's free translation API (no key required, CORS-enabled).
 * Swap this function out for Google Cloud Translate / DeepL / OpenAI etc.
 * if you have an API key and want higher quality or higher volume.
 */
async function translateText(text, targetLang, sourceLang = 'en') {
  if (!text || !text.trim()) return '';
  if (targetLang === sourceLang) return text;

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Translation request failed: ${res.status}`);
  }
  const data = await res.json();

  if (data && data.responseData && typeof data.responseData.translatedText === 'string') {
    return data.responseData.translatedText;
  }
  throw new Error('Unexpected translation response shape');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'translate_audio_text') {
    translateText(request.text, request.targetLang, request.sourceLang || 'en')
      .then((translation) => sendResponse({ success: true, translation }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for the async response
  }
});
