import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  // 1. Locate the vanilla login.html file inside the public folder
  const filePath = path.join(process.cwd(), 'public', 'login.html');
  
  // 2. Read the file directly from disk
  const htmlContent = fs.readFileSync(filePath, 'utf-8');

  // 3. Send it straight to the browser as a clean HTML response
  return new NextResponse(htmlContent, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}