import * as pdfjsLib from './lib/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdf.worker.mjs';

const pdfUrl = './sample.pdf';

const canvas = document.getElementById('pdf-canvas');
const context = canvas.getContext('2d');

async function renderPdf() {
  const loadingTask = pdfjsLib.getDocument({
    url: pdfUrl,
  });

  const pdf = await loadingTask.promise;

  const page = await pdf.getPage(1);

  const scale = 1.5;
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport,
  }).promise;

  console.log('PDF rendered successfully');
}

renderPdf();
