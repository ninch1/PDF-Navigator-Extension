const DEFAULT_SETTINGS = {
  highlightColor: "#ffa500",
  borderThickness: 2,
};

const CHROME_PDF_VIEWER_EXTENSION_ID = "mhjfbmdgcfjbbpaeojofohoefgiehjai";

const colorInput = document.getElementById("highlightColor");
const thicknessInput = document.getElementById("borderThickness");
const thicknessValue = document.getElementById("borderThicknessValue");
const openCurrentPdfButton = document.getElementById("openCurrentPdf");
const currentPdfMessage = document.getElementById("currentPdfMessage");

function saveSettings() {
  const settings = {
    highlightColor: colorInput.value,
    borderThickness: Number(thicknessInput.value),
  };

  chrome.storage.local.set(settings);
}

function updateThicknessLabel() {
  thicknessValue.textContent = `${thicknessInput.value}px`;
}

function showCurrentPdfMessage(text) {
  currentPdfMessage.textContent = text;
  currentPdfMessage.hidden = false;
}

function clearCurrentPdfMessage() {
  currentPdfMessage.textContent = "";
  currentPdfMessage.hidden = true;
}

function extractPdfUrl(tabUrl) {
  if (!tabUrl) {
    return null;
  }

  try {
    const parsed = new URL(tabUrl);

    if (
      parsed.protocol === "chrome-extension:" &&
      parsed.hostname === CHROME_PDF_VIEWER_EXTENSION_ID
    ) {
      const embeddedPdfUrl = parsed.pathname.replace(/^\//, "");
      if (!embeddedPdfUrl) {
        return null;
      }

      try {
        return decodeURIComponent(embeddedPdfUrl);
      } catch {
        return embeddedPdfUrl;
      }
    }

    if (
      parsed.protocol === "chrome-extension:" &&
      parsed.pathname.endsWith("/pdfjs/web/viewer.html")
    ) {
      const fileParam = parsed.searchParams.get("file");
      return fileParam || null;
    }

    if (parsed.protocol === "file:") {
      return null;
    }

    const lowerUrl = tabUrl.toLowerCase();
    const lowerPath = parsed.pathname.toLowerCase();

    if (lowerPath.endsWith(".pdf") || lowerUrl.includes(".pdf?")) {
      return tabUrl;
    }

    return null;
  } catch {
    return null;
  }
}

function isRemotePdfUrl(pdfUrl) {
  try {
    const parsed = new URL(pdfUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function buildViewerUrl(pdfUrl) {
  const viewerBase = chrome.runtime.getURL("pdfjs/web/viewer.html");
  return `${viewerBase}?file=${encodeURIComponent(pdfUrl)}`;
}

chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
  colorInput.value = settings.highlightColor;
  thicknessInput.value = settings.borderThickness;
  updateThicknessLabel();
});

colorInput.addEventListener("input", saveSettings);
thicknessInput.addEventListener("input", () => {
  updateThicknessLabel();
  saveSettings();
});

openCurrentPdfButton.addEventListener("click", () => {
  clearCurrentPdfMessage();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url) {
      showCurrentPdfMessage("No active tab found.");
      return;
    }

    const pdfUrl = extractPdfUrl(tab.url);
    if (!pdfUrl) {
      showCurrentPdfMessage("This tab doesn't look like a PDF.");
      return;
    }

    if (isRemotePdfUrl(pdfUrl)) {
      chrome.runtime.sendMessage(
        { type: "open-remote-pdf", url: pdfUrl },
        (response) => {
          if (chrome.runtime.lastError) {
            showCurrentPdfMessage("Could not reach the extension background.");
            return;
          }

          if (!response?.success) {
            showCurrentPdfMessage(
              response?.error || "Could not load PDF."
            );
          }
        }
      );
      return;
    }

    chrome.tabs.create({ url: buildViewerUrl(pdfUrl) });
  });
});
