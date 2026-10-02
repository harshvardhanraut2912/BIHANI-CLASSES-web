// app/api/download-apk/route.js
//
// Proxies the APK from GitHub Releases through our own domain. A plain
// <a href> straight to a github.com release URL makes the browser
// visibly navigate through github.com before the download kicks in.
// Fetching it server-side and streaming the response back with our own
// Content-Disposition header means the browser only ever sees
// ynclasses.in and starts the download immediately, no GitHub UI flash.
//
// Keep this in sync with the URL in app/api/app-version/route.js and
// app/android/download/page.js whenever you cut a new release.

export const runtime = 'nodejs';

const GITHUB_APK_URL =
  'https://github.com/harshvardhanraut2912/YN-CLASSES-app/releases/download/v1.5-gamma/YNCLASSES-V-1.5-gamma.apk';
const DOWNLOAD_FILENAME = 'YNCLASSES-V-1.5-gamma.apk';

export async function GET() {
  const upstream = await fetch(GITHUB_APK_URL, { redirect: 'follow' });

  if (!upstream.ok || !upstream.body) {
    return new Response('Could not fetch the APK from GitHub Releases.', { status: 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/vnd.android.package-archive');
  headers.set('Content-Disposition', `attachment; filename="${DOWNLOAD_FILENAME}"`);
  const contentLength = upstream.headers.get('content-length');
  if (contentLength) headers.set('Content-Length', contentLength);

  // Stream straight through -- don't buffer the whole APK in memory.
  return new Response(upstream.body, { status: 200, headers });
}
