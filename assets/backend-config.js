// Backend switch. While apiBase is null the app runs exactly as before
// (license keys, direct AI calls). Set both values once the Worker and the
// Firebase project exist — scripts/set-backend-config.js does it and also
// adds the API origin to the CSP's connect-src in index.html.
window.MES_BACKEND = {
  apiBase: null,        // e.g. 'https://mes-architect-api.<your-subdomain>.workers.dev'
  firebaseApiKey: null  // Firebase Web API key (public by design; restrict it in Google Cloud)
};
