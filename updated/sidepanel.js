// UI logic for the side panel.
// The panel uses the browser SpeechRecognition API when available and keeps the
// transcript state in sync with the background worker for persistence.

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");
const helpBtn = document.getElementById("helpBtn");
const statusBadge = document.getElementById("statusBadge");
const liveIndicator = document.getElementById("liveIndicator");
const transcriptBox = document.getElementById("transcriptBox");

const tourOverlay = document.getElementById("tourOverlay");
const tourSteps = Array.from(document.querySelectorAll(".tour-step"));
const tourDots = Array.from(document.querySelectorAll(".tour-dot"));
const tourNextBtn = document.getElementById("tourNextBtn");
const tourSkipBtn = document.getElementById("tourSkipBtn");
const enableMicBtn = document.getElementById("enableMicBtn");
const micStatus = document.getElementById("micStatus");
const avatarStatus = document.getElementById("g-avatar-status");
const avatarFrame = document.getElementById("g-avatar-frame");

const MAX_RENDERED_LINES = 400; // upper bound so the transcript never grows unbounded

let recognition = null;
let isListening = false;
let finalLines = [];
let interimText = "";
let interimEl = null;
let micGranted = false;
let tourStep = 0;
let avatarGestureTimeout = null;

// ---------- Transcript rendering (incremental, FIFO-style) ----------
// Instead of rebuilding the whole transcript on every speech-recognition tick
// (which used to wipe and redraw everything, making new text feel like it was
// abruptly replacing old text), we append only what changed. Finished lines
// are appended once and never touched again; the single interim line is
// updated in place. Older lines scroll out of view at the top as new ones
// arrive at the bottom, sized to whatever the panel can currently show.

function clearEmptyState() {
  const empty = transcriptBox.querySelector(".empty-state");
  if (empty) empty.remove();
}

function showEmptyStateIfNeeded() {
  if (!finalLines.length && !interimText) {
    transcriptBox.innerHTML =
      '<div class="empty-state">No transcript yet. Press start listening to begin.</div>';
  }
}

function isNearBottom() {
  const threshold = 48;
  return (
    transcriptBox.scrollTop + transcriptBox.clientHeight >=
    transcriptBox.scrollHeight - threshold
  );
}

function scrollToBottom(smooth = true) {
  transcriptBox.scrollTo({
    top: transcriptBox.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

function trimOldestLinesIfNeeded() {
  while (finalLines.length > MAX_RENDERED_LINES) {
    finalLines.shift();
    const firstLine = transcriptBox.querySelector(".line:not(.pending)");
    if (firstLine) firstLine.remove();
  }
}

function appendFinalLine(text, { animate = true } = {}) {
  clearEmptyState();
  const wasNearBottom = isNearBottom();

  const el = document.createElement("div");
  el.className = animate ? "line line-enter" : "line";
  el.textContent = text;

  if (interimEl) {
    transcriptBox.insertBefore(el, interimEl);
  } else {
    transcriptBox.appendChild(el);
  }

  if (animate) {
    // Force layout so the transition actually plays, then let it settle in.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.remove("line-enter"));
    });
  }

  trimOldestLinesIfNeeded();

  if (wasNearBottom) scrollToBottom();
  triggerAvatarGesture(text);
}

function triggerAvatarGesture(text) {
  if (!avatarStatus) return;
  if (!text) {
    avatarStatus.textContent = "Ready to sign";
    avatarStatus.classList.remove("active");
    avatarFrame?.classList.remove("is-signing");
    return;
  }

  avatarStatus.textContent =
    "Signing: " + text.slice(0, 24) + (text.length > 24 ? "…" : "");
  avatarStatus.classList.add("active");
  avatarFrame?.classList.add("is-signing");

  window.clearTimeout(avatarGestureTimeout);
  avatarGestureTimeout = window.setTimeout(() => {
    avatarStatus.classList.remove("active");
    avatarFrame?.classList.remove("is-signing");
  }, 2800);
}

function updateInterimLine(text) {
  if (!text) {
    if (interimEl) {
      interimEl.remove();
      interimEl = null;
    }
    avatarFrame?.classList.remove("is-listening");
    showEmptyStateIfNeeded();
    return;
  }

  clearEmptyState();
  const wasNearBottom = isNearBottom();

  if (!interimEl) {
    interimEl = document.createElement("div");
    interimEl.className = "line pending";
    transcriptBox.appendChild(interimEl);
  }
  interimEl.textContent = text;
  avatarFrame?.classList.add("is-listening");

  if (wasNearBottom) scrollToBottom();
}

function rebuildTranscriptFromState() {
  transcriptBox.innerHTML = "";
  interimEl = null;
  finalLines.forEach((line) => appendFinalLine(line, { animate: false }));
  updateInterimLine(interimText);
  showEmptyStateIfNeeded();
  scrollToBottom(false);
}

// ---------- Status + persistence ----------

function updateStatus(nextListening) {
  isListening = nextListening;
  statusBadge.textContent = nextListening ? "Listening" : "Idle";
  statusBadge.classList.toggle("active", nextListening);
  liveIndicator.textContent = nextListening ? "● Listening" : "● Waiting";
  startBtn.disabled = nextListening;
  stopBtn.disabled = !nextListening;
}

function syncState() {
  const payload = {
    isListening,
    transcript: finalLines.join("\n"),
    interimText,
    finalLines,
  };

  chrome.runtime
    .sendMessage({ type: "transcript-state", payload })
    .catch(() => {});
}

// ---------- Speech recognition ----------

function initRecognition() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    transcriptBox.innerHTML =
      '<div class="empty-state">Speech recognition is not supported in this browser.</div>';
    startBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onstart = () => {
    updateStatus(true);
    syncState();
  };

  recognition.onerror = (event) => {
    const errorMessage = event?.error ? String(event.error) : "unknown error";
    console.error("Speech recognition error", errorMessage);

    if (
      errorMessage === "not-allowed" ||
      errorMessage === "service-not-allowed"
    ) {
      appendFinalLine(
        `⚠ Microphone access was blocked. Click the "?" button to run setup again. (${errorMessage})`,
      );
    } else {
      appendFinalLine(
        `⚠ Voice capture stopped: ${errorMessage}. Please try again.`,
      );
    }

    updateStatus(false);
  };

  recognition.onend = () => {
    updateStatus(false);
    avatarFrame?.classList.remove("is-listening", "is-signing");
    syncState();
  };

  recognition.onresult = (event) => {
    let liveText = "";

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        const finalText = result[0].transcript.trim();
        if (finalText) {
          finalLines.push(finalText);
          appendFinalLine(finalText);
        }
        interimText = "";
      } else {
        liveText += result[0].transcript;
      }
    }

    const lastResult = event.results[event.results.length - 1];
    interimText = lastResult && !lastResult.isFinal ? liveText.trim() : "";
    updateInterimLine(interimText);

    syncState();
  };
}

function startListening() {
  if (!recognition) {
    initRecognition();
  }
  if (recognition && !isListening) {
    recognition.start();
  }
}

function stopListening() {
  if (recognition && isListening) {
    recognition.stop();
  }
}

async function copyTranscript() {
  const text = [...finalLines, interimText].filter(Boolean).join("\n");
  if (!text) return;
  await navigator.clipboard.writeText(text);
  copyBtn.textContent = "Copied";
  window.setTimeout(() => {
    copyBtn.textContent = "Copy Text";
  }, 1200);
}

function clearTranscript() {
  finalLines = [];
  interimText = "";
  interimEl = null;
  transcriptBox.innerHTML = "";
  showEmptyStateIfNeeded();
  syncState();
}

// ---------- Onboarding tour ----------

function setTourStep(step) {
  tourStep = step;
  tourSteps.forEach((el) => {
    el.hidden = Number(el.dataset.step) !== step;
  });
  tourDots.forEach((dot) => {
    dot.classList.toggle("active", Number(dot.dataset.step) === step);
  });
  tourNextBtn.textContent = step === tourSteps.length - 1 ? "Finish" : "Next";

  if (step === 1) {
    checkMicPermissionState().then((state) => {
      if (state === "denied") {
        enableMicBtn.textContent = "Open Extension Settings";
        micStatus.textContent =
          "Microphone is currently blocked for this extension.";
        micStatus.className = "tour-hint error";
      } else if (state === "granted") {
        micGranted = true;
        enableMicBtn.textContent = "Microphone Enabled";
        micStatus.textContent = "Microphone access already granted.";
        micStatus.className = "tour-hint success";
      } else {
        enableMicBtn.textContent = "Enable Microphone";
      }
    });
  }
}

function openTour() {
  setTourStep(0);
  micStatus.textContent = "";
  micStatus.className = "tour-hint";
  tourOverlay.hidden = false;
  tourOverlay.setAttribute("aria-hidden", "false");
}

function closeTour({ focusStartButton = true } = {}) {
  tourOverlay.hidden = true;
  tourOverlay.setAttribute("aria-hidden", "true");
  chrome.storage.local.set({ tourCompleted: true }).catch(() => {});

  if (focusStartButton && startBtn) {
    startBtn.focus();
  }
}

function getMicSettingsUrl() {
  return `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}`;
}

function openMicSettings() {
  micStatus.textContent =
    "Microphone is blocked for this extension. Opening site settings — switch Microphone to Allow, then come back and try again.";
  micStatus.className = "tour-hint error";
  enableMicBtn.textContent = "Open Extension Settings";

  chrome.tabs.create({ url: getMicSettingsUrl() }).catch(() => {
    micStatus.textContent =
      "Microphone is blocked. Open chrome://extensions, find Live Voice Transcriber, then allow Microphone under its site settings.";
  });
}

async function checkMicPermissionState() {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state; // "granted" | "denied" | "prompt"
  } catch (err) {
    return "unknown";
  }
}

async function requestMicrophoneAccess() {
  enableMicBtn.disabled = true;
  micStatus.textContent = "Requesting access…";
  micStatus.className = "tour-hint";

  try {
    // If the permission was already denied, calling getUserMedia again will
    // just fail silently without ever showing the browser prompt again —
    // send the user straight to the settings page where they can flip it.
    const state = await checkMicPermissionState();
    if (state === "denied") {
      openMicSettings();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    micGranted = true;
    micStatus.textContent = "Microphone access granted.";
    micStatus.className = "tour-hint success";
    enableMicBtn.textContent = "Microphone Enabled";
  } catch (err) {
    micGranted = false;
    const errorName = err?.name || "";
    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      openMicSettings();
    } else {
      micStatus.textContent = `Couldn't access the microphone (${err?.message || "unknown error"}). Try again.`;
      micStatus.className = "tour-hint error";
    }
  } finally {
    enableMicBtn.disabled = false;
  }
}

tourNextBtn.addEventListener("click", () => {
  if (tourStep === tourSteps.length - 1) {
    closeTour();
    return;
  }
  setTourStep(tourStep + 1);
});

tourSkipBtn.addEventListener("click", () => closeTour());
enableMicBtn.addEventListener("click", requestMicrophoneAccess);
helpBtn.addEventListener("click", openTour);

// ---------- Wire up controls ----------

startBtn.addEventListener("click", startListening);
stopBtn.addEventListener("click", stopListening);
copyBtn.addEventListener("click", copyTranscript);
clearBtn.addEventListener("click", clearTranscript);

chrome.runtime
  .sendMessage({ type: "get-state" })
  .then((state) => {
    if (state?.finalLines?.length || state?.interimText) {
      finalLines = state.finalLines || [];
      interimText = state.interimText || "";
      rebuildTranscriptFromState();
    } else {
      showEmptyStateIfNeeded();
    }
  })
  .catch(() => {
    showEmptyStateIfNeeded();
  });

chrome.storage.local.get(["tourCompleted"], (result) => {
  if (!result.tourCompleted) {
    openTour();
  }
});

initRecognition();
