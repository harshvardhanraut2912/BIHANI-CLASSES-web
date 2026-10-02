// app/api/images/route.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let rawPath = searchParams.get('path');
  if (!rawPath) return NextResponse.json({ error: 'Asset reference path parameter missing.' }, { status: 400 });
  return processAndStreamGithubAsset(rawPath);
}

export async function POST(request) {
  try {
    const body = await request.json();
    let rawPath = body.path;
    if (!rawPath) return NextResponse.json({ error: 'Asset reference path parameter missing.' }, { status: 400 });
    return processAndStreamGithubAsset(rawPath);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid payload execution constraint.' }, { status: 400 });
  }
}

async function processAndStreamGithubAsset(rawPath) {
  if (!process.env.GITHUB_TOKEN) {
    console.error("❌ DEBUG: GITHUB_TOKEN is missing from .env.local!");
    return NextResponse.json({ error: 'Server authentication unconfigured.' }, { status: 500 });
  }

  try {
    const githubOwner = "harshvardhanraut2912";
    const githubRepo = "mht-cet-images";
    
    // Decode space variables (%20 -> " ")
    let cleanPath = decodeURIComponent(rawPath).replace(/^\//, '');

    // 🚨 DEBUG LOG: Look at your command prompt terminal to see exactly what this says!
    console.log("----------------------------------------");
    console.log(`🚀 WEBSITE IS LOOKING FOR THIS PATH: "${cleanPath}"`);
    console.log(`🔐 USING TOKEN (First 8 characters): ${process.env.GITHUB_TOKEN.substring(0, 8)}...`);

    const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${cleanPath}`;
    
    let githubResponse = await fetch(githubApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.raw'
      }
    });

    if (!githubResponse.ok) {
      // 🚨 DEBUG LOG: Prints the exact reason why GitHub rejected it
      console.error(`❌ GITHUB REJECTED IT! Status Code: ${githubResponse.status}`);
      console.log("----------------------------------------");
      return NextResponse.json({ error: 'Target media asset not found.' }, { status: 404 });
    }

    console.log("✅ SUCCESS: Asset found and streaming!");
    console.log("----------------------------------------");

    const fileBlob = await githubResponse.blob();
    let contentType = 'image/png';
    if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (cleanPath.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (cleanPath.endsWith('.ico')) contentType = 'image/x-icon';

    return new NextResponse(fileBlob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });

  } catch (err) {
    console.error("Secure Image API Exception:", err);
    return NextResponse.json({ error: 'Internal streaming execution fault.' }, { status: 500 });
  }
}