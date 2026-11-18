// Backend switch. While apiBase is null the app runs exactly as before
// (license keys, direct AI calls). Set both values once the Worker and the
// Firebase project exist — scripts/set-backend-config.js does it and also
// adds the API origin to the CSP's connect-src in index.html.
window.MES_BACKEND = {
  apiBase: 'https://mes-architect-api.primeatnit.workers.dev',        // e.g. 'https://mes-architect-api.<your-subdomain>.workers.dev'
  firebaseApiKey: 'AIzaSyDAlYLHXL3VKJSa7ZoLAqFNo2-C5di60oE'
};
