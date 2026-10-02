export async function GET() {
  return Response.json({
    latest_native_version: "1.5-gamma",
    force_update: false,
    apk_url: "https://github.com/harshvardhanraut2912/YN-CLASSES-app/releases/download/v1.5-gamma/YNCLASSES-V-1.5-gamma.apk",
    notes: "Version 1.5-gamma is here — update now."
  });
}
