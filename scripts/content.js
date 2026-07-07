const paragraphs = document.getElementsByTagName('p');

let paragraphTabCount = -1;

if (paragraphs.length > 0) {
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (paragraphTabCount >= 0) {
        paragraphs[paragraphTabCount].classList.remove('active-paragraph');
      }
      paragraphTabCount = -1;
      return;
    }

    if (event.key !== 'Tab') return;

    event.preventDefault();

    if (paragraphTabCount >= 0) {
      paragraphs[paragraphTabCount].classList.remove('active-paragraph');
    }

    if (event.shiftKey) {
      paragraphTabCount--;
    } else {
      paragraphTabCount++;
    }

    if (paragraphTabCount < 0) {
      paragraphTabCount = paragraphs.length - 1;
    }

    if (paragraphTabCount >= paragraphs.length) {
      paragraphTabCount = 0;
    }

    paragraphs[paragraphTabCount].classList.add('active-paragraph');
  });
}
