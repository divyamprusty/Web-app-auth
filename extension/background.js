// Keeps the latest Supabase session and notifies all contexts.

const SESSION_KEY = "supabaseSession";

async function getStoredSession() {
  const { [SESSION_KEY]: session } = await chrome.storage.local.get(SESSION_KEY);
  return session ?? null;
}

async function setStoredSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
}

async function broadcastSession(session) {
  // Send to all tabs (content scripts)
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "BACKGROUND_PUSH_SESSION",
        payload: session,
      });
    } catch {
      // Ignore tabs without our content script
    }
  }

  // Send to any runtime views (e.g., popup)
  const views = await chrome.runtime.getViews();
  for (const view of views) {
    try {
      view.postMessage({ type: "BACKGROUND_PUSH_SESSION", payload: session }, "*");
    } catch {
      // Ignore
    }
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  // Ensure a predictable initial state
  const current = await getStoredSession();
  if (typeof current === "undefined") {
    await setStoredSession(null);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") return;

    if (message.type === "CONTENT_AUTH_STATE_UPDATE") {
      const session = message.payload ?? null;
      await setStoredSession(session);
      await broadcastSession(session);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === "CONTENT_REQUEST_SESSION" || message.type === "POPUP_REQUEST_SESSION") {
      const session = await getStoredSession();
      sendResponse({ ok: true, session });
      return;
    }

    if (message.type === "POPUP_CLEAR_SESSION") {
      await setStoredSession(null);
      await broadcastSession(null);
      sendResponse({ ok: true });
      return;
    }
  })();

  // Keep the message channel open for async sendResponse
  return true;
});

