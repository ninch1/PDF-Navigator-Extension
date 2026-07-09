// index of the currently highlighted sentence group
let activeGroupIndex = -1;

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

// rebuilds sentence groups directly from the original PDF.js text spans
function updateSentenceGroups() {
  const textSpans = document.querySelectorAll('.textLayer > span');
  sentenceGroups = [];

  let currentGroup = [];

  for (let i = 0; i < textSpans.length; i++) {
    const span = textSpans[i];
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

  // PDF.js renders text dynamically, so watch the viewer for new text spans
  const observer = new MutationObserver(() => {
    updateSentenceGroups();
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
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    clearActiveGroup();
    activeGroupIndex = -1;
    return;
  }

  if (event.key !== 'Tab') return;

  // prevent Tab from focusing PDF.js toolbar/buttons
  event.preventDefault();
  event.stopPropagation();

  if (sentenceGroups.length <= 0) return;

  // remove old highlight
  clearActiveGroup();

  // get new index
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
