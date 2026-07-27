Here's a full before/after comparison, file by file.

manifest.json
Before	After	Why
permissions: activeTab, tabCapture, scripting, offscreen, sidePanel, storage	permissions: storage, sidePanel	None of the removed permissions were ever used — recognition runs via the in-page SpeechRecognition API, not tab audio capture. Least-privilege = it looks more legitimate in the Chrome Web Store review and to users.
host_permissions: ["<all_urls>"]	removed entirely	Only existed to support the content script, which is gone.
content_scripts block (injects content.js into every page)	removed	See content.js below.
action.default_popup: "sidepanel.html"	action has no default_popup	You can't have both a popup and a side panel fight over the toolbar click. Removing the popup lets the side panel own the click.
no openPanelOnActionClick behavior	set in background.js on install	This is what makes clicking the toolbar icon actually open the side panel now that default_popup is gone.
content.js

Deleted. It only relayed transcript-state messages into window.postMessage on the page — but nothing on any page ever listened for that. It was inert. Removing it also let us drop <all_urls> and content_scripts from the manifest.

background.js
Old version broadcast every transcript update to every open tab via chrome.tabs.query + chrome.tabs.sendMessage — again, purely for content.js's benefit, which no longer exists. That loop is gone.
Added chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) on install — this is the piece that makes the toolbar icon open the panel now that the popup was removed.
Added a reset-state message handler (used by the new Clear button) and a badge color call, but the core persistState / get-state logic is otherwise the same as before.
sidepanel.html
Added disabled on the Stop button by default (matches actual state on load).
Added a Clear button next to Copy.
Added a "?" help button in the header to reopen the tour on demand.
Added the entire tour overlay markup (3 steps: welcome → enable microphone → ready), which didn't exist before.
sidepanel.js — the biggest change

Old behavior (the bug you were fixing): renderTranscript() ran on every single onresult event and did:

js
transcriptBox.innerHTML = lines.map(...).join("");

That nukes and rebuilds every line's DOM node on every partial speech result — dozens of times a sentence. That's exactly why it felt like new text was "instantly replacing" old text: there was no persistence of the old DOM nodes at all, no transition, and scroll position reset constantly.

New behavior:

appendFinalLine() creates one new DOM node per finished line, appended once, and never touched again — with a fade/slide-in transition (.line-enter class removed a frame later).
updateInterimLine() updates a single interim node in place instead of rebuilding the list.
isNearBottom() / scrollToBottom() only auto-scroll if you were already near the bottom — so scrolling up to read history doesn't get yanked back down.
trimOldestLinesIfNeeded() caps the DOM/array at 400 lines so long sessions don't grow unbounded — this is the literal "FIFO, sized to the overlay" behavior: old lines drop off the top once the transcript exceeds a sane length, new ones keep entering the bottom.
Added the full tour state machine (setTourStep, openTour, closeTour, requestMicrophoneAccess) and wired helpBtn/tourNextBtn/tourSkipBtn/enableMicBtn — none of this existed before.
Added clearTranscript() for the new Clear button.
styles.css
Added .tour-overlay, .tour-card, .tour-progress/.tour-dot, .tour-step, .tour-nav, .tour-hint — none existed before, needed for the new tour UI.
Added .line-enter transition state so new lines fade/slide in instead of popping.
Added button:disabled and button:focus-visible states (accessibility, wasn't there before).
Added .icon-btn for the header help button.
The bug-fix rule: .tour-overlay[hidden] { display: none; }. The base .tour-overlay rule sets display: flex, which has the same CSS specificity as the browser's built-in [hidden] { display: none } rule — and author styles beat the browser default on a tie. So setting .hidden = true in JS was always correct; the overlay just never actually disappeared until this rule was added to force it.
How it all fits together
Manifest trims permissions → background.js no longer needs the tab-broadcast code that existed only to feed content.js → content.js becomes pointless and is deleted → host_permissions/content_scripts can be dropped too. That's one clean chain of removals.
The tour is a self-contained addition (html markup + css + js state machine) that didn't touch the recognition logic at all.
The transcript rendering rewrite is the only change to how speech results are handled, and it directly targeted the "abrupt replace" complaint by switching from full-rebuild to incremental append/update.


