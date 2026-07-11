// Temporary in-memory store for fetched PDF bytes. Keys are UUID strings and
// values are { data: ArrayBuffer, filename }. The viewer picks up the bytes by ID.
const pdfDataStore = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Popup asks us to fetch and open a remote PDF.
  if (message.type === "open-remote-pdf") {
    openRemotePdf(message.url)
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error.message || "Could not load PDF.",
        })
      );
    // openRemotePdf is async, so we call sendResponse later. Returning true keeps
    // the message channel open until then.
    return true;
  }

  // Popup asks us to open a PDF the user picked from their computer.
  if (message.type === "open-local-pdf") {
    openLocalPdf(message.data, message.filename)
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error.message || "Could not open PDF.",
        })
      );
    // openLocalPdf is async, so keep the message channel open for sendResponse.
    return true;
  }

  // Viewer (pdf-data-loader.js) asks for the bytes it should display.
  if (message.type === "get-pdf-data") {
    const entry = pdfDataStore.get(message.pdfDataId);
    if (!entry) {
      sendResponse({ success: false, error: "PDF data not found or expired." });
      return false;
    }

    // One-time handoff: remove the entry once it's been requested.
    pdfDataStore.delete(message.pdfDataId);
    // chrome.runtime messaging is JSON-based, so an ArrayBuffer would arrive as
    // an empty object. Send a plain byte array that survives serialization.
    sendResponse({
      success: true,
      data: Array.from(new Uint8Array(entry.data)),
      filename: entry.filename,
    });
    // Response is sent synchronously here, so no need to keep the channel open.
    return false;
  }

  return false;
});

// Fetches a remote PDF, checks it's really a PDF, stores the bytes, and opens
// the viewer tab pointed at those bytes.
async function openRemotePdf(url) {
  // credentials: "include" sends cookies, which helps with some logged-in sites.
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not fetch PDF (HTTP ${response.status}).`);
  }

  const data = await response.arrayBuffer();
  if (data.byteLength === 0) {
    throw new Error("Downloaded PDF is empty.");
  }

  if (!looksLikePdf(new Uint8Array(data))) {
    throw new Error("The URL did not return a PDF file.");
  }

  await storeAndOpenPdf(data, getPdfFilename(url));
}

// Opens a PDF the user picked locally. The bytes arrive as a plain number array
// (JSON-safe) from the popup, so rebuild them into an ArrayBuffer first.
async function openLocalPdf(byteArray, filename) {
  if (!Array.isArray(byteArray) || byteArray.length === 0) {
    throw new Error("The selected PDF is empty.");
  }

  const bytes = new Uint8Array(byteArray);
  if (!looksLikePdf(bytes)) {
    throw new Error("The selected file is not a PDF.");
  }

  await storeAndOpenPdf(bytes.buffer, filename || "document.pdf");
}

// Every PDF starts with the bytes "%PDF". This guards against error pages or
// files that aren't actually PDFs.
function looksLikePdf(bytes) {
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

// Stores PDF bytes under a new UUID and opens the viewer pointed at them. Shared
// by both the remote and local PDF flows.
async function storeAndOpenPdf(data, filename) {
  // Only keep the most recent PDF in memory.
  pdfDataStore.clear();

  const pdfDataId = crypto.randomUUID();
  pdfDataStore.set(pdfDataId, { data, filename });

  // Open our viewer with an empty "file" (so PDF.js doesn't auto-load anything)
  // plus the pdfDataId so pdf-data-loader.js knows which bytes to request.
  const viewerBase = chrome.runtime.getURL("pdfjs/web/viewer.html");
  const viewerUrl = `${viewerBase}?file=&pdfDataId=${encodeURIComponent(pdfDataId)}`;
  await chrome.tabs.create({ url: viewerUrl });
}

// Pulls a ".pdf" filename out of the URL for display, defaulting to document.pdf.
function getPdfFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop();
    return filename?.toLowerCase().endsWith(".pdf") ? filename : "document.pdf";
  } catch {
    return "document.pdf";
  }
}
