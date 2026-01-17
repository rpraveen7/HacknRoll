let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let activeTabId = null;

const getPreferredMimeType = () => {
  if (!window.MediaRecorder) return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
};

const cleanupStream = () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
  }
  mediaStream = null;
  mediaRecorder = null;
  recordedChunks = [];
};

const startCapture = () => new Promise((resolve) => {
  chrome.tabCapture.capture({ audio: true, video: false }, (stream) => {
    if (chrome.runtime.lastError || !stream) {
      resolve({
        ok: false,
        error: chrome.runtime.lastError?.message || "Tab capture failed."
      });
      return;
    }

    mediaStream = stream;
    const mimeType = getPreferredMimeType();
    const options = mimeType ? { mimeType, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 };
    mediaRecorder = new MediaRecorder(stream, options);
    recordedChunks = [];

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", async () => {
      const finalMimeType = mediaRecorder?.mimeType || "audio/webm";
      const blob = recordedChunks.length > 0 ? new Blob(recordedChunks, { type: finalMimeType }) : null;
      const audioBuffer = blob ? await blob.arrayBuffer() : null;
      const byteLength = audioBuffer ? audioBuffer.byteLength : 0;
      chrome.runtime.sendMessage({
        source: "sleep-detector-offscreen",
        type: "tab-capture-data",
        tabId: activeTabId,
        audioBuffer,
        mimeType: finalMimeType,
        byteLength
      });
      cleanupStream();
    });

    mediaRecorder.start(1000);
    resolve({ ok: true });
  });
});

const stopCapture = () => {
  if (!mediaRecorder) {
    chrome.runtime.sendMessage({
      source: "sleep-detector-offscreen",
      type: "tab-capture-error",
      tabId: activeTabId,
      error: "No active tab capture."
    });
    return;
  }
  mediaRecorder.stop();
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.source !== "sleep-detector-service-worker") return;

  if (message.type === "tab-capture-start") {
    if (mediaRecorder) {
      sendResponse({ ok: true });
      return;
    }
    activeTabId = message.tabId;
    startCapture().then((result) => {
      if (!result.ok) {
        chrome.runtime.sendMessage({
          source: "sleep-detector-offscreen",
          type: "tab-capture-error",
          tabId: activeTabId,
          error: result.error
        });
      }
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "tab-capture-stop") {
    stopCapture();
    sendResponse({ ok: true });
    return;
  }
});
