// Overwritten by the "Build Android APK" CI workflow before every build,
// using the git commit count as the version code. 0 means "not a native
// build" (plain website) — update-check.js no-ops in that case.
window.APP_VERSION_CODE = 0;
window.APP_VERSION_NAME = "dev";
