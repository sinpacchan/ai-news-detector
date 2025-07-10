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
      console.log(`✅ Extracted content from: ${selector}`);
      return el.innerText.trim();
    }
  }

  const paragraphs = Array.from(document.querySelectorAll("p"))
    .map(p => p.innerText.trim())
    .filter(Boolean);

  if (paragraphs.length > 0) {
    console.log("✅ Fallback: Extracted from paragraphs");
    return paragraphs.join("\n\n");
  }

  console.warn("⚠️ No suitable text found on the page.");
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan") {
    const text = extractText();

    if (!text) {
      sendResponse({ error: "No article text found" });
      return;
    }

    fetch("http://localhost:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server responded with status ${res.status}`);
        return res.json();
      })
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
        sendResponse({ error: "Backend fetch failed: " + err.message });
      });

    return true; // Keep sendResponse alive asynchronously
  }

  if (request.action === "toggleDarkMode") {
    document.documentElement.classList.toggle("dark-mode", request.enabled);
  }
});