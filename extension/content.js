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

function createFloatingBox(text, isDarkMode = false) {
  const existing = document.getElementById("ai-detector-floating-box");
  if (existing) existing.remove();

  const box = document.createElement("div");
  box.id = "ai-detector-floating-box";
  box.style.position = "fixed";
  box.style.bottom = "20px";
  box.style.right = "20px";
  box.style.zIndex = "999999";
  box.style.padding = "12px";
  box.style.borderRadius = "10px";
  box.style.fontSize = "14px";
  box.style.maxWidth = "300px";
  box.style.lineHeight = "1.4";
  box.style.fontFamily = "Segoe UI, sans-serif";
  box.style.border = "1px solid rgba(0,0,0,0.2)";
  box.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
  box.style.backgroundColor = isDarkMode ? "#2a2a2a" : "white";
  box.style.color = isDarkMode ? "#f0f0f0" : "#212529";

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <strong>AI News Detector</strong>
      <button id="closeFloatingBox" style="
        background: transparent;
        color: ${isDarkMode ? '#f0f0f0' : '#555'};
        border: none;
        font-size: 14px;
        cursor: pointer;
        line-height: 1;
      ">✖</button>
    </div>
    ${text}
  `;

  document.body.appendChild(box);

  document.getElementById("closeFloatingBox").addEventListener("click", () => {
    box.remove();
  });
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

    return true;
  }

  if (request.action === "toggleDarkMode") {
    document.documentElement.classList.toggle("dark-mode", request.enabled);
    const floating = document.getElementById("ai-detector-floating-box");
    if (floating) {
      // Re-render box with new theme
      floating.remove();
      chrome.storage.local.get("autoDetect", (data) => {
        if (data.autoDetect) {
          const text = extractText();
          if (!text) return;
          fetch("http://localhost:5000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          })
            .then(res => res.json())
            .then(data => {
              const resultText = `
                <div><strong>AI:</strong> ${data.ai_label} ${data.confidence_ai !== "N/A" ? `(${data.confidence_ai}%)` : ""}</div>
                <div><strong>Fake:</strong> ${data.fake_label} ${data.confidence_fake !== "N/A" ? `(${data.confidence_fake}%)` : ""}</div>
              `;
              createFloatingBox(resultText, request.enabled);
            });
        }
      });
    }
  }
});

// Auto-detect on page load
chrome.storage.local.get(["autoDetect", "darkMode"], (data) => {
  if (!data.autoDetect) return;

  const text = extractText();
  if (!text) return;

  fetch("http://localhost:5000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  })
    .then(res => res.json())
    .then(data => {
      const resultText = `
        <div><strong>AI:</strong> ${data.ai_label} ${data.confidence_ai !== "N/A" ? `(${data.confidence_ai}%)` : ""}</div>
        <div><strong>Fake:</strong> ${data.fake_label} ${data.confidence_fake !== "N/A" ? `(${data.confidence_fake}%)` : ""}</div>
      `;
      createFloatingBox(resultText, data.darkMode || false);
    })
    .catch(err => {
      console.error("❌ Auto-detect fetch failed:", err);
    });
});