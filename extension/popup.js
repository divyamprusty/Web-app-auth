const stateEl = document.getElementById("state");
const openBtn = document.getElementById("open");
const logoutBtn = document.getElementById("logout");

function render(session) {
  if (session && session.user && session.user.email) {
    stateEl.textContent = `Signed in as ${session.user.email}`;
  } else {
    stateEl.textContent = "Signed out";
  }
}

chrome.runtime.sendMessage({ type: "POPUP_REQUEST_SESSION" }, (response) => {
  render(response && response.session ? response.session : null);
});

openBtn.addEventListener("click", async () => {
  await chrome.tabs.create({ url: "http://localhost:5173/" });
});

logoutBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "POPUP_CLEAR_SESSION" });
});

window.addEventListener("message", (e) => {
  if (!e.data || typeof e.data !== "object") return;
  if (e.data.type !== "BACKGROUND_PUSH_SESSION") return;
  render(e.data.payload ?? null);
});

