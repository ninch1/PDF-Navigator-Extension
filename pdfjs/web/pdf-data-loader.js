(function () {
  const pdfDataId = new URLSearchParams(location.search).get("pdfDataId");
  if (!pdfDataId) {
    return;
  }

  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    console.error("pdf-data-loader: extension APIs unavailable");
    return;
  }

  // viewer.mjs is a deferred module, so it has not run yet when this classic
  // script executes. Register the listener now so we don't miss the event.
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

      await app.initializedPromise;

      const response = await chrome.runtime.sendMessage({
        type: "get-pdf-data",
        pdfDataId: id,
      });

      if (!response?.success) {
        throw new Error(response?.error || "Could not load PDF data.");
      }

      const bytes = toUint8Array(response.data);
      const blob = new Blob([bytes], { type: "application/pdf" });
      blobUrl = URL.createObjectURL(blob);

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
