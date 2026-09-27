const LANGUAGE_STORAGE_KEY = 'gsat-legal-language';

function normalizedLanguage(value) {
  return String(value || '').toLowerCase().startsWith('zh') ? 'zh-Hant' : 'en';
}

function storedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function initialLanguage() {
  const requested = new URL(window.location.href).searchParams.get('lang');
  if (requested) return normalizedLanguage(requested);
  const saved = storedLanguage();
  if (saved) return normalizedLanguage(saved);
  return normalizedLanguage(navigator.language);
}

function pageMetadata(language) {
  const suffix = language === 'zh-Hant' ? 'Zh' : 'En';
  return {
    title: document.body.dataset[`pageTitle${suffix}`] || document.title,
    description: document.body.dataset[`pageDescription${suffix}`] || '',
  };
}

function updateLanguageUrl(language) {
  const url = new URL(window.location.href);
  url.searchParams.set('lang', language === 'zh-Hant' ? 'zh' : 'en');
  history.replaceState(null, '', url);
}

function saveLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Switching remains available when browser storage is unavailable.
  }
}

function applyLanguage(language, persist) {
  const selected = normalizedLanguage(language);
  document.documentElement.lang = selected;
  document.querySelectorAll('[data-legal-panel]').forEach(function (panel) {
    panel.hidden = panel.getAttribute('data-legal-panel') !== selected;
  });
  document.querySelectorAll('[data-legal-language]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.getAttribute('data-legal-language') === selected));
  });
  const metadata = pageMetadata(selected);
  document.title = metadata.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description);
  if (persist) {
    saveLanguage(selected);
    updateLanguageUrl(selected);
  }
}

document.querySelectorAll('[data-legal-language]').forEach(function (button) {
  button.addEventListener('click', function () {
    applyLanguage(button.getAttribute('data-legal-language'), true);
  });
});

applyLanguage(initialLanguage(), false);

