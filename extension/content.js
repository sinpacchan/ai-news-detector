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

    // Updated API endpoint and request body format
    fetch("https://lvulpecula-ai-news-detector.hf.space/run/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text] })
    })
      .then(res => res.json())
      .then(data => {
        // The HF Space usually returns predictions in data[0], adjust as needed
        const result = data?.data?.[0] || {};

        sendResponse({
          text,
          ai_label: result.ai_label || "N/A",
          confidence_ai: result.confidence_ai || "N/A",
          fake_label: result.fake_label || "N/A",
          confidence_fake: result.confidence_fake || "N/A"
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