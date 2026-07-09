// index of the currently highlighted sentence group
let activeGroupIndex = -1;

// stable reference to the first span of the active group. sentenceGroups is
// rebuilt whenever PDF.js lazily renders/unloads pages, so a bare index goes
// stale; we re-derive activeGroupIndex from this anchor after every rebuild.
let activeAnchorSpan = null;

// list of sentence groups, where each group contains one or more original PDF.js text spans
let sentenceGroups = [];

// checks if a text piece ends with a *real* sentence-ending punctuation mark
// allows closing quotes/brackets after the punctuation, and uses the
// abbreviation/decimal/URL checks below so something like "Mr." or "e.g." at
// the end of a span isn't mistaken for the end of a sentence
function isSentenceEnd(text) {
  const trimmed = text.trim();
  let index = trimmed.length - 1;

  while (index >= 0 && isClosingChar(trimmed[index])) {
    index--;
  }

  if (index < 0 || !isSentencePunctuation(trimmed[index])) {
    return false;
  }

  return !shouldSkipSentenceEnd(trimmed, index);
}

// abbreviations where the period should not count as a sentence ending
const alwaysSkipAbbreviations = new Set([
  'mr.',
  'mrs.',
  'ms.',
  'dr.',
  'prof.',
  'sr.',
  'jr.',
  'st.',
]);

// abbreviations that only sometimes act like sentence endings,
// depending on what comes after them
const contextAbbreviations = new Set([
  'e.g.',
  'i.e.',
  'etc.',
  'vs.',
  'fig.',
  'eq.',
  'no.',
  'vol.',
  'pp.',
  'p.',
  'ch.',
  'sec.',
  'approx.',
  'ca.',
  'a.m.',
  'p.m.',
  'inc.',
  'ltd.',
  'co.',
  'corp.',
]);

function isSentencePunctuation(char) {
  return char === '.' || char === '?' || char === '!';
}

function isClosingChar(char) {
  return `"')]}”’»›`.includes(char);
}

function isDigit(char) {
  return /\d/.test(char);
}

function isLowerCaseLetter(char) {
  return (
    char.toLowerCase() !== char.toUpperCase() && char === char.toLowerCase()
  );
}

function getTokenInfo(text, index) {
  let start = index;
  let end = index + 1;

  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }

  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  return {
    start,
    end,
    token: text.slice(start, end),
  };
}

function cleanToken(token) {
  return token
    .replace(/^[([{“‘"'`]+/, '')
    .replace(/[),;:}\]”’"'`»›]+$/g, '')
    .toLowerCase();
}

function getNextUsefulChar(text, startIndex) {
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (/\s/.test(char) || isClosingChar(char)) {
      continue;
    }

    return char;
  }

  return '';
}

function isNumberDot(text, index) {
  return isDigit(text[index - 1]) && isDigit(text[index + 1]);
}

function isUrlOrEmailDot(text, index) {
  const tokenInfo = getTokenInfo(text, index);
  const token = tokenInfo.token;

  const tokenWithoutEndPunctuation = token.replace(/[.!?,"')\]}”’»›]+$/g, '');
  const lowerToken = tokenWithoutEndPunctuation.toLowerCase();

  const looksLikeUrlOrEmail =
    lowerToken.includes('://') ||
    lowerToken.startsWith('www.') ||
    lowerToken.includes('@') ||
    /^[a-z0-9-]{2,}\.[a-z0-9.-]{2,}(\/|$|\?|#|:)/i.test(lowerToken);

  if (!looksLikeUrlOrEmail) {
    return false;
  }

  const indexInsideToken = index - tokenInfo.start;

  return indexInsideToken < tokenWithoutEndPunctuation.length;
}

function isAbbreviationDot(text, index) {
  const token = cleanToken(getTokenInfo(text, index).token);

  if (alwaysSkipAbbreviations.has(token)) {
    return true;
  }

  // Examples: J. K. Rowling, A. Smith
  if (/^[a-z]\.$/i.test(token)) {
    return true;
  }

  // Examples: U.S., U.K., Ph.D.
  if (/^(?:[a-z]\.){2,}$/i.test(token)) {
    return true;
  }

  if (contextAbbreviations.has(token)) {
    const nextChar = getNextUsefulChar(text, index + 1);

    if (!nextChar) {
      return true;
    }

    if (nextChar === ',' || nextChar === ';' || nextChar === ':') {
      return true;
    }

    return isLowerCaseLetter(nextChar) || isDigit(nextChar);
  }

  return false;
}

// decides whether a period should be ignored as a sentence ending
// for cases like decimals, URLs, emails, and abbreviations
function shouldSkipSentenceEnd(text, index) {
  if (text[index] !== '.') {
    return false;
  }

  if (isNumberDot(text, index)) {
    return true;
  }

  if (isUrlOrEmailDot(text, index)) {
    return true;
  }

  if (isAbbreviationDot(text, index)) {
    return true;
  }

  return false;
}

// NOTE: PDF.js spans are never split or modified - they control the text
// layer's positioning/layout. Sentence groups are built directly from the
// original ".textLayer > span" elements. Trade-off: a span spanning the end
// of one sentence and the start of the next is over-highlighted as a whole.

function scrollViewer(direction) {
  const viewerContainer = document.getElementById('viewerContainer');

  if (!viewerContainer) {
    return;
  }

  const scrollAmount = viewerContainer.clientHeight * 0.8;

  if (direction === 'down') {
    viewerContainer.scrollBy({
      top: scrollAmount,
      behavior: 'smooth',
    });
  }

  if (direction === 'up') {
    viewerContainer.scrollBy({
      top: -scrollAmount,
      behavior: 'smooth',
    });
  }
}

// reads the PDF.js page number that a text span belongs to
function getPageNumber(span) {
  const pageEl = span.closest('.page');

  if (!pageEl) {
    return 0;
  }

  return parseInt(pageEl.getAttribute('data-page-number'), 10) || 0;
}

// after sentenceGroups is rebuilt, re-point activeGroupIndex at the group that
// still contains the anchored span so navigation and the highlight stay in sync
function syncActiveGroupAfterRebuild() {
  if (!activeAnchorSpan) {
    activeGroupIndex = -1;
    return;
  }

  activeGroupIndex = sentenceGroups.findIndex((group) =>
    group.includes(activeAnchorSpan),
  );

  // keep the highlight visible if the anchored group is still rendered
  if (activeGroupIndex >= 0) {
    sentenceGroups[activeGroupIndex].forEach((span) =>
      span.classList.add('active'),
    );
  }
}

// collects real leaf text spans from the PDF.js text layers. Not every valid
// text span carries role="presentation", so we query all spans under
// .textLayer and filter out wrappers and invisible/zero-size spans instead of
// relying on that exact attribute.
function getTextSpans() {
  const allSpans = Array.from(document.querySelectorAll('.textLayer span'));

  return allSpans.filter((span) => {
    const text = span.textContent.trim();

    if (!text) {
      return false;
    }

    // skip wrapper spans that contain another span (keep the leaf)
    if (span.querySelector('span')) {
      return false;
    }

    const rect = span.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  });
}

// rebuilds sentence groups directly from the original PDF.js text spans
function updateSentenceGroups() {
  const textSpans = getTextSpans();

  // DOM order is NOT reliable: PDF.js inserts spans asynchronously and lazily
  // per page. Sort into reading order (page, then top, then left) so groups and
  // navigation follow visual order instead of insertion order.
  const ordered = textSpans
    .map((span) => {
      const rect = span.getBoundingClientRect();
      return {
        span,
        page: getPageNumber(span),
        top: rect.top,
        left: rect.left,
      };
    })
    .sort((a, b) => {
      if (a.page !== b.page) {
        return a.page - b.page;
      }

      // treat spans within ~5px vertically as the same line, order by left
      if (Math.abs(a.top - b.top) > 5) {
        return a.top - b.top;
      }

      return a.left - b.left;
    });

  sentenceGroups = [];

  let currentGroup = [];

  for (const entry of ordered) {
    const span = entry.span;
    const text = span.textContent.trim();

    if (text.length === 0) {
      continue;
    }

    currentGroup.push(span);

    // group spans together until one ends with a real sentence-ending mark
    if (isSentenceEnd(text)) {
      sentenceGroups.push(currentGroup);
      currentGroup = [];
    }
  }

  // add any remaining text spans to the last group
  if (currentGroup.length > 0) {
    sentenceGroups.push(currentGroup);
  }

  syncActiveGroupAfterRebuild();
}

// start the observer to update the sentence groups when the PDF text spans change
function startObserver() {
  const viewer = document.getElementById('viewer');

  if (!viewer) {
    console.log('Viewer element not found');
    return;
  }

  // update once in case spans already exist
  updateSentenceGroups();

  // PDF.js adds text spans dynamically as pages render.
  // A single page can trigger many DOM changes, so wait briefly and rebuild once
  // instead of rebuilding after every small change.
  let rebuildTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(updateSentenceGroups, 100);
  });

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

// remove the active group highlight without changing the index
function clearActiveGroup() {
  if (activeGroupIndex >= 0 && activeGroupIndex < sentenceGroups.length) {
    sentenceGroups[activeGroupIndex].forEach((span) =>
      span.classList.remove('active'),
    );
  }
}

// clear the active group highlight when the user clicks anywhere
document.addEventListener('click', () => {
  clearActiveGroup();
  activeGroupIndex = -1;
  activeAnchorSpan = null;
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    clearActiveGroup();
    activeGroupIndex = -1;
    activeAnchorSpan = null;
    return;
  }

  if (event.key !== 'Tab') return;

  // prevent Tab from focusing PDF.js toolbar/buttons
  event.preventDefault();
  event.stopPropagation();

  if (sentenceGroups.length <= 0) return;

  // compute the target index (from -1 the first Tab lands on group 0)
  const target = event.shiftKey ? activeGroupIndex - 1 : activeGroupIndex + 1;

  // at the edges: scroll to reveal more (lazy) content instead of wrapping to
  // the other end. Once PDF.js renders the next page, the observer grows
  // sentenceGroups and the next Tab continues forward from here.
  if (target < 0) {
    scrollViewer('up');
    return;
  }

  if (target >= sentenceGroups.length) {
    scrollViewer('down');
    return;
  }

  // remove old highlight only once we know we are actually moving
  clearActiveGroup();

  activeGroupIndex = target;
  activeAnchorSpan = sentenceGroups[activeGroupIndex][0];

  // add new highlight
  sentenceGroups[activeGroupIndex].forEach((span) =>
    span.classList.add('active'),
  );

  // scroll to new highlight
  sentenceGroups[activeGroupIndex][0].scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
});
