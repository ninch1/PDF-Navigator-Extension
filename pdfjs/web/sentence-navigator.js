// index of the currently highlighted text span
let activeSpanIndex = -1;

// current list of text spans rendered by PDF.js
let textSpans = [];

function updateTextSpans() {
  textSpans = document.querySelectorAll('.textLayer span');
}

function startObserver() {
  const viewer = document.getElementById('viewer');

  if (!viewer) {
    console.log('Viewer element not found');
    return;
  }

  // update once in case spans already exist
  updateTextSpans();

  const observer = new MutationObserver(() => {
    updateTextSpans();
  });

  // watch for new PDF text spans
  observer.observe(viewer, {
    childList: true,
    subtree: true,
  });
}

// start when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;

  event.preventDefault();
  event.stopPropagation();

  if (textSpans.length <= 0) return;

  // remove old highlight
  if (activeSpanIndex >= 0 && activeSpanIndex < textSpans.length) {
    textSpans[activeSpanIndex].classList.remove('active');
  }

  if (event.shiftKey) {
    activeSpanIndex--;

    if (activeSpanIndex < 0) {
      activeSpanIndex = textSpans.length - 1;
    }
  } else {
    activeSpanIndex++;

    if (activeSpanIndex >= textSpans.length) {
      activeSpanIndex = 0;
    }
  }

  textSpans[activeSpanIndex].classList.add('active');
});
