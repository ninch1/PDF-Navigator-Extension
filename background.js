const pdfDataStore = new Map();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "open-remote-pdf") {
    openRemotePdf(message.url)
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error.message || "Could not load PDF.",
        })
      );
    return true;
  }

  if (message.type === "get-pdf-data") {
    const entry = pdfDataStore.get(message.pdfDataId);
    if (!entry) {
      sendResponse({ success: false, error: "PDF data not found or expired." });
      return false;
    }

    pdfDataStore.delete(message.pdfDataId);
    // chrome.runtime messaging is JSON-based, so an ArrayBuffer would arrive as
    // an empty object. Send a plain byte array that survives serialization.
    sendResponse({
      success: true,
      data: Array.from(new Uint8Array(entry.data)),
      filename: entry.filename,
    });
    return false;
  }

  return false;
});

async function openRemotePdf(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Could not fetch PDF (HTTP ${response.status}).`);
  }

  const data = await response.arrayBuffer();
  if (data.byteLength === 0) {
    throw new Error("Downloaded PDF is empty.");
  }

  const header = new Uint8Array(data, 0, 4);
  const looksLikePdf =
    header[0] === 0x25 &&
    header[1] === 0x50 &&
    header[2] === 0x44 &&
    header[3] === 0x46;
  if (!looksLikePdf) {
    throw new Error("The URL did not return a PDF file.");
  }

  pdfDataStore.clear();

  const pdfDataId = crypto.randomUUID();
  pdfDataStore.set(pdfDataId, {
    data,
    filename: getPdfFilename(url),
  });

  const viewerBase = chrome.runtime.getURL("pdfjs/web/viewer.html");
  const viewerUrl = `${viewerBase}?file=&pdfDataId=${encodeURIComponent(pdfDataId)}`;
  await chrome.tabs.create({ url: viewerUrl });
}

function getPdfFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop();
    return filename?.toLowerCase().endsWith(".pdf") ? filename : "document.pdf";
  } catch {
    return "document.pdf";
  }
}
