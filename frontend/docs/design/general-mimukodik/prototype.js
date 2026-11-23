// Start from the screen named by this HTML file when opened directly.
// Route changes stay in the fragment so the prototype also runs from file:// URLs.
if (!window.location.hash.startsWith('#/')) {
  const route = document.body.dataset.route;
  window.history.replaceState(null, '', `#${route}${window.location.hash}`);
}
