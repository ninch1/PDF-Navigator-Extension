const DEFAULT_SETTINGS = {
  highlightColor: '#ffa500',
  borderThickness: 2,
};

function applyNavigatorSettings(settings) {
  const root = document.documentElement;
  root.style.setProperty('--sentence-highlight-color', settings.highlightColor);
  root.style.setProperty(
    '--sentence-border-thickness',
    `${settings.borderThickness}px`,
  );
}

function loadNavigatorSettings() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    applyNavigatorSettings(DEFAULT_SETTINGS);
    return;
  }

  chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
    applyNavigatorSettings(settings);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      applyNavigatorSettings(settings);
    });
  });
}

loadNavigatorSettings();

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

function isVerticallyVisible(rect, containerRect) {
  return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
}

// returns the first or last sentence group whose first span overlaps the
// viewer container vertically; -1 if none are visible
// fromEnd: if false, returns the first visible group; if true, returns the last visible group
function findVisibleGroupIndex(fromEnd = false) {
  const viewerContainer = document.getElementById('viewerContainer');

  if (!viewerContainer || sentenceGroups.length === 0) {
    return -1;
  }

  const containerRect = viewerContainer.getBoundingClientRect();

  if (fromEnd) {
    for (let i = sentenceGroups.length - 1; i >= 0; i--) {
      const group = sentenceGroups[i];

      if (group.length === 0) {
        continue;
      }

      if (
        isVerticallyVisible(group[0].getBoundingClientRect(), containerRect)
      ) {
        return i;
      }
    }

    return -1;
  }

  for (let i = 0; i < sentenceGroups.length; i++) {
    const group = sentenceGroups[i];

    if (group.length === 0) {
      continue;
    }

    if (isVerticallyVisible(group[0].getBoundingClientRect(), containerRect)) {
      return i;
    }
  }

  return -1;
}

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
      span.classList.add('sentence-active'),
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

// Conservative, tunable thresholds for layout-aware group breaks. They only add
// *extra* break points on top of sentence punctuation; they never merge groups.
const layoutBreak = {
  // vertical gap (next.top - current.top) beyond this multiple of the current
  // line height is treated as a paragraph break rather than a normal line wrap.
  // Normal wrapping is ~1x line height, so keep this comfortably above 1.
  paragraphGapMultiplier: 1.8,
  // a span is only considered a heading if it is at most this many characters,
  // so body-text lines are never mistaken for headings.
  headingMaxChars: 60,
  // a heading line's height must be at least this many times the next span's
  // height to count as a size jump (e.g. a big header above smaller body text).
  headingHeightRatio: 1.4,
};

// decides whether an obvious layout boundary sits between two consecutive
// ordered entries, independent of sentence punctuation. Returns false for
// normal line wrapping so multi-line sentences stay in one group.
function shouldBreakBetweenSpans(currentEntry, nextEntry) {
  if (!currentEntry || !nextEntry) {
    return false;
  }

  // different pages are always a hard boundary
  if (currentEntry.page !== nextEntry.page) {
    return true;
  }

  const verticalGap = nextEntry.top - currentEntry.top;

  // only consider a gap when the next span actually starts on a lower line;
  // same-line spans (gap ~0) and any negative noise are ignored
  if (
    currentEntry.height > 0 &&
    verticalGap > currentEntry.height * layoutBreak.paragraphGapMultiplier
  ) {
    return true;
  }

  // heading heuristic: a short line with no sentence punctuation whose height is
  // noticeably larger than the following span (a size jump into body text)
  const currentText = currentEntry.text || '';
  const isShort = currentText.length <= layoutBreak.headingMaxChars;
  const hasNoSentencePunctuation = !/[.?!]/.test(currentText);
  const isTallerThanNext =
    nextEntry.height > 0 &&
    currentEntry.height >= nextEntry.height * layoutBreak.headingHeightRatio;

  if (isShort && hasNoSentencePunctuation && isTallerThanNext) {
    return true;
  }

  return false;
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
        height: rect.height,
        text: span.textContent.trim(),
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

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];
    const span = entry.span;
    const text = entry.text;

    if (text.length === 0) {
      continue;
    }

    currentGroup.push(span);

    // close the group on a real sentence-ending mark, or on an obvious layout
    // boundary (page change, paragraph gap, heading) between this span and the
    // next ordered span
    const nextEntry = ordered[i + 1];

    if (isSentenceEnd(text) || shouldBreakBetweenSpans(entry, nextEntry)) {
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
      span.classList.remove('sentence-active'),
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

  let target;

  if (activeGroupIndex === -1) {
    if (event.shiftKey) {
      const lastVisible = findVisibleGroupIndex(true);
      target = lastVisible >= 0 ? lastVisible : sentenceGroups.length - 1;
    } else {
      const firstVisible = findVisibleGroupIndex();
      target = firstVisible >= 0 ? firstVisible : 0;
    }
  } else {
    target = event.shiftKey ? activeGroupIndex - 1 : activeGroupIndex + 1;
  }

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
    span.classList.add('sentence-active'),
  );

  // scroll to new highlight
  sentenceGroups[activeGroupIndex][0].scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
});
