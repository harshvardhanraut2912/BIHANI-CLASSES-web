# PDF converter (needed for Exams -> PDF on Vercel)

`Download as PDF` builds a Word file and converts it with LibreOffice. LibreOffice cannot run
inside a Vercel function, so it runs here instead, as a separate service. Localhost keeps working
without it if LibreOffice is installed on your PC.

## Deploy on Render (same place as your backend)
1. Push the project to GitHub (this folder must be in the repo).
2. Render -> New -> Blueprint -> select the repo (uses `pdf-converter/render.yaml`).
   Or: New -> Web Service -> Runtime **Docker** -> Root Directory `pdf-converter`.
3. In the service's Environment tab, copy the generated `GOTENBERG_API_BASIC_AUTH_PASSWORD`.
4. Open `https://<service>.onrender.com/health` -> should show `{"status":"up",...}`.

## Connect Vercel
Vercel -> bihani-classes-web -> Settings -> Environment Variables (Production):

    PDF_CONVERTER_URL   = https://<service>.onrender.com
    PDF_CONVERTER_USER  = bihani
    PDF_CONVERTER_PASS  = <the password from step 3>

Then **Redeploy** (env changes apply only to new deployments).

## Notes
- Free Render instances sleep when idle; the first PDF after a break can take ~1 minute
  (the site retries automatically). Paid "starter" removes this.
- Any Docker host works (Cloud Run, Fly.io, Railway): same image, same env variables.
- Keep the basic-auth password set; without it anyone could use your converter.
