// Bridge between the web page and the extension background

function isValidPageEvent(event) {
  if (event.source !== window) return false;
  const data = event.data;
  if (!data || typeof data !== "object") return false;
  if (data.source !== "WEB_APP") return false;
  return true;
}

// Relay auth state changes from the page to the background
window.addEventListener("message", (event) => {
  if (!isValidPageEvent(event)) return;
  const { type, payload } = event.data;
  if (type !== "SUPABASE_AUTH_STATE") return;

  chrome.runtime.sendMessage({
    type: "CONTENT_AUTH_STATE_UPDATE",
    payload,
  });
});

// On load, request latest session and push it to the page so it can adopt it
chrome.runtime.sendMessage({ type: "CONTENT_REQUEST_SESSION" }, (response) => {
  const session = response && response.session ? response.session : null;
  if (session) {
    window.postMessage({
      source: "EXTENSION",
      type: "EXTENSION_SET_SESSION",
      payload: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    }, "*");
  }
});

// Receive background pushes and forward to the page
chrome.runtime.onMessage.addListener((message, _sender, _sendResponse) => {
  if (!message || typeof message !== "object") return;
  if (message.type !== "BACKGROUND_PUSH_SESSION") return;
  const session = message.payload ?? null;

  if (session) {
    window.postMessage({
      source: "EXTENSION",
      type: "EXTENSION_SET_SESSION",
      payload: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    }, "*");
  } else {
    window.postMessage({ source: "EXTENSION", type: "EXTENSION_SIGN_OUT" }, "*");
  }
});

