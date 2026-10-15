chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OPEN_JOB") return;
  chrome.tabs.create({ url: message.url }).then(() => sendResponse({ ok: true }));
  return true;
});
