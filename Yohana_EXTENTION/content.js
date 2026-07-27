// Live Speech Translator & Caption Overlay - content script
(function () {
  if (document.getElementById("g-speech-overlay-container")) return;

  console.log("Initializing Live Speech Translator overlay...");

  let settings = {
    opacity: 0.9,
    targetLang: 'es',
    showAvatar: true,
    position: null,
    size: null
  };

  // ---------- Build overlay DOM ----------
  const overlay = document.createElement("div");
  overlay.id = "g-speech-overlay-container";
  overlay.className = "g-speech-overlay theme-dark";

  overlay.innerHTML = `
    <div class="g-speech-header" id="g-speech-drag-handle">
      <div class="g-speech-title">
        <span class="g-live-dot"></span>
        <span>Live Speech Translator</span>
      </div>
      <div class="g-speech-actions">
        <button id="g-btn-avatar" title="Toggle Sign Avatar Container">🤟</button>
        <button id="g-btn-reset" title="Reset position & size">⤢</button>
        <button id="g-btn-minimize" title="Minimize">—</button>
      </div>
    </div>

    <div class="g-speech-body" id="g-speech-body">
      <div class="g-avatar-container" id="g-avatar-frame">
        <div class="g-avatar-3d-box">
          <div class="g-avatar-head"></div>
          <div class="g-avatar-body"></div>
          <div class="g-avatar-hand left"></div>
          <div class="g-avatar-hand right"></div>
        </div>
        <div class="g-avatar-status" id="g-avatar-status">Avatar placeholder</div>
      </div>

      <div class="g-transcript-scroll" id="g-transcript-box">
        <div class="g-transcript-line placeholder">
          <span class="g-badge">LIVE</span>
          <span>Listening... start the video or speak to begin transcription.</span>
        </div>
      </div>
    </div>

    <div class="g-speech-footer">
      <span class="g-lang-tag" id="g-lang-tag">Lang: EN → ES</span>
      <span class="g-brand">Live Translator</span>
    </div>
    <div class="g-resize-handle" id="g-resize-handle" title="Drag to resize"></div>
  `;

  document.body.appendChild(overlay);

  const dragHandle = overlay.querySelector('#g-speech-drag-handle');
  const resizeHandle = overlay.querySelector('#g-resize-handle');
  const avatarFrame = overlay.querySelector('#g-avatar-frame');
  const transcriptBox = overlay.querySelector('#g-transcript-box');
  const langTag = overlay.querySelector('#g-lang-tag');
  const btnAvatar = overlay.querySelector('#g-btn-avatar');
  const btnMinimize = overlay.querySelector('#g-btn-minimize');
  const btnReset = overlay.querySelector('#g-btn-reset');

  const LANG_LABELS = { en: 'EN', es: 'ES', fr: 'FR', asl: 'ASL' };

  function updateLangTag() {
    langTag.textContent = `Lang: EN → ${LANG_LABELS[settings.targetLang] || settings.targetLang.toUpperCase()}`;
  }

  // ---------- Persisted position & size ----------
  function applyPosition(pos) {
    if (!pos) {
      overlay.style.top = '';
      overlay.style.left = '';
      overlay.style.bottom = '16px';
      overlay.style.right = '';
      overlay.style.setProperty('left', '16px');
      return;
    }
    overlay.style.bottom = '';
    overlay.style.right = '';
    overlay.style.top = pos.top + 'px';
    overlay.style.left = pos.left + 'px';
  }

  function applySize(size) {
    if (!size) {
      overlay.style.width = '420px';
      overlay.style.height = '280px';
      return;
    }
    overlay.style.width = size.width + 'px';
    overlay.style.height = size.height + 'px';
  }

  function persistLayout() {
    chrome.storage.sync.set({
      speechSettings: { ...settings }
    });
  }

  function clampToViewport() {
    const rect = overlay.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;
    let left = rect.left;
    let top = rect.top;
    if (left < 0) left = 0;
    if (top < 0) top = 0;
    if (left > maxLeft) left = Math.max(0, maxLeft);
    if (top > maxTop) top = Math.max(0, maxTop);
    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    overlay.style.bottom = '';
    overlay.style.right = '';
  }

  // ---------- Dragging (move overlay anywhere on screen) ----------
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragHandle.addEventListener('pointerdown', (e) => {
    // Ignore drags started on header buttons
    if (e.target.closest('button')) return;
    dragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    overlay.classList.add('g-dragging');
    dragHandle.setPointerCapture(e.pointerId);
  });

  dragHandle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    const rect = overlay.getBoundingClientRect();
    left = Math.min(Math.max(0, left), window.innerWidth - rect.width);
    top = Math.min(Math.max(0, top), window.innerHeight - rect.height);

    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    overlay.style.bottom = '';
    overlay.style.right = '';
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('g-dragging');
    const rect = overlay.getBoundingClientRect();
    settings.position = { top: rect.top, left: rect.left };
    persistLayout();
  }
  dragHandle.addEventListener('pointerup', endDrag);
  dragHandle.addEventListener('pointercancel', endDrag);

  // ---------- Resizing (adjustable size, any corner drag) ----------
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let startWidth = 0;
  let startHeight = 0;

  resizeHandle.addEventListener('pointerdown', (e) => {
    resizing = true;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    const rect = overlay.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    overlay.classList.add('g-resizing');
    resizeHandle.setPointerCapture(e.pointerId);
    e.stopPropagation();
  });

  resizeHandle.addEventListener('pointermove', (e) => {
    if (!resizing) return;
    const newWidth = Math.max(300, startWidth + (e.clientX - resizeStartX));
    const newHeight = Math.max(180, startHeight + (e.clientY - resizeStartY));
    overlay.style.width = newWidth + 'px';
    overlay.style.height = newHeight + 'px';
  });

  function endResize(e) {
    if (!resizing) return;
    resizing = false;
    overlay.classList.remove('g-resizing');
    const rect = overlay.getBoundingClientRect();
    settings.size = { width: rect.width, height: rect.height };
    persistLayout();
  }
  resizeHandle.addEventListener('pointerup', endResize);
  resizeHandle.addEventListener('pointercancel', endResize);

  window.addEventListener('resize', clampToViewport);

  // ---------- Header buttons ----------
  let minimized = false;
  btnMinimize.addEventListener('click', () => {
    minimized = !minimized;
    overlay.classList.toggle('g-minimized', minimized);
    btnMinimize.textContent = minimized ? '▢' : '—';
  });

  btnAvatar.addEventListener('click', () => {
    settings.showAvatar = !settings.showAvatar;
    avatarFrame.style.display = settings.showAvatar ? 'flex' : 'none';
    persistLayout();
  });

  btnReset.addEventListener('click', () => {
    settings.position = null;
    settings.size = null;
    applyPosition(null);
    applySize(null);
    persistLayout();
  });

  // ---------- Transcript + real-time translation ----------
  function addTranscriptLine(originalText) {
    const line = document.createElement("div");
    line.className = "g-transcript-line final";
    line.innerHTML = `
      <span class="time">${new Date().toLocaleTimeString().slice(0, 5)}</span>
      <span class="text-original">${escapeHtml(originalText)}</span>
      <span class="text-translated pending">translating…</span>
    `;
    transcriptBox.appendChild(line);
    transcriptBox.scrollTop = transcriptBox.scrollHeight;

    // Fire translation the instant this phrase finalizes.
    chrome.runtime.sendMessage(
      { action: "translate_audio_text", text: originalText, targetLang: settings.targetLang, sourceLang: 'en' },
      (response) => {
        const translatedEl = line.querySelector('.text-translated');
        if (!translatedEl) return; // line may have scrolled out / been removed
        if (response && response.success) {
          translatedEl.textContent = response.translation;
          translatedEl.classList.remove('pending');
        } else {
          translatedEl.textContent = '(translation failed)';
          translatedEl.classList.remove('pending');
          translatedEl.classList.add('error');
        }
      }
    );

    triggerAvatarGesture(originalText);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function triggerAvatarGesture(text) {
    const avatarStatus = document.getElementById("g-avatar-status");
    if (avatarStatus) {
      avatarStatus.innerText = "Signing: " + text.slice(0, 24) + (text.length > 24 ? '…' : '');
      avatarStatus.classList.add("active");
      setTimeout(() => avatarStatus.classList.remove("active"), 3000);
    }
  }

  // ---------- Speech recognition (microphone-based) ----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let interimLineEl = null;

    recognition.onresult = (event) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          addTranscriptLine(transcript.trim());
          if (interimLineEl) {
            interimLineEl.remove();
            interimLineEl = null;
          }
        } else {
          interim += transcript;
        }
      }

      if (interim) {
        if (!interimLineEl) {
          interimLineEl = document.createElement("div");
          interimLineEl.className = "g-transcript-line interim";
          transcriptBox.appendChild(interimLineEl);
        }
        interimLineEl.innerHTML = `<span class="g-badge">…</span> <span class="text-original">${escapeHtml(interim)}</span>`;
        transcriptBox.scrollTop = transcriptBox.scrollHeight;
      }
    };

    recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
    };

    recognition.onend = () => {
      // Auto-restart if the video is still playing (recognition sessions time out on their own)
      const video = document.querySelector('video');
      if (video && !video.paused) {
        try { recognition.start(); } catch (_) { /* already running */ }
      }
    };

    const tryAttachToVideo = () => {
      const video = document.querySelector('video');
      if (!video) return false;
      video.addEventListener('play', () => {
        try { recognition.start(); } catch (_) { /* already running */ }
      });
      video.addEventListener('pause', () => {
        try { recognition.stop(); } catch (_) { /* already stopped */ }
      });
      if (!video.paused) {
        try { recognition.start(); } catch (_) { /* noop */ }
      }
      return true;
    };

    if (!tryAttachToVideo()) {
      const observer = new MutationObserver(() => {
        if (tryAttachToVideo()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  } else {
    transcriptBox.innerHTML = `<div class="g-transcript-line placeholder">Speech recognition isn't supported in this browser.</div>`;
  }

  // ---------- Load settings & wire up popup messages ----------
  function applyAllSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    overlay.style.opacity = settings.opacity;
    avatarFrame.style.display = settings.showAvatar ? 'flex' : 'none';
    applyPosition(settings.position);
    applySize(settings.size);
    updateLangTag();
  }

  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['speechSettings'], (data) => {
      if (data.speechSettings) applyAllSettings(data.speechSettings);
      else { applyPosition(null); applySize(null); updateLangTag(); }
    });
  } else {
    applyPosition(null);
    applySize(null);
    updateLangTag();
  }

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "update_settings") {
      applyAllSettings(request.settings);
    }
  });
})();
