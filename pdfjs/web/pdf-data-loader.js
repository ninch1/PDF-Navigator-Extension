(function () {
  // The background opens this viewer with ?pdfDataId=<uuid>. Read it here.
  const pdfDataId = new URLSearchParams(location.search).get("pdfDataId");
  // No pdfDataId means this is a normal load (sample PDF, direct file=, etc.),
  // so there's nothing for this script to do.
  if (!pdfDataId) {
    return;
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    console.error("pdf-data-loader: extension APIs unavailable");
    return;
  }

  // viewer.mjs is a module script, so it hasn't run yet when this classic script
  // executes and PDFViewerApplication doesn't exist. "webviewerloaded" is fired
  // by PDF.js once it's ready, so we register the listener now to not miss it.
  document.addEventListener(
    "webviewerloaded",
    () => {
      loadPdfData(pdfDataId);
    },
    { once: true }
  );

  async function loadPdfData(id) {
    let blobUrl = null;
    try {
      const app = window.PDFViewerApplication;
      if (!app) {
        throw new Error("PDF.js viewer not available.");
      }

      // webviewerloaded fires early; wait until PDF.js is fully ready to open a doc.
      await app.initializedPromise;

      // Ask the background for the fetched bytes for this pdfDataId.
      const response = await chrome.runtime.sendMessage({
        type: "get-pdf-data",
        pdfDataId: id,
      });

      if (!response?.success) {
        throw new Error(response?.error || "Could not load PDF data.");
      }

      // Rebuild the bytes into a Blob, then a same-origin blob: URL the viewer
      // can load. URL.createObjectURL only works in a page like this, not in the
      // MV3 service worker, which is why the blob URL is created here.
      const bytes = toUint8Array(response.data);
      const blob = new Blob([bytes], { type: "application/pdf" });
      blobUrl = URL.createObjectURL(blob);

      // Load the PDF into the viewer. originalUrl is only the display name.
      await app.open({
        url: blobUrl,
        originalUrl: response.filename || "document.pdf",
      });
    } catch (error) {
      console.error("pdf-data-loader:", error);
      window.PDFViewerApplication?._documentError?.("pdfjs-loading-error", {
        message: error.message,
      });
    } finally {
      // PDF.js has read the blob into its worker by the time open() resolves,
      // so the object URL can be released.
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    }
  }

  // The background sends bytes as a plain number array (JSON-safe). Turn it back
  // into a Uint8Array that Blob can use.
  function toUint8Array(data) {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (Array.isArray(data)) {
      return new Uint8Array(data);
    }
    throw new Error("Unexpected PDF data format.");
  }
})();
