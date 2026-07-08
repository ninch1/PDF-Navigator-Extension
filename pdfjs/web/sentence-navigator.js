let activeSentence = -1;

function startObserver() {
  const viewer = document.getElementById('viewer');

  if (!viewer) {
    console.log('Viewer element not found');
    return;
  }

  const observer = new MutationObserver(() => {
    const textSpans = document.querySelectorAll('.textLayer span');

    if (textSpans.length > 0) {
      console.log('Text layer is ready');
      console.log('Span count:', textSpans.length);

      observer.disconnect();

      // once the text layer is ready, we can start the sentence navigator
      startSentenceNavigator(textSpans);
    }
  });

  observer.observe(viewer, {
    childList: true,
    subtree: true,
  });
}

// we start the observer when the document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}

function startSentenceNavigator(textSpans) {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();

      activeSentence++;
      if (activeSentence >= textSpans.length) {
        activeSentence = 0;
      }
      textSpans[activeSentence].classList.add('active');
    }
  });
}
