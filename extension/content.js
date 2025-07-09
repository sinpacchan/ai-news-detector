console.log("🧠 AI Detector content script loaded");

const BASE_URL = "https://huggingface.co/spaces/lvulpecula/ai-news-detector/run";

// Smarter extraction fallback
function extractText() {
  const article = document.querySelector("main article") ||
                  document.querySelector("article") ||
                  document.querySelector("main") ||
                  document.querySelector("body");

  if (!article) return "";
  return article.innerText.trim();
}

// Call backend for predictions
async function sendForAnalysis(text) {
  try {
    const res = await fetch(`${BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text] })  // Gradio expects `data: [text]`
    });

    const json = await res.json();
    const result = json.data[0];  // unwrap from Gradio response

    console.log("Prediction result:", result);

    displayResultPopup(result);
  } catch (err) {
    console.error("Error communicating with backend:", err);
  }
}

// ... (rest of your code unchanged) ...

// Listener from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scan") {
    const text = extractText();

    if (text.length < 100) {
      sendResponse({ error: "Not enough text", text: text });
      return;
    }

    fetch(`${BASE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [text] })  // Gradio format
    })
    .then(res => res.json())
    .then(json => {
      const data = json.data[0];
      data.text = text;
      sendResponse(data);
      displayResultPopup(data);
    })
    .catch(err => {
      console.error("Fetch error:", err);
      sendResponse({ error: "Request failed", text: text });
    });

    return true;
  }

  if (message.action === "toggleDarkMode") {
    if (message.enabled) {
      document.body.classList.add("ai-detector-darkmode");
    } else {
      document.body.classList.remove("ai-detector-darkmode");
    }
  }
});

// Auto-detect & dark mode setup
window.addEventListener("load", () => {
  addScanButton();

  chrome.storage.local.get(["autoDetect", "darkMode"], (result) => {
    if (result.darkMode) {
      document.body.classList.add("ai-detector-darkmode");
    }

    if (result.autoDetect) {
      const text = extractText();
      if (text.length > 100) {
        sendForAnalysis(text);
      }
    }
  });
});