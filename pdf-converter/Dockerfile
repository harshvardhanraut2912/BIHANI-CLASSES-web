# PDF converter service for the "Exams -> PDF" feature.
# Gotenberg = LibreOffice + fonts in a container with a small HTTP API.
# Vercel cannot run LibreOffice, so the website sends the .docx here and gets a PDF back.
FROM gotenberg/gotenberg:8

# Render/Cloud Run give the port in $PORT; basic auth is read from
#   GOTENBERG_API_BASIC_AUTH_USERNAME / GOTENBERG_API_BASIC_AUTH_PASSWORD
# Only LibreOffice is needed, so Chromium is not started (saves RAM on a small instance).
CMD ["gotenberg", \
     "--api-port-from-env=PORT", \
     "--api-enable-basic-auth", \
     "--api-timeout=90s", \
     "--chromium-auto-start=false", \
     "--libreoffice-auto-start=true"]
