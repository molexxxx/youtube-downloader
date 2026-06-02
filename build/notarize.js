const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// afterSign hook: submits the universal .app to Apple notarization without waiting.
// The CI notarize-macos job polls for approval, staples the .pkg, then uploads to the release.
exports.default = async function notarize({ electronPlatformName, appOutDir, packager, arch }) {
  // Arch enum from electron-builder: universal = 4. Skip the per-arch temp builds.
  if (electronPlatformName !== 'darwin' || arch !== 4) return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('Notarization skipped: Apple credentials not set');
    return;
  }

  const appPath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  console.log(`Submitting "${appPath}" for notarization (no-wait)...`);

  const raw = execSync(
    `xcrun notarytool submit "${appPath}" ` +
    `--apple-id "${APPLE_ID}" ` +
    `--password "${APPLE_APP_SPECIFIC_PASSWORD}" ` +
    `--team-id "${APPLE_TEAM_ID}" ` +
    `--no-wait --output-format json`,
    { encoding: 'utf8' }
  );

  const { id, status } = JSON.parse(raw);
  console.log(`Notarization submitted — id: ${id}  initial status: ${status}`);

  // Write submission ID to workspace root so the CI job can read it as an artifact.
  fs.writeFileSync(
    path.join(process.cwd(), 'notarization-submission.json'),
    JSON.stringify({ id, status }, null, 2)
  );
};
