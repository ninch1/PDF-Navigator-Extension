# PDF Sentence Navigator

PDF Sentence Navigator is a Chrome Extension that opens PDFs in a bundled PDF.js viewer and lets users navigate through PDF text with keyboard shortcuts.

The extension highlights the currently active sentence or sentence-like text group and allows users to move forward and backward through the PDF using `Tab` and `Shift + Tab`.

This project was built for a Chrome Extension assignment using Manifest V3.

## Features

- Opens PDFs in a bundled PDF.js viewer
- Navigates forward through sentence groups with `Tab`
- Navigates backward through sentence groups with `Shift + Tab`
- Highlights the active sentence group inside the PDF
- Clears the active highlight with `Escape`
- Clears the active highlight when the user clicks inside the document
- Supports long PDFs by working with PDF.js lazy rendering
- Uses layout-aware grouping to reduce very large highlighted chunks
- Runs locally in the browser without sending PDF text to an external server

## How It Works

The extension uses a bundled PDF.js viewer instead of Chrome's native PDF viewer.

PDF.js renders selectable PDF text into text-layer spans. The extension reads the visible text spans from the PDF.js text layer, sorts them into visual reading order, groups them into sentence-like chunks, and highlights the active group during keyboard navigation.

The extension does not split or rewrite PDF.js text spans. PDF.js controls the position and layout of those spans, so modifying them directly can break text rendering. Instead, the extension only adds and removes a CSS highlight class from the original PDF.js text spans.

## Sentence Grouping

Sentence groups are created from the PDF.js text layer.

The extension groups text spans together until it detects either:

- a real sentence-ending punctuation mark
- a page boundary
- a large vertical gap that looks like a paragraph break
- a short heading-like line before smaller body text

The sentence-ending logic includes checks for common cases such as abbreviations, decimals, URLs, and email addresses so that periods in text like `Dr.`, `e.g.`, `3.14`, or `example.com` are not always treated as sentence endings.

## Keyboard Controls

| Shortcut      | Action                              |
| ------------- | ----------------------------------- |
| `Tab`         | Move to the next sentence group     |
| `Shift + Tab` | Move to the previous sentence group |
| `Escape`      | Clear the active highlight          |
| Mouse click   | Clear the active highlight          |

## Installation

1. Clone or download this repository.
2. Open Google Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the project folder.
7. Click the extension icon.
8. Open the bundled PDF viewer from the extension popup.

## Testing

The project can be tested with the included sample PDFs.

Recommended test cases:

- a short normal text PDF
- a long book PDF
- a PDF with headings and paragraphs
- a PDF with bullet points or numbered lists
- a two-column article or research paper
- a scanned/image-only PDF

To test a PDF, open it in the bundled PDF.js viewer and use `Tab` / `Shift + Tab` to navigate through the highlighted sentence groups.

## Test PDFs

The `test-pdfs/` folder contains PDFs used during development and testing.

These PDFs are included to check different behavior:

- normal paragraph text
- long PDF navigation
- heading and paragraph grouping
- multi-column layout behavior
- scanned/image-only PDF behavior

Scanned/image-only PDFs are expected not to work unless they contain selectable OCR text.

## Privacy

All PDF text processing happens locally in the browser.

The extension does not send PDF text, document content, or navigation data to an external server.

## Known Limitations

- Scanned or image-only PDFs are not supported unless the PDF contains selectable/OCR text.
- Multi-column PDFs may not always follow perfect reading order.
- Highlighting is based on PDF.js text spans, so a highlight may sometimes include nearby text when a sentence boundary occurs inside a single span.
- Sentence detection is heuristic-based and may not be perfect for every PDF.
- The current version opens PDFs through the bundled PDF.js viewer. Support for automatically forwarding PDFs opened in Chrome to this viewer is planned as a future improvement.

## Tech Stack

- JavaScript
- HTML
- CSS
- Chrome Extension Manifest V3
- PDF.js

## Future Improvements

Planned or possible improvements include:

- Start navigation from the currently visible page instead of the beginning of the document
- Add popup settings for highlight color, border thickness, and grouping sensitivity
- Allow PDFs opened in Chrome to be forwarded into the extension's bundled PDF.js viewer
- Improve reading order for multi-column PDFs
- Improve partial sentence highlighting when sentence boundaries occur inside a single PDF.js text span
