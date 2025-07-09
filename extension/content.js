console.log("🧠 AI Detector content script loaded");

function extractText() {
  const candidates = [
    "main article",
    "article",
    "div[data-testid='article-body']",
    "div.article-body",
    "section",
    "body"
  ];

  for (let selector of candidates) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim().length > 100) {
      return el.innerText.trim();
    }
  }

  const paragraphs = Array.from(document.querySelectorAll("p"))
    .map(p => p.innerText.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }

  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan") {
    const text = extractText();

    if (!text) {
      sendResponse({ error: "No article text found" });
      return;
    }

    fetch("https://lvulpecula.hf.space/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })
      .then(res => res.json())
      .then(data => {
        sendResponse({
          text,
          ai_label: data.ai_label,
          confidence_ai: data.confidence_ai,
          fake_label: data.fake_label,
          confidence_fake: data.confidence_fake
        });
      })
      .catch(err => {
        console.error("❌ Fetch failed", err);
        sendResponse({ error: "Backend fetch failed" });
      });

    return true; // Keep sendResponse alive
  }

  if (request.action === "toggleDarkMode") {
    document.documentElement.classList.toggle("dark-mode", request.enabled);
  }
});