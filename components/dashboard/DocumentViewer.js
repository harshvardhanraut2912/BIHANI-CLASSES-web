'use client';

// components/dashboard/DocumentViewer.js
//
// Direct port of dashboard.html's "ZERO-FOOTPRINT DOCUMENT VIEWER ENGINE"
// (triggerInlineWorkspace + everything under the "PREMIUM DRM VIEWER" /
// "RENDER ENGINES" / "VIEWER CONTROLS" / "DRM DOWNLOAD MANAGER" comment
// blocks), rebuilt as a self-contained React overlay instead of DOM string
// injection. Behavior is unchanged:
//
//   - .html products  -> fetched via POST /api/document (unchanged route,
//                        same Authorization: Bearer <access_token> contract)
//                        and mounted through an iframe's `srcdoc` (never a
//                        src URL), sandboxed, so the tool's own CSS/JS is
//                        fully isolated from the dashboard shell.
//   - .pdf products   -> fetched as a blob, decoded fully in-memory via
//                        pdf.js -- imported as a real npm module
//                        (pdfjs-dist, pinned to the same 2.16.105 API this
//                        was originally built against) instead of a CDN
//                        <script> tag, since Turbopack's module runtime and
//                        a raw injected UMD script don't reliably agree on
//                        where the global lands. Rendered page-by-page onto
//                        <canvas> elements in a continuous-scroll stack.
//                        Pages lazily rasterize as they scroll near-view
//                        (IntersectionObserver), zoom re-rasterizes at
//                        devicePixelRatio for crisp output, pinch-to-zoom
//                        is confined to the viewer.
//   - image products  -> fetched as a blob, shown via a short-lived
//                        object URL that's revoked immediately on load.
//   - Download button only works when product.allow_download is true;
//                        otherwise it shows the same "Action Blocked" toast.
//
// NEW vs the old dashboard.html version: the toolbar is fully responsive.
// Under 720px it collapses to icon-only controls and pins itself to the
// bottom of the screen (thumb reach), the zoom slider drops in favor of
// simple +/- steppers under 480px, and the header/back affordance is a
// sticky top bar with a large tap target instead of a text link.

import { useEffect, useRef, useState, useCallback } from 'react';
import styles from './dashboard.module.css';
import LoadingAnimation from '@/components/common/LoadingAnimation';

const PDFJS_VERSION = '2.16.105';
// Worker still comes from the CDN (a plain, isolated Worker script -- no
// bundler/module-scope ambiguity there, unlike the old main-thread UMD
// script tag), pinned to the exact same version as the npm package below so
// their internal message protocol matches.
const PDFJS_WORKER_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let pdfjsLibPromise = null;

function loadPdfJsLibrary() {
    if (!pdfjsLibPromise) {
        // NOTE: intentionally the *non*-legacy build ('pdfjs-dist/build/pdf',
        // not 'pdfjs-dist/legacy/build/pdf'). The legacy build targets older
        // browsers/Node and its canvas fallback path does a static
        // `require("canvas")` for a server-side rendering scenario this
        // client-only viewer never hits -- but Turbopack still tries to
        // resolve it at build time and fails, since `canvas` (the native npm
        // package) isn't installed. The standard build has no such
        // reference and works fine in every browser this dashboard targets.
        pdfjsLibPromise = import('pdfjs-dist/build/pdf').then((mod) => {
            const lib = mod?.default ?? mod;
            lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return lib;
        }).catch((err) => {
            pdfjsLibPromise = null; // allow retry on next open instead of caching a permanent failure
            throw err;
        });
    }
    return pdfjsLibPromise;
}

export default function DocumentViewer({ product, accessToken, onClose }) {
    const fileExtension = (product.document_path || '').split('.').pop().toLowerCase();
    const isHtml = fileExtension === 'html';
    const isPdf = fileExtension === 'pdf';
    const isDownloadable = product.allow_download === true;

    const [loading, setLoading] = useState(true);
    const [loadingText, setLoadingText] = useState(
        isHtml ? 'Initializing Core Workspace Environment…' : 'Authenticating & Decrypting Asset Layout…'
    );
    const [errorText, setErrorText] = useState(null);
    const [htmlSrcDoc, setHtmlSrcDoc] = useState(null);
    const [pageIndicator, setPageIndicator] = useState('Page --');
    const [zoomPct, setZoomPct] = useState(100);
    const [zoomSliderVal, setZoomSliderVal] = useState(1.0);
    const [toast, setToast] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const overlayRef = useRef(null);
    const renderTargetRef = useRef(null);
    const pagesStackRef = useRef(null);
    const imageElRef = useRef(null);

    // Imperative engine state -- mirrors the old `viewerState` global object
    // 1:1. Kept in a ref (not React state) because pdf.js proxies, canvas
    // nodes, and in-flight render tasks are not serializable/renderable
    // state; only the small derived bits above (pageIndicator, zoomPct)
    // are mirrored into React state for the toolbar to display.
    const engine = useRef({
        pdfjsLib: null,
        pdfInstance: null,
        numPages: 0,
        pageStates: [],
        pageObserver: null,
        zoomRenderTimer: null,
        pageNum: 1,
        zoom: 1.0,
        blobRef: null,
    });

    const showToast = useCallback((message) => {
        setToast(message);
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ---------------- Load + mount the document ----------------
    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const response = await fetch('/api/document', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${accessToken || ''}`,
                    },
                    body: JSON.stringify({ path: product.document_path }),
                });
                if (!response.ok) throw new Error('Security clearance rejected.');

                if (isHtml) {
                    const rawHtmlString = await response.text();
                    if (cancelled) return;
                    setHtmlSrcDoc(rawHtmlString);
                    setLoading(false);
                    return;
                }

                const blob = await response.blob();
                if (cancelled) return;
                engine.current.blobRef = blob;

                if (isPdf) {
                    try {
                        engine.current.pdfjsLib = await loadPdfJsLibrary();
                    } catch (libErr) {
                        console.error('pdf.js failed to load:', libErr);
                        if (!cancelled) setErrorText('Failed to load the PDF engine. Check your network and refresh.');
                        return;
                    }
                    if (cancelled) return;
                    await renderPdfFromMemory(blob);
                } else {
                    renderImageFromMemory(blob);
                }
                if (!cancelled) setLoading(false);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setErrorText('Failed to load secure asset. Check your network or permissions.');
                }
            }
        }

        load();

        return () => {
            cancelled = true;
            if (engine.current.pageObserver) engine.current.pageObserver.disconnect();
            clearTimeout(engine.current.zoomRenderTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [product.document_path]);

    // ---------------- PDF render pipeline ----------------
    async function renderPdfFromMemory(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const loadingTask = engine.current.pdfjsLib.getDocument({ data: arrayBuffer });
        engine.current.pdfInstance = await loadingTask.promise;
        engine.current.numPages = engine.current.pdfInstance.numPages;

        const firstPage = await engine.current.pdfInstance.getPage(1);
        const baseViewport = firstPage.getViewport({ scale: 1 });
        const renderTarget = renderTargetRef.current;
        const availableWidth = (renderTarget?.clientWidth || 800) - 48;
        let fitZoom = availableWidth / baseViewport.width;
        fitZoom = Math.min(3.0, Math.max(0.5, fitZoom));
        engine.current.zoom = fitZoom;
        setZoomSliderVal(fitZoom);
        setZoomPct(Math.round(fitZoom * 100));

        await buildPdfPagesScaffold();
    }

    async function buildPdfPagesScaffold() {
        const stack = pagesStackRef.current;
        if (!stack) return;
        stack.innerHTML = '';
        engine.current.pageStates = [];

        for (let i = 1; i <= engine.current.numPages; i++) {
            const page = await engine.current.pdfInstance.getPage(i);
            const baseViewport = page.getViewport({ scale: 1 });

            const wrapper = document.createElement('div');
            wrapper.className = styles.pdfPageWrapper;
            wrapper.dataset.pageNum = i;
            wrapper.style.width = baseViewport.width * engine.current.zoom + 'px';
            wrapper.style.height = baseViewport.height * engine.current.zoom + 'px';

            const canvas = document.createElement('canvas');
            canvas.style.display = 'block';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            wrapper.appendChild(canvas);
            stack.appendChild(wrapper);

            engine.current.pageStates.push({
                pageNum: i,
                proxy: page,
                baseViewport,
                wrapperEl: wrapper,
                canvasEl: canvas,
                renderedAtZoom: null,
                renderTask: null,
            });
        }

        setPageIndicator(`Page 1 / ${engine.current.numPages}`);
        engine.current.pageNum = 1;
        setupPdfPageObserver();
        updateStackHorizontalPadding();

        renderPageCrisp(engine.current.pageStates[0]);
        if (engine.current.pageStates[1]) renderPageCrisp(engine.current.pageStates[1]);
    }

    function updateStackHorizontalPadding() {
        const stack = pagesStackRef.current;
        const root = renderTargetRef.current;
        if (!stack || !root || !engine.current.pageStates.length) return;

        const availableWidth = root.clientWidth - 48;
        const maxPageWidth = Math.max(...engine.current.pageStates.map((ps) => ps.baseViewport.width * engine.current.zoom));
        const sidePadding = Math.max(0, (availableWidth - maxPageWidth) / 2);

        stack.style.paddingLeft = sidePadding + 'px';
        stack.style.paddingRight = sidePadding + 'px';
    }

    function setupPdfPageObserver() {
        if (engine.current.pageObserver) engine.current.pageObserver.disconnect();

        const root = renderTargetRef.current;
        engine.current.pageObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const pageNum = parseInt(entry.target.dataset.pageNum, 10);
                    const pageState = engine.current.pageStates[pageNum - 1];
                    if (!pageState) return;
                    if (entry.isIntersecting) {
                        if (!pageState.renderedAtZoom) renderPageCrisp(pageState);
                        if (entry.intersectionRatio > 0.5) {
                            engine.current.pageNum = pageNum;
                            setPageIndicator(`Page ${pageNum} / ${engine.current.numPages}`);
                        }
                    }
                });
            },
            { root, rootMargin: '600px 0px', threshold: [0, 0.5, 1] }
        );

        engine.current.pageStates.forEach((ps) => engine.current.pageObserver.observe(ps.wrapperEl));
    }

    async function renderPageCrisp(pageState) {
        if (!pageState) return;
        const targetZoom = engine.current.zoom;

        if (pageState.renderTask) {
            try { pageState.renderTask.cancel(); } catch (e) { /* no-op */ }
        }

        const outputScale = Math.min(window.devicePixelRatio || 1, 3);
        const renderScale = targetZoom * outputScale;
        const viewport = pageState.proxy.getViewport({ scale: renderScale });

        const canvas = pageState.canvasEl;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = viewport.width / outputScale + 'px';
        canvas.style.height = viewport.height / outputScale + 'px';
        canvas.style.transform = '';

        const ctx = canvas.getContext('2d');
        const renderTask = pageState.proxy.render({ canvasContext: ctx, viewport });
        pageState.renderTask = renderTask;

        try {
            await renderTask.promise;
            pageState.renderedAtZoom = targetZoom;
        } catch (err) {
            if (err && err.name !== 'RenderingCancelledException') console.error(err);
        }
    }

    // ---------------- Image render ----------------
    function renderImageFromMemory(blob) {
        const img = imageElRef.current;
        if (!img) return;
        const objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
        img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            setPageIndicator('Slide 1 / 1');
            applyImageTransform(engine.current.zoom);
        };
    }

    function applyImageTransform(zoom) {
        const img = imageElRef.current;
        if (!img) return;
        img.style.transform = `scale(${zoom})`;
        img.style.transformOrigin = 'top center';
        img.style.transition = 'transform 0.2s ease';
    }

    // ---------------- Zoom controls ----------------
    const setViewerZoom = useCallback((newZoom) => {
        newZoom = Math.min(3.0, Math.max(0.5, newZoom));
        engine.current.zoom = newZoom;
        setZoomSliderVal(newZoom);
        setZoomPct(Math.round(newZoom * 100));

        if (isPdf) {
            engine.current.pageStates.forEach((ps) => {
                ps.wrapperEl.style.width = ps.baseViewport.width * newZoom + 'px';
                ps.wrapperEl.style.height = ps.baseViewport.height * newZoom + 'px';
                if (ps.renderedAtZoom) {
                    const previewScale = newZoom / ps.renderedAtZoom;
                    ps.canvasEl.style.transformOrigin = 'top left';
                    ps.canvasEl.style.transform = `scale(${previewScale})`;
                }
            });
            updateStackHorizontalPadding();

            clearTimeout(engine.current.zoomRenderTimer);
            engine.current.zoomRenderTimer = setTimeout(() => {
                const root = renderTargetRef.current;
                if (!root) return;
                const rootRect = root.getBoundingClientRect();
                engine.current.pageStates.forEach((ps) => {
                    const rect = ps.wrapperEl.getBoundingClientRect();
                    const isNearVisible = rect.bottom > rootRect.top - 1000 && rect.top < rootRect.bottom + 1000;
                    if (isNearVisible) renderPageCrisp(ps);
                });
            }, 220);
        } else {
            applyImageTransform(newZoom);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPdf]);

    function viewerPageChange(delta) {
        if (!isPdf || !engine.current.pdfInstance) return;
        const newPage = engine.current.pageNum + delta;
        if (newPage >= 1 && newPage <= engine.current.numPages) scrollToPage(newPage);
    }

    function scrollToPage(pageNum) {
        const pageState = engine.current.pageStates[pageNum - 1];
        if (!pageState) return;
        engine.current.pageNum = pageNum;
        setPageIndicator(`Page ${pageNum} / ${engine.current.numPages}`);
        pageState.wrapperEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!pageState.renderedAtZoom) renderPageCrisp(pageState);
    }

    // ---------------- Pinch-to-zoom (confined to the viewer) ----------------
    useEffect(() => {
        if (isHtml || loading) return;
        const target = renderTargetRef.current;
        if (!target) return;

        target.style.touchAction = 'pan-x pan-y';

        let pinchActive = false;
        let prevDist = 0;
        let prevMidX = 0;
        let prevMidY = 0;

        const getDistance = (touches) => Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
        );
        const getMidpoint = (touches) => ({
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        });

        function onTouchStart(e) {
            if (e.touches.length === 2) {
                pinchActive = true;
                prevDist = getDistance(e.touches);
                const mid = getMidpoint(e.touches);
                prevMidX = mid.x;
                prevMidY = mid.y;
            }
        }

        function onTouchMove(e) {
            if (pinchActive && e.touches.length === 2) {
                e.preventDefault();
                const rect = target.getBoundingClientRect();
                const newDist = getDistance(e.touches);
                const mid = getMidpoint(e.touches);

                const contentX = target.scrollLeft + (mid.x - rect.left);
                const contentY = target.scrollTop + (mid.y - rect.top);
                const oldZoom = engine.current.zoom;
                const zoomRatio = prevDist > 0 ? newDist / prevDist : 1;
                setViewerZoom(oldZoom * zoomRatio);
                const appliedRatio = engine.current.zoom / oldZoom;

                let newScrollTop = contentY * appliedRatio - (mid.y - rect.top);
                let newScrollLeft = contentX * appliedRatio - (mid.x - rect.left);
                newScrollTop -= mid.y - prevMidY;
                newScrollLeft -= mid.x - prevMidX;

                target.scrollTop = newScrollTop;
                target.scrollLeft = newScrollLeft;

                prevDist = newDist;
                prevMidX = mid.x;
                prevMidY = mid.y;
            }
        }

        function endPinch() { pinchActive = false; }

        target.addEventListener('touchstart', onTouchStart, { passive: true });
        target.addEventListener('touchmove', onTouchMove, { passive: false });
        target.addEventListener('touchend', endPinch);
        target.addEventListener('touchcancel', endPinch);

        return () => {
            target.removeEventListener('touchstart', onTouchStart);
            target.removeEventListener('touchmove', onTouchMove);
            target.removeEventListener('touchend', endPinch);
            target.removeEventListener('touchcancel', endPinch);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, isHtml, setViewerZoom]);

    // ---------------- Fullscreen ----------------
    useEffect(() => {
        function onFsChange() {
            setIsFullscreen(!!document.fullscreenElement);
        }
        document.addEventListener('fullscreenchange', onFsChange);
        return () => document.removeEventListener('fullscreenchange', onFsChange);
    }, []);

    function toggleFullscreen() {
        const el = overlayRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            el.requestFullscreen?.().catch((err) => console.error('Full screen request failed:', err));
        } else {
            document.exitFullscreen?.();
        }
    }

    // ---------------- Download ----------------
    function attemptSecureDownload() {
        if (!isDownloadable) {
            showToast('Action Blocked: This asset is restricted for viewing only.');
            return;
        }
        if (!engine.current.blobRef) return;
        const url = window.URL.createObjectURL(engine.current.blobRef);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = product.document_path.split('/').pop();
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // ---------------- Escape-to-close ----------------
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape' && !document.fullscreenElement) onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className={styles.viewerOverlay} ref={overlayRef}>
            <div className={styles.viewerHeaderBar}>
                <button type="button" className={styles.viewerBackBtn} onClick={onClose} aria-label="Back to library">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                    </svg>
                    <span className={styles.viewerBackLabel}>Back</span>
                </button>
                <div className={styles.viewerTitleWrap}>
                    <div className={styles.viewerTitle}>{product.title}</div>
                    <div className={styles.viewerSubtitle}>
                        {isHtml ? 'Interactive Workspace Application Layer' : 'Secure Vault Reader'}
                    </div>
                </div>
                <button type="button" className={styles.viewerCloseBtn} onClick={onClose} aria-label="Close">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>
            </div>

            {isHtml ? (
                <div className={styles.viewerBodyHtml}>
                    {loading && !errorText ? (
                        <LoadingAnimation message={loadingText} />
                    ) : errorText ? (
                        <div className={styles.stateMessage}>{errorText}</div>
                    ) : (
                        <iframe
                            title={product.title}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
                            className={styles.viewerHtmlFrame}
                            srcDoc={htmlSrcDoc}
                        />
                    )}
                </div>
            ) : (
                <>
                    <div className={styles.viewerToolbar}>
                        <div className={styles.viewerToolbarGroup}>
                            <button
                                type="button"
                                className={styles.viewerToolBtn}
                                onClick={() => viewerPageChange(-1)}
                                disabled={!isPdf}
                                aria-label="Previous page"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" /></svg>
                            </button>
                            <span className={styles.viewerPageIndicator}>{pageIndicator}</span>
                            <button
                                type="button"
                                className={styles.viewerToolBtn}
                                onClick={() => viewerPageChange(1)}
                                disabled={!isPdf}
                                aria-label="Next page"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.59 16.59 10 18l6-6-6-6-1.41 1.41L13.17 12z" /></svg>
                            </button>
                        </div>

                        <div className={styles.viewerToolbarGroup}>
                            <button type="button" className={styles.viewerToolBtn} onClick={() => setViewerZoom(engine.current.zoom - 0.2)} aria-label="Zoom out">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13H5v-2h14v2z" /></svg>
                            </button>
                            <input
                                type="range"
                                className={styles.viewerZoomSlider}
                                min="0.5"
                                max="3.0"
                                step="0.1"
                                value={zoomSliderVal}
                                onChange={(e) => setViewerZoom(parseFloat(e.target.value))}
                            />
                            <button type="button" className={styles.viewerToolBtn} onClick={() => setViewerZoom(engine.current.zoom + 0.2)} aria-label="Zoom in">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" /></svg>
                            </button>
                            <span className={styles.viewerZoomPct}>{zoomPct}%</span>
                        </div>

                        <div className={styles.viewerToolbarGroup}>
                            <button
                                type="button"
                                className={`${styles.viewerToolBtn} ${!isDownloadable ? styles.viewerToolBtnDisabled : ''}`}
                                title={isDownloadable ? 'Download File' : 'Download Disabled'}
                                onClick={attemptSecureDownload}
                                aria-label="Download"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg>
                            </button>
                            <button
                                type="button"
                                className={`${styles.viewerToolBtn} ${styles.viewerFullscreenBtn}`}
                                title="Toggle Fullscreen"
                                onClick={toggleFullscreen}
                                aria-label="Toggle fullscreen"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                    {isFullscreen ? (
                                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                                    ) : (
                                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                                    )}
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className={styles.viewerBody} ref={renderTargetRef}>
                        {loading && !errorText ? (
                            <LoadingAnimation message={loadingText} />
                        ) : errorText ? (
                            <div className={styles.stateMessage}>{errorText}</div>
                        ) : null}

                        {isPdf ? (
                            <div className={styles.pdfPagesStack} ref={pagesStackRef} />
                        ) : (
                            <img
                                ref={imageElRef}
                                className={styles.viewerImage}
                                style={{ display: loading || errorText ? 'none' : 'block' }}
                                onContextMenu={(e) => e.preventDefault()}
                                draggable={false}
                                alt={product.title}
                            />
                        )}
                    </div>
                </>
            )}

            {toast ? <div className={styles.viewerToast}>{toast}</div> : null}
        </div>
    );
}
