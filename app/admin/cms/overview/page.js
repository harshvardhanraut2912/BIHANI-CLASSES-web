"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../../lib/supabase"; // Syncs directly to your client connection initialization
import "./overview.css";

export default function CMSOverviewDashboard() {
  // --- CORE DROP-DOWN SELECTOR MATRIX STATE ---
  const [exam, setExam] = useState("MHT-CET");
  const [subject, setSubject] = useState("Physics");
  const [chapter, setChapter] = useState("");
  const [qType, setQType] = useState("Theory");

  // --- LIVE SYLLABUS & INVENTORY MEMORY CHIPS ---
  const [availableChapters, setAvailableChapters] = useState([]);
  const [questionsList, setQuestionsList] = useState([]);
  const [globalDbTree, setGlobalDbTree] = useState([]);
  
  // --- WORKSPACE FUNCTIONAL UTILITY STATES ---
  const [zoomScale, setZoomScale] = useState(60); 
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bookmarkedIds, setBookmarkedIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // --- OVERLAY HUD VISIBILITY TRACKERS ---
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [showBookmarksOverlay, setShowBookmarksOverlay] = useState(false);
  const [showDbInspectorOverlay, setShowDbInspectorOverlay] = useState(false);

  // --- BOOKMARKS VAULT DYNAMIC PAYLOAD TRACKERS ---
  const [bookmarkPayloadList, setBookmarkPayloadList] = useState([]);

  // --- ASSET REPLACEMENT DRAG/DROP + PREVIEW + UPLOAD STATE ---
  const [replacementFiles, setReplacementFiles] = useState({ question: null, solution: null });
  const [replacementPreviews, setReplacementPreviews] = useState({ question: null, solution: null });
  const [dragOverTarget, setDragOverTarget] = useState(null); // 'question' | 'solution' | null
  const [isUploadingReplacement, setIsUploadingReplacement] = useState(false);

  // ==========================================
  // 🟢 DATABASE SYNC 1: PULL LIVE SYLLABUS CHAPTERS
  // ==========================================
  useEffect(() => {
    const fetchSyllabusChapters = async () => {
      try {
        const { data, error } = await supabase
          .from("syllabus_chapters")
          .select("chapter_name")
          .eq("exam", exam)
          .eq("subject", subject)
          .order("chapter_name", { ascending: true });

        if (error) throw error;
        if (data && data.length > 0) {
          setAvailableChapters(data);
          setChapter(data[0].chapter_name);
        } else {
          setAvailableChapters([]);
          setChapter("");
        }
      } catch (err) {
        console.error("Critical Syllabus synchronization drop failure:", err);
      }
    };
    fetchSyllabusChapters();
  }, [exam, subject]);

  // ==========================================
  // 🟢 SYNC A: FETCH LIVE INVENTORY BUNDLES
  // ==========================================
  useEffect(() => {
    const fetchLiveInventoryBundle = async () => {
      if (!chapter) return;
      setIsProcessing(true);
      try {
        const { data, error } = await supabase
          .from("question_bundles")
          .select("questions")
          .eq("exam", exam)
          .eq("subject", subject)
          .eq("chapter", chapter)
          .eq("question_type", qType)
          .maybeSingle();

        if (error) throw error;
        setQuestionsList(data && data.questions ? (Array.isArray(data.questions) ? data.questions : []) : []);
      } catch (err) {
        console.error("Inventory pulling stream failed:", err);
      } finally {
        setIsProcessing(false);
      }
    };
    fetchLiveInventoryBundle();
  }, [exam, subject, chapter, qType]);

  // ==========================================
  // 🟢 SYNC B: PULL LIVE BOOKMARKS FROM TARGET TABLE
  // ==========================================
  useEffect(() => {
    const fetchLiveBookmarksFromSeparateTable = async () => {
      if (!chapter) return;
      try {
        const { data, error } = await supabase
          .from("admin_bookmarks")
          .select("bookmarked_ids")
          .eq("exam", exam)
          .eq("subject", subject)
          .eq("chapter", chapter)
          .eq("question_type", qType)
          .maybeSingle();

        if (error) throw error;
        setBookmarkedIds(data && data.bookmarked_ids ? (Array.isArray(data.bookmarked_ids) ? data.bookmarked_ids : []) : []);
      } catch (err) {
        console.error("Failed syncing cloud bookmarks table ledger:", err);
      }
    };
    fetchLiveBookmarksFromSeparateTable();
  }, [exam, subject, chapter, qType, showBookmarksOverlay]);

  // ==========================================
  // 🟢 SYNC C: DYNAMICALLY ACCUMULATE GLOBAL EXAM BOOKMARKS
  // ==========================================
  useEffect(() => {
    const gatherAllFlaggedBookmarkAssets = async () => {
      if (!showBookmarksOverlay) return;
      try {
        // Query matching entities across both target tables
        const [bundlesRes, bookmarksRes] = await Promise.all([
          supabase.from("question_bundles").select("chapter, question_type, questions").eq("exam", exam).eq("subject", subject),
          supabase.from("admin_bookmarks").select("chapter, question_type, bookmarked_ids").eq("exam", exam).eq("subject", subject)
        ]);

        if (bundlesRes.error) throw bundlesRes.error;
        if (bookmarksRes.error) throw bookmarksRes.error;

        let aggregatedMatches = [];
        
        // Loop through all bookmarks to locate the respective questions across chapters
        bookmarksRes.data.forEach(bookmarkRow => {
          const activeBookmarks = Array.isArray(bookmarkRow.bookmarked_ids) ? bookmarkRow.bookmarked_ids : [];
          if (activeBookmarks.length === 0) return;

          // Find matching chapter row bundle
          const matchingBundle = bundlesRes.data.find(
            b => b.chapter === bookmarkRow.chapter && b.question_type === bookmarkRow.question_type
          );

          if (matchingBundle && Array.isArray(matchingBundle.questions)) {
            const matchedObjects = matchingBundle.questions.filter(q => activeBookmarks.includes(q.q_id));
            aggregatedMatches = [...aggregatedMatches, ...matchedObjects];
          }
        });

        setBookmarkPayloadList(aggregatedMatches);
      } catch (err) {
        console.error("Critical bookmark graphics payload parsing failure:", err);
      }
    };
    gatherAllFlaggedBookmarkAssets();
  }, [showBookmarksOverlay, exam, subject, bookmarkedIds]);

  // ==========================================
  // 🟢 SYNC D: INDEX QUANTITIES FOR TOTAL DB MANIFEST
  // ==========================================
  useEffect(() => {
    const calculateGlobalManifestTree = async () => {
      try {
        const [bundlesRes, bookmarksRes] = await Promise.all([
          supabase.from("question_bundles").select("chapter, question_type, questions").eq("exam", exam).eq("subject", subject),
          supabase.from("admin_bookmarks").select("chapter, question_type, bookmarked_ids").eq("exam", exam).eq("subject", subject)
        ]);

        if (bundlesRes.error) throw bundlesRes.error;
        if (bookmarksRes.error) throw bookmarksRes.error;

        const chapterMap = {};

        bundlesRes.data.forEach(row => {
          const chap = row.chapter;
          const type = row.question_type;
          const count = Array.isArray(row.questions) ? row.questions.length : 0;

          if (!chapterMap[chap]) {
            chapterMap[chap] = { chapterName: chap, theoryCount: 0, numericalCount: 0, totalBookmarks: 0 };
          }
          if (type === "Theory") chapterMap[chap].theoryCount += count;
          if (type === "Numerical") chapterMap[chap].numericalCount += count;
        });

        bookmarksRes.data.forEach(row => {
          const chap = row.chapter;
          const count = Array.isArray(row.bookmarked_ids) ? row.bookmarked_ids.length : 0;

          if (!chapterMap[chap]) {
            chapterMap[chap] = { chapterName: chap, theoryCount: 0, numericalCount: 0, totalBookmarks: 0 };
          }
          chapterMap[chap].totalBookmarks += count;
        });

        setGlobalDbTree(Object.values(chapterMap));
      } catch (err) {
        console.error("Global system indexing failed:", err);
      }
    };
    if (showDbInspectorOverlay) calculateGlobalManifestTree();
  }, [showDbInspectorOverlay, exam, subject, bookmarkedIds]);

  // --- INTERACTION LOGIC: MUTATE DATA FIELDS LIVE ---
  const handleLiveAnswerKeyUpdate = async (itemObj, sharedValueStr) => {
    setQuestionsList(prev => prev.map(q => q.q_id === itemObj.q_id ? { ...q, answer_key: sharedValueStr.toLowerCase() } : q));

    try {
      const { data, error: fetchErr } = await supabase
        .from("question_bundles")
        .select("questions")
        .eq("exam", exam)
        .eq("subject", subject)
        .eq("chapter", chapter)
        .eq("question_type", qType)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      let targetArray = Array.isArray(data?.questions) ? data.questions : [];

      targetArray = targetArray.map(q => {
        if (q.q_id === itemObj.q_id) {
          return { ...q, answer_key: sharedValueStr.toLowerCase() };
        }
        return q;
      });

      const { error: upsertErr } = await supabase
        .from("question_bundles")
        .upsert({
          exam,
          subject,
          chapter,
          question_type: qType,
          questions: targetArray,
          updated_at: new Date().toISOString()
        }, { onConflict: "exam,subject,chapter,question_type" });

      if (upsertErr) throw upsertErr;
    } catch (err) {
      alert(`Cloud sync rejected update sequence: ${err.message}`);
    }
  };

  // ==========================================
  // 🟢 FIXED: WRITE DIRECTLY TO admin_bookmarks TABLE
  // ==========================================
  const toggleLocalBookmarkPointer = async (itemIdString) => {
    // Compute the new array synchronously from current state instead of
    // relying on the setState updater's side effect (which runs async
    // and wasn't ready yet when the upsert below fired).
    const updatedBookmarks = bookmarkedIds.includes(itemIdString)
      ? bookmarkedIds.filter(id => id !== itemIdString)
      : [...bookmarkedIds, itemIdString];

    setBookmarkedIds(updatedBookmarks);

    try {
      // 🟢 CORRECT TARGET: Overwrites or inserts values safely inside admin_bookmarks column architecture
      const { error } = await supabase
        .from("admin_bookmarks")
        .upsert({
          exam,
          subject,
          chapter,
          question_type: qType,
          bookmarked_ids: updatedBookmarks,
          updated_at: new Date().toISOString()
        }, { onConflict: "exam,subject,chapter,question_type" });

      if (error) throw error;
    } catch (err) {
      alert(`Bookmark cloud sync failed: ${err.message}`);
    }
  };

  // ==========================================
  // 🟢 ASSET REPLACEMENT: DRAG/DROP + PREVIEW + STORAGE UPLOAD
  // ==========================================

  // Local-only cache-buster so a freshly replaced image shows immediately
  // without waiting on browser/CDN caching. Keyed by `${q_id}_${target}`.
  const [imageCacheBust, setImageCacheBust] = useState({});

  // Your confirmed Supabase Storage bucket
  const QUESTION_ASSETS_BUCKET = "question-images";

  // Pulls { bucket, path } out of an existing Supabase public storage URL, e.g.
  // https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path/to/file.png>
  // Only used here to find the OLD file so we can delete it — not to build new paths.
  const parseSupabasePublicUrl = (url) => {
    if (!url || typeof url !== "string") return null;
    const marker = "/storage/v1/object/public/";
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const rest = url.slice(idx + marker.length);
    const firstSlash = rest.indexOf("/");
    if (firstSlash === -1) return null;
    const bucket = decodeURIComponent(rest.slice(0, firstSlash));
    const path = rest
      .slice(firstSlash + 1)
      .split("/")
      .map(segment => decodeURIComponent(segment))
      .join("/");
    return { bucket, path };
  };

  // Builds a clean, predictable path for this question's asset:
  // <exam>/<subject>/<chapter>/<qType>/<q_id>_<target>.<ext>
  const buildCanonicalAssetPath = (item, target, fileExt) => {
    return `${exam}/${subject}/${chapter}/${qType}/${item.q_id}_${target}.${fileExt}`;
  };

  const resetReplacementModalState = () => {
    // Revoke object URLs to avoid leaking memory
    if (replacementPreviews.question) URL.revokeObjectURL(replacementPreviews.question);
    if (replacementPreviews.solution) URL.revokeObjectURL(replacementPreviews.solution);
    setReplacementFiles({ question: null, solution: null });
    setReplacementPreviews({ question: null, solution: null });
    setDragOverTarget(null);
  };

  const openReplacementModal = (item) => {
    resetReplacementModalState();
    setActiveModalItem(item);
  };

  const closeReplacementModal = () => {
    resetReplacementModalState();
    setActiveModalItem(null);
  };

  const handleReplacementFileSelect = (target, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setReplacementFiles(prev => ({ ...prev, [target]: file }));
    setReplacementPreviews(prev => {
      if (prev[target]) URL.revokeObjectURL(prev[target]);
      return { ...prev, [target]: previewUrl };
    });
  };

  const clearReplacementTarget = (target) => {
    setReplacementFiles(prev => ({ ...prev, [target]: null }));
    setReplacementPreviews(prev => {
      if (prev[target]) URL.revokeObjectURL(prev[target]);
      return { ...prev, [target]: null };
    });
  };

  const handleDropzoneDragOver = (target, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(target);
  };

  const handleDropzoneDragLeave = (target, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(prev => (prev === target ? null : prev));
  };

  const handleDropzoneDrop = (target, e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverTarget(null);
    const file = e.dataTransfer.files?.[0];
    handleReplacementFileSelect(target, file);
  };

  const handleConfirmAssetReplacement = async () => {
    if (!activeModalItem) return;
    if (!replacementFiles.question && !replacementFiles.solution) {
      alert("Drop or select at least one image before confirming.");
      return;
    }

    setIsUploadingReplacement(true);
    try {
      const updatedFields = {};
      const bustKeys = [];

      for (const target of ["question", "solution"]) {
        const file = replacementFiles[target];
        if (!file) continue;

        const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
        const newPath = buildCanonicalAssetPath(activeModalItem, target, fileExt);

        // 1) Find and delete whatever image currently sits at this question's
        //    old location (its q_id is our source of truth, not the URL string)
        const existingUrl = target === "question" ? activeModalItem.question_img_url : activeModalItem.solution_img_url;
        const parsedExisting = parseSupabasePublicUrl(existingUrl);
        if (parsedExisting && parsedExisting.path !== newPath) {
          // Best-effort delete — if it's already gone or the path was slightly
          // different historically, we don't want that to block the new upload
          await supabase.storage.from(QUESTION_ASSETS_BUCKET).remove([parsedExisting.path]);
        }

        // 2) Upload the new image to the clean, predictable path
        const { error: uploadErr } = await supabase.storage
          .from(QUESTION_ASSETS_BUCKET)
          .upload(newPath, file, { upsert: true, cacheControl: "3600", contentType: file.type });

        if (uploadErr) throw uploadErr;

        const { data: publicUrlData } = supabase.storage
          .from(QUESTION_ASSETS_BUCKET)
          .getPublicUrl(newPath);

        updatedFields[target === "question" ? "question_img_url" : "solution_img_url"] = publicUrlData.publicUrl;
        bustKeys.push(`${activeModalItem.q_id}_${target}`);
      }

      // Reflect change immediately in the UI
      setQuestionsList(prev =>
        prev.map(q => (q.q_id === activeModalItem.q_id ? { ...q, ...updatedFields } : q))
      );
      setImageCacheBust(prev => {
        const next = { ...prev };
        bustKeys.forEach(k => { next[k] = Date.now(); });
        return next;
      });

      // Persist change inside the question_bundles.questions JSON array
      const { data: currentData, error: fetchErr } = await supabase
        .from("question_bundles")
        .select("questions")
        .eq("exam", exam)
        .eq("subject", subject)
        .eq("chapter", chapter)
        .eq("question_type", qType)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      let targetArray = Array.isArray(currentData?.questions) ? currentData.questions : [];
      targetArray = targetArray.map(q =>
        q.q_id === activeModalItem.q_id ? { ...q, ...updatedFields } : q
      );

      const { error: upsertErr } = await supabase
        .from("question_bundles")
        .upsert({
          exam,
          subject,
          chapter,
          question_type: qType,
          questions: targetArray,
          updated_at: new Date().toISOString()
        }, { onConflict: "exam,subject,chapter,question_type" });

      if (upsertErr) throw upsertErr;

      closeReplacementModal();
    } catch (err) {
      alert(`Asset replacement failed: ${err.message}`);
    } finally {
      setIsUploadingReplacement(false);
    }
  };

  // Appends a local cache-busting query param (if this image was just replaced)
  // so the browser refetches the new file instead of showing a cached old one.
  const buildDisplayUrl = (item, target) => {
    const rawUrl = target === "question" ? item.question_img_url : item.solution_img_url;
    if (!rawUrl) return rawUrl;
    const bustValue = imageCacheBust[`${item.q_id}_${target}`];
    if (!bustValue) return rawUrl;
    return `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}cb=${bustValue}`;
  };

  // --- DYNAMIC GEOMETRIC DENSITY STEP ALGORITHMS ---
  let gridLayoutClass = "canvas-grid-split-row-engine"; 
  let currentModeText = "Layout: Split Screen Row Matrix";

  if (zoomScale >= 35 && zoomScale < 70) {
    gridLayoutClass = "canvas-grid-dual-engine";
    currentModeText = "Layout: 2-Column Balanced Adaptive Row Grid";
  } else if (zoomScale < 35) {
    gridLayoutClass = "canvas-grid-quad-engine";
    currentModeText = "Layout: 4-Column Dense Card Grid Canvas";
  }

  const computedImageFrameHeight = `${100 + (zoomScale * 1.6)}px`;

  const resolveSanitizedSubjects = () => {
    if (exam === "JEE") return ["Physics", "Chemistry", "Mathematics"];
    if (exam === "NEET") return ["Physics", "Chemistry", "Biology"];
    return ["Physics", "Chemistry", "Mathematics", "Biology"];
  };

  return (
    <div className={`micro-overview-viewport-wrapper ${isDarkMode ? "theme-dark-lux" : "theme-light-lux"}`}>
      
      <header className="micro-topbar-controls">
        <div className="engine-brand-emblem-compact">
          <div className="pulse-dot-micro"></div>
          <span className="brand-txt-glow-micro">Production Ledger Workspace</span>
        </div>

        <div className="micro-selector-row-ipad-fluid">
          <div className="ipad-select-pill-container">
            <select className="ipad-clean-select" value={exam} onChange={(e) => setExam(e.target.value)}>
              <option value="MHT-CET">MHT-CET</option>
              <option value="JEE">JEE Core/Adv</option>
              <option value="NEET">NEET</option>
            </select>
          </div>

          <div className="ipad-select-pill-container">
            <select className="ipad-clean-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              {resolveSanitizedSubjects().map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>

          <div className="ipad-select-pill-container wide-pill">
            <select className="ipad-clean-select" value={chapter} onChange={(e) => setChapter(e.target.value)}>
              {availableChapters.length === 0 && <option value="">No Active Syllabus Found</option>}
              {availableChapters.map(chap => (
                <option key={chap.chapter_name} value={chap.chapter_name}>{chap.chapter_name}</option>
              ))}
            </select>
          </div>

          <div className="ipad-select-pill-container">
            <select className="ipad-clean-select" value={qType} onChange={(e) => setQType(e.target.value)}>
              <option value="Theory">Theory</option>
              <option value="Numerical">Numerical</option>
            </select>
          </div>
        </div>

        <div className="topbar-right-action-cluster-nodes">
          <button type="button" className="action-btn-node-micro badge-emerald" onClick={() => setShowDbInspectorOverlay(true)}>
            🗄️ Total DB
          </button>
          
          <button type="button" className="action-btn-node-micro badge-amber" onClick={() => setShowBookmarksOverlay(true)}>
            🔖 Bookmarks ({bookmarkedIds.length})
          </button>

          <button type="button" className="theme-toggle-trigger-btn" onClick={() => setIsDarkMode(!isDarkMode)}>
            {isDarkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <div className="micro-utility-sub-shelf">
        <div className="zoom-slider-container">
          <span className="slider-icon-lbl">🔎 Scaling Canvas:</span>
          <input 
            type="range" min="10" max="100" value={zoomScale} 
            onChange={(e) => setZoomScale(Number(e.target.value))}
            className="micro-zoom-slider-bar"
          />
          <span className="slider-percentage-value">{zoomScale}%</span>
        </div>
        <div className="layout-indicator-tag">{isProcessing ? "Connecting Pipeline..." : currentModeText}</div>
      </div>

      <main className="micro-fluid-grid-canvas">
        {questionsList.length === 0 ? (
          <div className="empty-state-micro-notice">
            {isProcessing ? "Synchronizing database row arrays..." : "No production assets matching this ledger node combination."}
          </div>
        ) : (
          <div className={gridLayoutClass}>
            {questionsList.map((item, idx) => (
              <div key={item.q_id || `question-card-${idx}`} className="micro-asset-card-frame animate-fade">
                
                <div className="card-micro-header-meta">
                  <span className="meta-q-index-id">
                    #{item.q_num} · <span className="dim-id-txt">{item.q_id}</span>
                  </span>
                  
                  <div className="card-right-controls-action-cluster">
                    <div className="micro-ans-picker-wrapper">
                      <span className="micro-label-dim">Key:</span>
                      <select 
                        className="micro-select-key-trigger" 
                        value={item.answer_key || "a"} 
                        onChange={(e) => handleLiveAnswerKeyUpdate(item, e.target.value)}
                      >
                        <option value="a">a</option>
                        <option value="b">b</option>
                        <option value="c">c</option>
                        <option value="d">d</option>
                      </select>
                    </div>

                    <button 
                      type="button" 
                      className={`micro-bookmark-btn-badge ${bookmarkedIds.includes(item.q_id) ? "is-active" : ""}`} 
                      onClick={() => toggleLocalBookmarkPointer(item.q_id)}
                    >
                      {bookmarkedIds.includes(item.q_id) ? "🔖" : "🏳️"}
                    </button>

                    <button 
                      type="button" 
                      className="micro-action-btn-trigger variant-replace"
                      onClick={() => openReplacementModal(item)}
                    >
                      🔄 Replace
                    </button>
                  </div>
                </div>

                <div className="card-asset-viewports-split-grid">
                  <div className="micro-img-viewport-frame" style={{ height: computedImageFrameHeight }}>
                    <div className="micro-viewport-indicator-tag tag-question">Question</div>
                    <img src={buildDisplayUrl(item, "question")} alt="Question Asset" className="micro-rendering-img-asset" loading="lazy" />
                  </div>

                  <div className="micro-img-viewport-frame" style={{ height: computedImageFrameHeight }}>
                    <div className="micro-viewport-indicator-tag tag-solution">Solution</div>
                    {item.solution_img_url ? (
                      <img src={buildDisplayUrl(item, "solution")} alt="Solution Asset" className="micro-rendering-img-asset" loading="lazy" />
                    ) : (
                      <div className="micro-empty-asset-fallback-lbl">No explanation graphic uploaded</div>
                    )}
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}
      </main>

      {/* ========================================================  
        🟢 OVERLAY MODAL 1: PRECISELY POSITIONED BOOKMARKS VAULT 
        ======================================================== */}
      {showBookmarksOverlay && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog modal-wide-scroll-view animate-fade">
            
            <div className="modal-hud-header display-flex-row-space">
              <div>
                <span className="modal-title-txt color-amber">🔖 Active Category Bookmark Vault Ledger</span>
                <span className="modal-subtitle-id-token">Viewing filtered flagged data rows under category context</span>
              </div>
              <button type="button" className="close-pane-hud-btn-fixed" onClick={() => setShowBookmarksOverlay(false)}>✕</button>
            </div>

            <div className="modal-internal-scrollable-payload-lane">
              {bookmarkPayloadList.length === 0 ? (
                <div className="empty-state-micro-notice">No questions flagged or bookmarked within this active bundle grid row.</div>
              ) : (
                bookmarkPayloadList.map((item, idx) => (
                  <div key={item.q_id || `bookmark-item-${idx}`} className="micro-asset-card-frame sub-panel-bg" style={{ marginBottom: "10px" }}>
                    <div className="card-micro-header-meta">
                      <span className="meta-q-index-id">#{item.q_num} · <span className="dim-id-txt">{item.q_id}</span></span>
                      <span className="micro-select-key-trigger">Key: {item.answer_key?.toUpperCase()}</span>
                    </div>
                    <div className="card-asset-viewports-split-grid">
                      <div className="micro-img-viewport-frame" style={{ height: "130px" }}>
                        <img src={buildDisplayUrl(item, "question")} className="micro-rendering-img-asset" alt="Q" />
                      </div>
                      <div className="micro-img-viewport-frame" style={{ height: "130px" }}>
                        <img src={item.solution_img_url ? buildDisplayUrl(item, "solution") : "/api/placeholder"} className="micro-rendering-img-asset" alt="S" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      )}

      {/* ======================================================== 
        🟢 OVERLAY MODAL 2: TOTAL DATABASE MANIFEST TABLE INSPECTOR 
        ======================================================== */}
      {showDbInspectorOverlay && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog modal-wide-scroll-view animate-fade">
            
            <div className="modal-hud-header display-flex-row-space">
              <div>
                <span className="modal-title-txt color-emerald">🗄️ Total DB Inventory Structural Manifest</span>
                <span className="modal-subtitle-id-token">Syllabus overview metrics for target: {exam} ➔ {subject}</span>
              </div>
              <button type="button" className="close-pane-hud-btn-fixed" onClick={() => setShowDbInspectorOverlay(false)}>✕</button>
            </div>

            <div className="modal-internal-scrollable-payload-lane">
              {globalDbTree.length === 0 ? (
                <div className="empty-state-micro-notice">No recorded row clusters active inside this exam tracking framework schema.</div>
              ) : (
                <table className="micro-dense-matrix-grid-table">
                  <thead>
                    <tr>
                      <th>Chapter Syllabus Node Location Target</th>
                      <th style={{ color: "#10b981", textAlign: "center" }}>Theory Ledger</th>
                      <th style={{ color: "#3b82f6", textAlign: "center" }}>Numerical Ledger</th>
                      <th style={{ color: "#f59e0b", textAlign: "center" }}>Bookmarked</th>
                      <th style={{ textAlign: "center" }}>Unified Row Sum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalDbTree.map((ch, index) => (
                      <tr key={`db-row-${ch.chapterName}-${index}`}>
                        <td className="font-weight-700">{ch.chapterName}</td>
                        <td className="text-center align-mono color-emerald">{ch.theoryCount} assets</td>
                        <td className="text-center align-mono color-blue-glow">{ch.numericalCount} assets</td>
                        <td className="text-center align-mono color-amber font-weight-700">{ch.totalBookmarks} active</td>
                        <td className="text-center align-mono font-weight-700">{ch.theoryCount + ch.numericalCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ========================================================  
        🟢 OVERLAY MODAL 3: INLINE OPAQUE ASSET REPLACEMENT HUDBOX  
        ======================================================== */}
      {activeModalItem && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog animate-fade">
            
            <div className="modal-hud-header display-flex-row-space">
              <div>
                <span className="modal-title-txt">Asset Replacement Routine Ledger Matrix</span>
                <span className="modal-subtitle-id-token">Mutating Image References for Token: {activeModalItem.q_id}</span>
              </div>
              <button type="button" className="close-pane-hud-btn-fixed" onClick={closeReplacementModal}>✕</button>
            </div>

            <div className="modal-dropzones-horizontal-split-row">
              <div
                className={`opaque-interactive-drop-bucket ${dragOverTarget === "question" ? "is-drag-active" : ""} ${replacementPreviews.question ? "has-preview" : ""}`}
                onDragOver={(e) => handleDropzoneDragOver("question", e)}
                onDragLeave={(e) => handleDropzoneDragLeave("question", e)}
                onDrop={(e) => handleDropzoneDrop("question", e)}
              >
                {replacementPreviews.question ? (
                  <>
                    <img src={replacementPreviews.question} alt="Question preview" className="dropzone-preview-img" />
                    <button
                      type="button"
                      className="dropzone-clear-btn"
                      onClick={(e) => { e.stopPropagation(); clearReplacementTarget("question"); }}
                    >
                      ✕ Remove
                    </button>
                  </>
                ) : (
                  <>
                    <div className="dropzone-hud-icon-badge">📁</div>
                    <span className="dropzone-main-heading-txt">Upload Question Image Component</span>
                    <span className="dropzone-subtext-format-info">Drag & drop an image here, or click to browse</span>
                    <input
                      type="file"
                      className="hidden-input-overlay-trigger"
                      accept="image/*"
                      onChange={(e) => handleReplacementFileSelect("question", e.target.files?.[0])}
                    />
                  </>
                )}
              </div>

              <div
                className={`opaque-interactive-drop-bucket ${dragOverTarget === "solution" ? "is-drag-active" : ""} ${replacementPreviews.solution ? "has-preview" : ""}`}
                onDragOver={(e) => handleDropzoneDragOver("solution", e)}
                onDragLeave={(e) => handleDropzoneDragLeave("solution", e)}
                onDrop={(e) => handleDropzoneDrop("solution", e)}
              >
                {replacementPreviews.solution ? (
                  <>
                    <img src={replacementPreviews.solution} alt="Solution preview" className="dropzone-preview-img" />
                    <button
                      type="button"
                      className="dropzone-clear-btn"
                      onClick={(e) => { e.stopPropagation(); clearReplacementTarget("solution"); }}
                    >
                      ✕ Remove
                    </button>
                  </>
                ) : (
                  <>
                    <div className="dropzone-hud-icon-badge">📁</div>
                    <span className="dropzone-main-heading-txt">Upload Solution Image Component</span>
                    <span className="dropzone-subtext-format-info">Drag & drop an image here, or click to browse</span>
                    <input
                      type="file"
                      className="hidden-input-overlay-trigger"
                      accept="image/*"
                      onChange={(e) => handleReplacementFileSelect("solution", e.target.files?.[0])}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="modal-action-footer-shelf">
              <button type="button" className="modal-action-btn variant-cancel" onClick={closeReplacementModal} disabled={isUploadingReplacement}>
                Abort Changes
              </button>
              <button
                type="button"
                className="modal-action-btn variant-confirm"
                onClick={handleConfirmAssetReplacement}
                disabled={isUploadingReplacement || (!replacementFiles.question && !replacementFiles.solution)}
              >
                {isUploadingReplacement ? "Uploading..." : "Confirm and Sync Asset Buffers"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}