const DEFAULT_SETTINGS = {
  highlightColor: "#ffa500",
  borderThickness: 2,
};

// Chrome's built-in PDF viewer is itself an extension with this fixed ID. When a
// user opens a PDF the normal way, the tab URL points at this extension and
// contains the real PDF URL, which we pull out in extractPdfUrl() below.
const CHROME_PDF_VIEWER_EXTENSION_ID = "mhjfbmdgcfjbbpaeojofohoefgiehjai";

// The local picker sends PDF bytes through chrome.runtime.sendMessage, which is
// JSON-based, so very large files are too heavy to pass this way. Cap the size.
const MAX_LOCAL_PDF_SIZE_MB = 15;

const colorInput = document.getElementById("highlightColor");
const thicknessInput = document.getElementById("borderThickness");
const thicknessValue = document.getElementById("borderThicknessValue");
const resetSettingsButton = document.getElementById("resetSettings");
const openCurrentPdfButton = document.getElementById("openCurrentPdf");
const chooseLocalPdfButton = document.getElementById("chooseLocalPdf");
const localPdfInput = document.getElementById("localPdfInput");
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

// Shows a popup message. type is "error" (default) or "success", which controls
// the text color via the .error / .success classes.
function showCurrentPdfMessage(text, type = "error") {
  currentPdfMessage.textContent = text;
  currentPdfMessage.classList.remove("error", "success");
  currentPdfMessage.classList.add(type);
  currentPdfMessage.hidden = false;
}

function clearCurrentPdfMessage() {
  currentPdfMessage.textContent = "";
  currentPdfMessage.classList.remove("error", "success");
  currentPdfMessage.hidden = true;
}

// Looks at the active tab's URL and returns the real PDF URL to open, or null
// if the tab doesn't look like a PDF.
function extractPdfUrl(tabUrl) {
  if (!tabUrl) {
    return null;
  }

  try {
    const parsed = new URL(tabUrl);

    // Case 1: Chrome's built-in PDF viewer. The real PDF URL is embedded in the
    // path after the extension ID, so drop the leading "/" and decode it.
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

    // Case 2: our own bundled PDF.js viewer is already open. Reuse whatever PDF
    // is in its "file" query parameter.
    if (
      parsed.protocol === "chrome-extension:" &&
      parsed.pathname.endsWith("/pdfjs/web/viewer.html")
    ) {
      const fileParam = parsed.searchParams.get("file");
      return fileParam || null;
    }

    // Case 3: local file:// PDFs are not supported yet.
    if (parsed.protocol === "file:") {
      return null;
    }

    // Case 4: a normal web URL that looks like a PDF (path ends in ".pdf", or the
    // URL has ".pdf?" before its query string).
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

// True only for http/https URLs. These must be fetched by the background because
// the viewer page cannot load cross-origin PDFs directly.
function isRemotePdfUrl(pdfUrl) {
  try {
    const parsed = new URL(pdfUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Builds a direct viewer URL for PDFs that already live on the extension origin
// (like the bundled sample PDF). No background fetch is needed for these.
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

// Restore the default highlight color and border thickness.
resetSettingsButton.addEventListener("click", () => {
  colorInput.value = DEFAULT_SETTINGS.highlightColor;
  thicknessInput.value = DEFAULT_SETTINGS.borderThickness;
  updateThicknessLabel();
  saveSettings();
  showCurrentPdfMessage("Highlight settings reset.", "success");
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

    // Remote http/https PDFs can't be loaded straight into the viewer (CORS +
    // PDF.js same-origin check). Ask the background to fetch the bytes instead,
    // and show a message in the popup if it fails.
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

    // Extension-origin / local viewer paths (like the sample PDF) can open
    // directly without a background fetch.
    chrome.tabs.create({ url: buildViewerUrl(pdfUrl) });
  });
});

// Clicking "Choose local PDF" opens the hidden file picker. Reset the value first
// so picking the same file twice still fires a "change" event.
chooseLocalPdfButton.addEventListener("click", () => {
  clearCurrentPdfMessage();
  localPdfInput.value = "";
  localPdfInput.click();
});

// When the user selects a file, read its bytes and hand them to the background
// using the same pdfDataId system that remote PDFs use.
localPdfInput.addEventListener("change", async () => {
  const file = localPdfInput.files?.[0];
  if (!file) {
    return;
  }

  // Accept only PDFs, by MIME type or ".pdf" filename.
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    showCurrentPdfMessage("Please choose a .pdf file.");
    return;
  }

  // Reject files above the limit before reading them into memory.
  if (file.size > MAX_LOCAL_PDF_SIZE_MB * 1024 * 1024) {
    showCurrentPdfMessage(
      `This local PDF is too large for the current picker. Please choose a PDF under ${MAX_LOCAL_PDF_SIZE_MB} MB.`
    );
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    // Plain number array so the bytes survive JSON messaging to the background.
    const byteArray = Array.from(new Uint8Array(buffer));

    chrome.runtime.sendMessage(
      { type: "open-local-pdf", data: byteArray, filename: file.name },
      (response) => {
        if (chrome.runtime.lastError) {
          showCurrentPdfMessage("Could not reach the extension background.");
          return;
        }

        if (!response?.success) {
          showCurrentPdfMessage(response?.error || "Could not open PDF.");
        }
      }
    );
  } catch {
    showCurrentPdfMessage("Could not read the selected file.");
  }
});
