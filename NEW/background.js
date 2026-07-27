// Background service worker for the extension.
// Responsibilities:
//  - Persist transcript state so it survives side panel close/reopen.
//  - Open the side panel when the toolbar icon is clicked.
//  - Keep the toolbar badge in sync with listening status.

const DEFAULT_STATE = {
  isListening: false,
  transcript: "",
  interimText: "",
  finalLines: []
};

let sharedState = { ...DEFAULT_STATE };

function persistState(nextState) {
  sharedState = { ...sharedState, ...nextState };
  chrome.storage.local.set({ transcriptState: sharedState });

  if (chrome.action) {
    chrome.action.setBadgeBackgroundColor({ color: "#38bdf8" });
    chrome.action.setBadgeText({ text: sharedState.isListening ? "ON" : "" });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  persistState(DEFAULT_STATE);
  chrome.storage.local.set({ tourCompleted: false });

  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case "transcript-state":
      persistState(message.payload || {});
      sendResponse({ ok: true });
      return false;

    case "get-state":
      chrome.storage.local.get(["transcriptState"], (result) => {
        sendResponse(result.transcriptState || sharedState);
      });
      return true; // keep the message channel open for the async response

    case "reset-state":
      persistState({ ...DEFAULT_STATE });
      sendResponse({ ok: true });
      return false;

    default:
      return false;
  }
});
