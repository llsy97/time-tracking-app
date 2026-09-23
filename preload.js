window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector);
    if (element) {
      element.textContent = text;
    }
  };

  replaceText('app-version', 'Desktop App');
});
