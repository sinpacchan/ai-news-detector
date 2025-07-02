console.log("🧠 AI Detector content script loaded");

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
    const res = await fetch("http://localhost:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text })
    });

    const result = await res.json();
    console.log("Prediction result:", result);

    displayResultPopup(result);
  } catch (err) {
    console.error("Error communicating with backend:", err);
  }
}

// Floating popup renderer
function displayResultPopup(result) {
  const existing = document.getElementById("ai-detector-popup");
  if (existing) existing.remove();

  chrome.storage.local.get("darkMode", (data) => {
    const isDarkMode = data.darkMode || false;

    const confidenceAI = result.confidence_ai === "N/A" ? "N/A" : result.confidence_ai + "%";
    const confidenceFake = result.confidence_fake === "N/A" ? "N/A" : result.confidence_fake + "%";

    const popup = document.createElement("div");
    popup.id = "ai-detector-popup";

    popup.innerHTML = `
      <strong>🧠 AI Detector Result</strong><br>
      ${result.ai_label} <em>(${confidenceAI})</em><br>
      ${result.fake_label} <em>(${confidenceFake})</em>
      <button id="close-ai-popup" title="Close" style="
        position: absolute;
        top: 6px;
        right: 8px;
        background: transparent;
        border: none;
        color: ${isDarkMode ? "#ddd" : "#333"};
        font-weight: bold;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        transition: color 0.2s ease;
        user-select: none;
      ">×</button>
    `;

    // Style popup container
    popup.style.position = "fixed";
    popup.style.bottom = "20px";
    popup.style.right = "20px";
    popup.style.padding = "14px 20px";
    popup.style.backgroundColor = isDarkMode ? "#222" : "#fff";
    popup.style.color = isDarkMode ? "#ddd" : "#333";
    popup.style.fontSize = "15px";
    popup.style.lineHeight = "1.6";
    popup.style.borderRadius = "10px";
    popup.style.boxShadow = isDarkMode
      ? "0 4px 12px rgba(0, 0, 0, 0.8)"
      : "0 4px 12px rgba(0, 0, 0, 0.15)";
    popup.style.zIndex = "9999";
    popup.style.maxWidth = "280px";
    popup.style.opacity = "1";
    popup.style.transition = "opacity 0.3s";
    popup.style.border = isDarkMode ? "1px solid #444" : "1px solid #ddd";

    document.body.appendChild(popup);

    const closeBtn = document.getElementById("close-ai-popup");
    closeBtn.onmouseover = () => (closeBtn.style.color = "#f44336");
    closeBtn.onmouseout = () => (closeBtn.style.color = isDarkMode ? "#ddd" : "#333");
    closeBtn.onclick = () => {
      popup.style.opacity = "0";
      setTimeout(() => popup.remove(), 300);
    };

    setTimeout(() => {
      if (document.getElementById("ai-detector-popup")) {
        popup.style.opacity = "0";
        setTimeout(() => popup.remove(), 300);
      }
    }, 12000);
  });
}

// Add persistent floating scan button
function addScanButton() {
  const existing = document.getElementById("ai-detector-btn");
  if (existing) return;

  const button = document.createElement("button");
  button.id = "ai-detector-btn";
  button.textContent = "🔍 Scan Article";
  button.style.position = "fixed";
  button.style.bottom = "20px";
  button.style.left = "20px";
  button.style.padding = "10px 16px";
  button.style.backgroundColor = "#1976d2";
  button.style.color = "#fff";
  button.style.fontSize = "14px";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.zIndex = "9999";
  button.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.2)";

  button.onclick = () => {
    const text = extractText();
    if (text.length > 100) {
      sendForAnalysis(text);
    } else {
      alert("Not enough text found to analyze.");
    }
  };

  document.body.appendChild(button);
}

// Listener from popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "scan") {
    const text = extractText();

    if (text.length < 100) {
      sendResponse({ error: "Not enough text", text: text });
      return;
    }

    fetch("http://localhost:5000/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    })
    .then(res => res.json())
    .then(data => {
      data.text = text; // attach original article for reporting
      sendResponse(data);
      displayResultPopup(data);
    })
    .catch(err => {
      console.error("Fetch error:", err);
      sendResponse({ error: "Request failed", text: text });
    });

    return true; // Keep channel open for async response
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