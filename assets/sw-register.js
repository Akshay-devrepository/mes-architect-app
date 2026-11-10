if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
// Runs here (not in the earlier INIT block) because window.capacitorApp
// only exists once the vendor <script src> tags above have executed —
// this inline block is the first point after that where it's safe to use.
initHardwareBackButton();
