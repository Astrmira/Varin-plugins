// Apply a saved preference before first paint. Storage may be unavailable in private contexts.
try {
  const choice = localStorage.getItem('varin-market-theme');
  if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
} catch { /* System preference remains usable without storage. */ }
