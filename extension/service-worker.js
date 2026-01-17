const OFFSCREEN_DOCUMENT = "offscreen.html";
let creatingOffscreen = null;

const ensureOffscreenDocument = async () => {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ["USER_MEDIA"],
    justification: "Capture tab audio for sleep summaries."
  });
  await creatingOffscreen;
  creatingOffscreen = null;
};

const forwardToTab = (tabId, payload) => {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, payload);
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source === "sleep-detector-extension") {
    const tabId = sender.tab?.id;

    if (message.type === "tab-capture-start") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing tab id." });
        return;
      }
      ensureOffscreenDocument()
        .then(() => {
          chrome.runtime.sendMessage({
            source: "sleep-detector-service-worker",
            type: "tab-capture-start",
            tabId
          });
          sendResponse({ ok: true });
        })
        .catch((error) => {
          sendResponse({ ok: false, error: error?.message || "Failed to init capture." });
        });
      return true;
    }

    if (message.type === "tab-capture-stop") {
      if (!tabId) {
        sendResponse({ ok: false, error: "Missing tab id." });
        return;
      }
      chrome.runtime.sendMessage({
        source: "sleep-detector-service-worker",
        type: "tab-capture-stop",
        tabId
      });
      sendResponse({ ok: true });
      return true;
    }
  }

  if (message?.source === "sleep-detector-offscreen") {
    if (message.type === "tab-capture-data") {
      forwardToTab(message.tabId, {
        source: "sleep-detector-tab-capture",
        type: "tab-capture-data",
        audioBuffer: message.audioBuffer,
        mimeType: message.mimeType,
        byteLength: message.byteLength
      });
    }

    if (message.type === "tab-capture-error") {
      forwardToTab(message.tabId, {
        source: "sleep-detector-tab-capture",
        type: "tab-capture-error",
        error: message.error
      });
    }
  }
});
