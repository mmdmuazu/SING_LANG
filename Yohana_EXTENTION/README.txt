Live Speech Translator & Caption Overlay
=========================================

WHAT THIS DOES
--------------
- Adds a floating overlay to YouTube watch/embed pages.
- Uses your browser's built-in microphone speech recognition (Web Speech API)
  to transcribe speech in real time.
- The instant each phrase is finalized, it is sent for translation and the
  translated line appears right under the original ("translating..." shows
  briefly while the request is in flight).
- Translation is powered by MyMemory's free translation API (no key needed).
  Swap the translateText() function in background.js for Google Cloud
  Translate, DeepL, or an OpenAI call if you want higher quality/volume.
- The overlay can be dragged by its header to ANY position on the screen,
  and resized from the bottom-right corner handle. Position and size are
  saved and restored automatically (chrome.storage.sync).
- The "sign language avatar" is still a visual placeholder (a simple CSS
  shape) - it flashes when a phrase is captioned but does not render actual
  sign language. Building a real avatar would need a sign-language
  animation/rendering engine, which is a separate, much larger project.

IMPORTANT LIMITATION
---------------------
Chrome's built-in speech recognition can only listen to your MICROPHONE, not
capture a tab's internal audio directly. So this only transcribes the
video's audio if that audio is actually reaching your mic (e.g. playing
through speakers). It cannot silently read YouTube's audio stream. True
tab-audio capture would require chrome.tabCapture plus a paid streaming
speech-to-text service (Google Cloud Speech-to-Text, Deepgram, etc.) sent
over a websocket - a bigger architecture than a single content script.

INSTALLATION
-------------
1. Extract this ZIP to a folder on your computer.
2. Open Chrome and go to: chrome://extensions
3. Enable "Developer mode" (top right).
4. Click "Load unpacked" and select the extracted folder.
5. Open any YouTube video.
6. Allow microphone access when prompted.
7. The overlay appears bottom-left by default - drag it anywhere, resize it
   from the corner handle, and use the toolbar popup to change target
   language, opacity, and avatar visibility.
