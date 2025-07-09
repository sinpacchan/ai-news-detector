document.addEventListener("DOMContentLoaded", () => {
  const BASE_URL = "https://huggingface.co/spaces/lvulpecula/ai-news-detector/run";
  const scanBtn = document.getElementById("scan");
  const clearBtn = document.getElementById("clearResults");
  const themeToggle = document.getElementById("themeToggle");
  const autoToggle = document.getElementById("autoToggle");
  const aiResultSpan = document.getElementById("aiResult");
  const fakeResultSpan = document.getElementById("fakeResult");
  const reportLink = document.getElementById("reportLink");
  const wordCountP = document.getElementById("wordCount");
  const darkModeLabel = document.getElementById("darkModeLabel");

  const detectionPage = document.getElementById("detectionPage");
  const reportPage = document.getElementById("reportPage");
  const backBtn = document.getElementById("backBtn");
  const reportForm = document.getElementById("reportForm");
  const reportStatusDiv = document.getElementById("reportStatus");
  const detectedAiLabelDiv = document.getElementById("detectedAiLabel");
  const detectedFakeLabelDiv = document.getElementById("detectedFakeLabel");
  const correctAiSelect = document.getElementById("correctAi");
  const correctFakeSelect = document.getElementById("correctFake");
  const reportTextInput = document.getElementById("reportText");

  let currentPrediction = {
    text: "",
    ai_label: "",
    confidence_ai: "",
    fake_label: "",
    confidence_fake: ""
  };

  function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  chrome.storage.local.get(["darkMode", "autoDetect"], (data) => {
    themeToggle.checked = data.darkMode || false;
    autoToggle.checked = data.autoDetect || false;

    updateDarkMode(data.darkMode);
  });

  function updateDarkMode(enabled) {
    const modeText = enabled ? "\u2600\ufe0f Light Mode" : "\ud83c\udf19 Dark Mode";
    darkModeLabel.textContent = modeText;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleDarkMode",
          enabled
        });
      }
    });
  }

  themeToggle.addEventListener("change", () => {
    const enabled = themeToggle.checked;
    chrome.storage.local.set({ darkMode: enabled });
    updateDarkMode(enabled);
  });

  autoToggle.addEventListener("change", () => {
    const enabled = autoToggle.checked;
    chrome.storage.local.set({ autoDetect: enabled });
    if (enabled) {
      scanAndDisplay();
    } else {
      aiResultSpan.textContent = "Waiting for manual scan...";
      fakeResultSpan.textContent = "";
      wordCountP.textContent = "";
    }
  });

  scanBtn.addEventListener("click", () => {
    scanAndDisplay();
  });

  clearBtn.addEventListener("click", () => {
    aiResultSpan.textContent = "No result yet";
    fakeResultSpan.textContent = "No result yet";
    wordCountP.textContent = "";
    currentPrediction = {
      text: "",
      ai_label: "",
      confidence_ai: "",
      fake_label: "",
      confidence_fake: ""
    };
  });

  reportLink.addEventListener("click", () => {
    if (!currentPrediction.text) {
      alert("Please scan an article first before reporting.");
      return;
    }
    showReportPage();
  });

  backBtn.addEventListener("click", () => {
    showDetectionPage();
  });

  reportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    reportStatusDiv.textContent = "";

    const correctAi = correctAiSelect.value;
    const correctFake = correctFakeSelect.value;

    if (!correctAi && !correctFake) {
      reportStatusDiv.style.color = "red";
      reportStatusDiv.textContent = "\u274c Please select at least one correction.";
      return;
    }

    if (!currentPrediction.text) {
      reportStatusDiv.style.color = "red";
      reportStatusDiv.textContent = "\u274c No article scanned to report.";
      return;
    }

    const payload = {
      text: currentPrediction.text,
      model_ai_label: currentPrediction.ai_label,
      correct_ai_label: correctAi || null,
      model_fake_label: currentPrediction.fake_label,
      correct_fake_label: correctFake || null
    };

    try {
      const response = await fetch(`${BASE_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok) {
        reportStatusDiv.style.color = "green";
        reportStatusDiv.textContent = "\u2705 " + data.message;
        correctAiSelect.value = "";
        correctFakeSelect.value = "";
      } else {
        throw new Error(data.error || "Unknown error");
      }
    } catch (error) {
      reportStatusDiv.style.color = "red";
      reportStatusDiv.textContent = "\u274c Failed to send report.";
      console.error("Report error:", error);
    }
  });

  function scanAndDisplay() {
    aiResultSpan.textContent = "\ud83d\udd0e Scanning article...";
    fakeResultSpan.textContent = "";
    reportStatusDiv.textContent = "";
    wordCountP.textContent = "";

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        aiResultSpan.textContent = "\u274c No active tab found.";
        return;
      }

      chrome.tabs.sendMessage(tabs[0].id, { action: "scan" }, (response) => {
        if (!response || response.error) {
          aiResultSpan.textContent = "\u274c Could not scan the article.";
          fakeResultSpan.textContent = "";
          currentPrediction = { text: "", ai_label: "", confidence_ai: "", fake_label: "", confidence_fake: "" };
        } else {
          currentPrediction = {
            text: response.text || "",
            ai_label: response.ai_label || "N/A",
            confidence_ai: response.confidence_ai || "N/A",
            fake_label: response.fake_label || "N/A",
            confidence_fake: response.confidence_fake || "N/A"
          };

          aiResultSpan.textContent = `${currentPrediction.ai_label} (${currentPrediction.confidence_ai}%)`;
          fakeResultSpan.textContent = `${currentPrediction.fake_label} (${currentPrediction.confidence_fake}%)`;

          const wordCount = countWords(currentPrediction.text);
          wordCountP.textContent = `\ud83d\udcdd Word count: ${wordCount}`;
        }
      });
    });
  }

  function showReportPage() {
    detectionPage.style.display = "none";
    reportPage.style.display = "block";

    detectedAiLabelDiv.textContent = `${currentPrediction.ai_label} (${currentPrediction.confidence_ai}%)`;
    detectedFakeLabelDiv.textContent = `${currentPrediction.fake_label} (${currentPrediction.confidence_fake}%)`;
    reportTextInput.value = currentPrediction.text;

    reportStatusDiv.textContent = "";
    correctAiSelect.value = "";
    correctFakeSelect.value = "";
  }

  function showDetectionPage() {
    reportPage.style.display = "none";
    detectionPage.style.display = "block";
    reportStatusDiv.textContent = "";
  }

  if (autoToggle.checked) {
    scanAndDisplay();
  }
});