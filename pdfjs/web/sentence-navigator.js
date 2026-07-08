// index of the currently highlighted sentence group
let activeGroupIndex = -1;

let sentenceGroups = [];

function updateSentenceGroups() {
  clearActiveGroup();

  const textSpans = document.querySelectorAll('.textLayer span');
  sentenceGroups = [];

  let currentGroup = [];

  for (let i = 0; i < textSpans.length; i++) {
    const span = textSpans[i];
    const text = span.textContent.trim();

    if (text.length === 0) {
      continue;
    }

    currentGroup.push(span);

    if (text.endsWith('.') || text.endsWith('?') || text.endsWith('!')) {
      sentenceGroups.push(currentGroup);
      currentGroup = [];
    }
  }

  // add any remaining text spans to the last group
  if (currentGroup.length > 0) {
    sentenceGroups.push(currentGroup);
  }
}

function startObserver() {
  const viewer = document.getElementById('viewer');

  if (!viewer) {
    console.log('Viewer element not found');
    return;
  }

  // update once in case spans already exist
  updateSentenceGroups();

  const observer = new MutationObserver(() => {
    updateSentenceGroups();
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

  if (sentenceGroups.length <= 0) return;

  // remove old highlight
  if (activeGroupIndex >= 0 && activeGroupIndex < sentenceGroups.length) {
    sentenceGroups[activeGroupIndex].forEach((span) =>
      span.classList.remove('active'),
    );
  }

  if (event.shiftKey) {
    activeGroupIndex--;

    if (activeGroupIndex < 0) {
      activeGroupIndex = sentenceGroups.length - 1;
    }
  } else {
    activeGroupIndex++;

    if (activeGroupIndex >= sentenceGroups.length) {
      activeGroupIndex = 0;
    }
  }

  sentenceGroups[activeGroupIndex].forEach((span) =>
    span.classList.add('active'),
  );
});
