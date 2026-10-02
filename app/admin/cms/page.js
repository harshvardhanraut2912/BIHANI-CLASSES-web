// 📂 SAVE THIS FILE AT: app/admin/cms/page.js
// (this replaces your existing CMS page.js at the same path)

"use client";

import { useState, useEffect, useRef, memo } from "react";
import { supabase } from "../../../lib/supabase";
import "./cms.css";

// NEW: custom dropdown replacing native <select> so the OPEN menu can be fully
// styled to look like a macOS popover -- a native <select>'s open list is
// rendered by the OS/browser and can't be restyled with CSS alone.
// Supports theme="dark" (matches this page's glassmorphism) or theme="light"
// (bright macOS-menu look, for reuse on bright admin pages), and
// variant="default" | "micro" (compact inline pill, used for the per-card Ans selector).
const MacSelect = memo(function MacSelect({
  name,
  value,
  options,
  onChange,
  placeholder,
  theme = "dark",
  variant = "default",
  disabled = false,
  className = ""
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`macSelectWrap theme-${theme} variant-${variant} ${className}`} ref={wrapRef} style={{ flex: variant === "default" ? 1 : undefined }}>
      <button
        type="button"
        className={`macSelectTrigger ${isOpen ? "is-open" : ""}`}
        onClick={() => !disabled && setIsOpen((o) => !o)}
        disabled={disabled}
      >
        <span>{selected ? selected.label : placeholder || "Select..."}</span>
        <svg className="macSelectChevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className="macSelectMenu">
          {options.map((opt) => (
            <div
              key={opt.value}
              className={`macSelectOption ${opt.value === value ? "is-selected" : ""}`}
              onClick={() => {
                onChange(name, opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default function AdminCMS() {
// --- 1. TAXONOMY & BATCH WORKSPACE STATE CORES ---
  const [exam, setExam] = useState("MHT-CET");
  const [subject, setSubject] = useState("Physics");
  const [chapter, setChapter] = useState("");
  const [qType, setQType] = useState("Theory");
  
  const [availableChapters, setAvailableChapters] = useState([]);
  const [chapterQuestionCount, setChapterQuestionCount] = useState(0);

  // The single monolithic bulk input area replacing separate fields
  const [bulkLatexCode, setBulkLatexCode] = useState("");
  
  // Array holding dynamically parsed tokens ready for compile visualization
  const [parsedItems, setParsedItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 🟢 NEW: XML media folder upload state (holds the folder id returned by /api/admin/upload-media,
  // used to tell latex_renderer.py where to find the real Vertopal images for xlink insertion)
  const [activeMediaFolderId, setActiveMediaFolderId] = useState(null);
  const [mediaUploadStatus, setMediaUploadStatus] = useState("idle"); // idle | uploading | done | error
  const mediaFolderInputRef = useRef(null);
  
  // Monaco editor engine controller instance reference pointer
  const [editorInstance, setEditorInstance] = useState(null);

  // --- CUSTOM DYNAMIC DIALOG MODAL STATE BLOCK ---
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    type: "confirm", // 'confirm' or 'alert'
    title: "",
    message: "",
    onConfirm: null
  });

  // 🟢 NEW: Tracks the "X out of Y images uploaded successfully" progress box shown
  // after the confirm modal is accepted, during executeActualDeploymentSequence's push loop.
  const [uploadProgress, setUploadProgress] = useState({
    isActive: false,
    current: 0,
    total: 0
  });

  // 🟢 NEW: Drives a thin, text-free progress line pinned above the footer's Render/Upload
  // buttons, tracking how many of parsedItems have finished rendering during
  // executeBulkRenderPipelineLoop's loop.
  const [renderProgress, setRenderProgress] = useState({
    isActive: false,
    current: 0,
    total: 0,
    // 🟢 NEW: rolling ETA in seconds for however many images are left to render,
    // recalculated after every single image finishes so it stays accurate as
    // per-image render time naturally varies.
    secondsRemaining: null
  });

  // 🟢 NEW: Cancel switches for the render loop and the upload loop. Checked between
  // iterations so a click takes effect right after the in-flight image/upload finishes,
  // rather than needing to kill a request mid-flight.
  const cancelRenderRef = useRef(false);
  const cancelUploadRef = useRef(false);
  // 🟢 NEW: Lets "Cancel Upload" actually abort the in-flight /api/admin/push request
  // instead of just waiting for it to finish on its own.
  const uploadAbortControllerRef = useRef(null);

  // NEW: routes MacSelect's (name, value) callback to the right setState for each topbar dropdown
  const handleDropdownChange = (name, value) => {
    if (name === "exam") setExam(value);
    else if (name === "subject") setSubject(value);
    else if (name === "chapter") setChapter(value);
    else if (name === "qType") setQType(value);
  };

  // 🟢 NEW: Restore a previously uploaded media folder id so the user doesn't have to
  // re-upload the same Vertopal folder every time they reload the CMS page.
  useEffect(() => {
    const savedId = window.localStorage.getItem("activeMediaFolderId");
    if (savedId) setActiveMediaFolderId(savedId);
  }, []);

  // 🟢 NEW: Handles the "Upload XML Media Folder" button. Reads every file inside the
  // user-selected folder (via webkitdirectory) -- including media/*.png / *.emf -- and
  // ships them to /api/admin/upload-media, which writes them to disk server-side so the
  // Python renderer subprocess can actually read them (browsers can't hand Python a path).
  async function handleMediaFolderSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setMediaUploadStatus("uploading");
    try {
      const formData = new FormData();
      files.forEach((file) => {
        // webkitRelativePath preserves "vertopal_xxx/media/IMHP3Q75Q0.png" structure
        formData.append("files", file, file.webkitRelativePath || file.name);
      });

      const res = await fetch("/api/admin/upload-media", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success && data.mediaFolderId) {
        setActiveMediaFolderId(data.mediaFolderId);
        window.localStorage.setItem("activeMediaFolderId", data.mediaFolderId);
        setMediaUploadStatus("done");
      } else {
        console.error("Media folder upload failed:", data.error);
        setMediaUploadStatus("error");
      }
    } catch (err) {
      console.error("Media folder upload crash:", err);
      setMediaUploadStatus("error");
    } finally {
      // reset input so selecting the same folder again still fires onChange
      e.target.value = "";
    }
  }

  // 🟢 NEW: Deletes the currently linked media folder -- both server-side (via DELETE on
  // /api/admin/upload-media) and locally (clears state + localStorage), so a stale/wrong
  // folder doesn't silently keep getting used for future renders.
  async function handleDeleteMediaFolder() {
    if (!activeMediaFolderId) return;
    const confirmed = window.confirm(
      `Remove linked media folder "${activeMediaFolderId}"? Future renders will fall back to no xlink images until you upload another folder.`
    );
    if (!confirmed) return;

    setMediaUploadStatus("uploading"); // reuse the same busy indicator while deleting
    try {
      const res = await fetch(`/api/admin/upload-media?mediaFolderId=${encodeURIComponent(activeMediaFolderId)}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setActiveMediaFolderId(null);
        window.localStorage.removeItem("activeMediaFolderId");
        setMediaUploadStatus("idle");
      } else {
        console.error("Media folder delete failed:", data.error);
        setMediaUploadStatus("done"); // keep showing "linked" state since delete didn't succeed
      }
    } catch (err) {
      console.error("Media folder delete crash:", err);
      setMediaUploadStatus("done");
    }
  }

  // --- 2. DYNAMIC SYLLABUS SYNC WITH SUPABASE ---
  useEffect(() => {
    const syncSyllabusFromDatabase = async () => {
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
        console.error("Syllabus resolution crash:", err);
      }
    };

    syncSyllabusFromDatabase();
  }, [exam, subject]);

  // --- 3. LIVE SUB-COUNT METRIC COUNTER ---
  useEffect(() => {
    const fetchCurrentLiveCount = async () => {
      if (!chapter) return;
      try {
        // 🟢 UPDATED: Queries our new grouped bundles table instead of the old table
        const { data, error } = await supabase
          .from("question_bundles")
          .select("questions")
          .eq("exam", exam)
          .eq("subject", subject)
          .eq("chapter", chapter)
          .eq("question_type", qType)
          .maybeSingle();

        if (error) throw error;

        // 🟢 If a row exists, set the count to the length of the questions array
        if (data && data.questions) {
          const questionsArray = Array.isArray(data.questions) ? data.questions : [];
          setChapterQuestionCount(questionsArray.length);
        } else {
          // If no row exists yet for this category, the count is naturally 0
          setChapterQuestionCount(0);
        }
      } catch (err) {
        console.error("Live count tracking error:", err);
      }
    };

    fetchCurrentLiveCount();
  }, [exam, subject, chapter, qType]);





  // =================================================================
  // 🟢 ADD THIS: KEYBOARD SHORTCUT LISTENER FOR MODAL ACTIONS
  // =================================================================
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (!modalConfig.isOpen) return;
      
      if (e.key === "Enter") {
        e.preventDefault(); // Stop standard page reload/submission hooks
        if (modalConfig.type === "confirm" && modalConfig.onConfirm) {
          modalConfig.onConfirm();
        }
        // Close modal automatically after action runs
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      } else if (e.key === "Escape") {
        // Dismiss safely if you hit ESC
        setModalConfig(prev => ({ ...prev, isOpen: false }));
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [modalConfig]);
  // =================================================================





  // --- 4. VS CODE MONACO ENGINE INITIALIZATION ROUTINE ---
  useEffect(() => {
    if (typeof window === "undefined" || !window.require) return;

    window.require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' } });
    window.require(['vs/editor/editor.main'], function () {
      
      if (!window.monaco.languages.getLanguages().some(lang => lang.id === 'custom-latex')) {
        window.monaco.languages.register({ id: 'custom-latex' });
        window.monaco.languages.setMonarchTokensProvider('custom-latex', {
          defaultToken: 'plain-text',
          tokenizer: {
            root: [
              [/%{2,}.*/, 'comment'],
              [/%.*/, 'comment'],
              // 🟢 NEW: highlight [xlink:href="...media/FILE.png"] image-reference markers
              // distinctly, so it's easy to spot at a glance where images will get injected.
              // Must come before the generic \[a-zA-Z]+ / delimiter rules so it wins the match.
              [/\[xlink:href="[^"]*"\]/, 'xlink-ref'],
              [/\\textbf\{\s*\d+\.\s*\}/, 'q-header'],
              [/\\textbf\{\s*[a-dA-D][\)\.]\s*\}/, 'opt-header'],
              [/\\textbf\{\s*Ans\.?\s*\}/, 'ans-header'],
              [/\\textbf\{\s*Sol\.?:\s*\}/, 'sol-header'],
              [/\\[a-zA-Z]+/, 'keyword'],
              [/[{}()\[\]]/, 'delimiter'],
              [/\$\$/, { token: 'math-teal', next: '@displaymath' }],
              [/\$/, { token: 'math-teal', next: '@inlinemath' }]
            ],
            inlinemath: [
              [/[^\$]+/, 'math-teal'],
              [/\$/, { token: 'math-teal', next: '@pop' }]
            ],
            displaymath: [
              [/[^\$]+/, 'math-teal'],
              [/\$\$/, { token: 'math-teal', next: '@pop' }],
              [/\$/, 'math-teal']
            ]
          }
        });
      }

      window.monaco.editor.defineTheme('vscode-dark-pure-black', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'plain-text', foreground: 'D4D4D4' },      
          { token: 'keyword', foreground: 'C586C0' },         
          { token: 'delimiter', foreground: '9CDCFE' },       
          { token: 'math-teal', foreground: '4EC9B0' },       
          { token: 'comment', foreground: '6A9955' },         
          { token: 'q-header', foreground: '4FC1FF', fontStyle: 'bold' },   
          { token: 'opt-header', foreground: 'CE9178', fontStyle: 'bold' }, 
          { token: 'ans-header', foreground: 'F44336', fontStyle: 'bold' }, 
          { token: 'sol-header', foreground: 'DCDCAA', fontStyle: 'bold' },
          // 🟢 NEW: xlink:href image markers -- bright orange text on a subtle dark-amber
          // background so these lines are unmistakable while scrolling through the editor.
          { token: 'xlink-ref', foreground: 'FF9D00', fontStyle: 'bold', background: '3A2900' }
        ],
        colors: {
          'editor.background': '#000000',
          'editor.foreground': '#D4D4D4',
          'editorLineNumber.foreground': '#5A5A5A',
          'editorLineNumber.activeForeground': '#00C8FF',
          'editor.lineHighlightBackground': '#111111'
        }
      });

      const targetContainer = document.getElementById('monaco-editor-canvas-box');
      if (!targetContainer || targetContainer.children.length > 0) return;

      const instance = window.monaco.editor.create(targetContainer, {
        value: bulkLatexCode || "",
        language: 'custom-latex',
        theme: 'vscode-dark-pure-black',
        automaticLayout: true,
        wordWrap: 'on',
        fontSize: 15,
        minimap: { enabled: false },
        scrollBeyondLastLine: false
      });

      instance.onDidChangeModelContent(() => {
        const freshCodeValue = instance.getValue();
        setBulkLatexCode(freshCodeValue);
      });

      setEditorInstance(instance);
    });
  }, []);

 // --- 5. CLIENT-SIDE BULK LATEX PARSER ENGINE ---
  useEffect(() => {
    if (!bulkLatexCode.trim()) {
      setParsedItems([]);
      return;
    }

    const pattern = /(?:^|\n)(?=(?:\\noindent\s*)?(?:\\textbf\{\s*\d+\.\s*\}\s*|\$\d+\$\.\s*|\\item\[\s*\d+\.\s*\]\s*|\\item\s+(?!\[)|(?<![a-zA-Z])\d+\.\s*))/;
    const blocks = bulkLatexCode.split(pattern);
    const tempItems = [];

    blocks.forEach((block, index) => {
      const cleanBlock = block.trim();
      if (!cleanBlock) return;

      if (!/\\textbf\{\s*[a-dA-D][\)\.]\s*\}/.test(cleanBlock)) return;

      try {
        const ansMatch = cleanBlock.match(/\\textbf\{\s*Ans\.?\s*\}/i);
        const derivedAnswer = ansMatch ? cleanBlock.match(/\\textbf\{\s*Ans\.?\s*\}\s*(?:\\?\(\s*|\\textbf\{\s*)?([a-dA-D])/i)?.[1]?.toUpperCase() || "A" : "A";

        const solSplitPattern = /\\textbf\{\s*Sol\.?:\s*\}/i;
        const solParts = cleanBlock.split(solSplitPattern);
        
        let rawQuestionPart = solParts[0];
        const finalCleanedQuestionPrompt = rawQuestionPart.split(/\\textbf\{\s*Ans\.?\s*\}/i)[0].trim();
        const rawSolutionPart = solParts[1] || "";

        tempItems.push({
          localId: `bulk_item_${index}`,
          rawQuestion: finalCleanedQuestionPrompt,
          rawSolution: rawSolutionPart.trim(),
          assignedAnswerKey: derivedAnswer,
          previewQImg: null,
          previewSImg: null,
          isRendered: false,
          auditStatus: "idle",
          auditMessage: ""
        });
      } catch (e) {
        console.warn("Skipped dynamic block parse index:", index, e);
      }
    });

    // 🟢 FIXED: previously this always pushed a totally fresh tempItems array (preview
    // images/audit state always null), so editing ANY single character anywhere in the
    // editor wiped every question's preview. Now we match each freshly-parsed block
    // against the previous parsedItems by position, and if that specific question's raw
    // text is unchanged, we carry its previewQImg/previewSImg/isRendered/audit state
    // forward untouched. Only the block(s) whose text actually changed lose their preview.
    setParsedItems(prevItems => tempItems.map((freshItem, idx) => {
      const prevItem = prevItems[idx];
      const unchanged = prevItem &&
        prevItem.rawQuestion === freshItem.rawQuestion &&
        prevItem.rawSolution === freshItem.rawSolution;

      if (unchanged) {
        return {
          ...freshItem,
          previewQImg: prevItem.previewQImg,
          previewSImg: prevItem.previewSImg,
          renderToken: prevItem.renderToken,
          isRendered: prevItem.isRendered,
          auditStatus: prevItem.auditStatus,
          auditMessage: prevItem.auditMessage,
        };
      }
      return freshItem; // genuinely new/changed block -- starts fresh, as before
    }));
    // 🟢 CLEANED: Only re-runs if input text code tracks adjustments
  }, [bulkLatexCode]);



  // 🟢 NEW: Jump-to-code -- locates this specific question's raw text inside the Monaco
  // editor's current buffer, scrolls that line into view, and places the cursor there,
  // so clicking the arrow next to a card's Ans box lands you on that exact question's
  // code in the left-side LaTeX Editor Studio panel. Purely additive; touches no
  // existing state or behavior.
  const jumpEditorToQuestion = (item) => {
    if (!editorInstance || !item?.rawQuestion) return;
    const model = editorInstance.getModel();
    if (!model) return;

    const haystack = model.getValue();
    const offset = haystack.indexOf(item.rawQuestion);
    if (offset === -1) return;

    const startPos = model.getPositionAt(offset);
    editorInstance.revealLineInCenter(startPos.lineNumber);
    editorInstance.setPosition(startPos);
    editorInstance.focus();
  };

  const updateIndividualItemAnswerKey = (localId, newKey) => {
    setParsedItems(prev => prev.map(item => 
      item.localId === localId ? { ...item, assignedAnswerKey: newKey } : item
    ));
  };

  const resolveSanitizedSubjects = () => {
    if (exam === "JEE") return ["Physics", "Chemistry", "Mathematics"];
    if (exam === "NEET") return ["Physics", "Chemistry", "Biology"];
    return ["Physics", "Chemistry", "Mathematics", "Biology"];
  };

  const appendQuestionSkeletonToEditor = () => {
    if (!editorInstance) return;

    const skeletonTemplate = `\\textbf{.} \n\\textbf{a)} \n\\textbf{b)} \n\\textbf{c)} \n\\textbf{d)} \n\\textbf{Ans.} \n\\textbf{Sol.:} \n\n`;

    const editorModel = editorInstance.getModel();
    const totalLinesCount = editorModel.getLineCount();
    const maximumLineLength = editorModel.getLineMaxColumn(totalLinesCount);

    const targetInsertionRange = new window.monaco.Range(
      totalLinesCount,
      maximumLineLength,
      totalLinesCount,
      maximumLineLength
    );

    const editOperation = {
      range: targetInsertionRange,
      text: totalLinesCount > 1 && editorModel.getLineContent(totalLinesCount).trim() !== "" 
        ? `\n\n${skeletonTemplate}` 
        : skeletonTemplate,
      forceMoveMarkers: true
    };

    editorInstance.executeEdits("cms-actions-provider", [editOperation]);
    editorInstance.focus();
  };

  // --- 6. BATCH PROCESSING PIPELINE ENGINE HANDLERS ---

  // 🟢 NEW: Renders + audits exactly ONE item, extracted out of the bulk loop below so the
  // per-card "🔄 Re-render" button can call this same logic without touching any other
  // question's state. `index` is only used as the --out_q/--out_s filename suffix on the
  // server, so it doesn't need to be the item's live array position -- passing the item's
  // own localId-derived index keeps output filenames stable across re-renders.
  async function renderAndAuditSingleItem(item, index) {
    try {
      const renderResponse = await fetch("/api/admin/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: item.rawQuestion,
          solution: item.rawSolution,
          index: index,
          mediaFolderId: activeMediaFolderId // 🟢 tells the renderer where to find real xlink images
        })
      });

      const renderResult = await renderResponse.json();

      if (renderResponse.ok && renderResult.success) {
        // 🟢 Appending a dynamic cache-buster timestamp forces the browser
        // to instantly refresh the source image rather than relying on stale cached layers!
        const cacheBuster = `?t=${Date.now()}`;

        setParsedItems((prev) =>
          prev.map((pItem) =>
            pItem.localId === item.localId
              ? {
                  ...pItem,
                  previewQImg: renderResult.questionImgPath ? renderResult.questionImgPath + cacheBuster : null,
                  previewSImg: renderResult.solutionImgPath ? renderResult.solutionImgPath + cacheBuster : null,
                  isRendered: true,
                  // 🟢 FIX: /api/admin/render names files preview_q_<renderToken>.png using its
                  // OWN unique token (index_timestamp_hex), not the raw `index` we sent it. The
                  // push route later needs that exact token to find the file on disk, so we must
                  // keep it around here rather than re-deriving it from the item's position later.
                  renderToken: renderResult.index,
                }
              : pItem
          )
        );
      }
    } catch (err) {
      console.error("Local rendering glitch:", err);
    }

    // 🟢 REMOVED: audit pipeline (was firing a background /api/admin/audit request
    // per item here) -- cut entirely to save time and drop the audit API calls.
  }

  // 🟢 NEW: Handler wired to the per-card "🔄 Re-render" button. Finds the item by localId
  // and re-renders just that one question -- every other card's preview/audit stays intact.
  async function handleRerenderSingleItem(localId) {
    const targetIndex = parsedItems.findIndex(p => p.localId === localId);
    if (targetIndex === -1) return;
    const item = parsedItems[targetIndex];
    await renderAndAuditSingleItem(item, targetIndex);
  }

  async function executeBulkRenderPipelineLoop() {
    if (parsedItems.length === 0) return;

    setIsProcessing(true);
    cancelRenderRef.current = false; // 🟢 NEW: reset any stale cancel flag from a prior run
    // 🟢 NEW: kick off the thin render progress line the moment the bulk render loop starts
    setRenderProgress({ isActive: true, current: 0, total: parsedItems.length, secondsRemaining: null });

    // 🟢 NEW: rolling total of elapsed render time, used to compute a live average
    // seconds-per-image figure so the ETA adapts as the run progresses.
    let elapsedMs = 0;

    try {
      for (let i = 0; i < parsedItems.length; i++) {
        // 🟢 NEW: honor a cancel request made while the previous image was rendering
        if (cancelRenderRef.current) break;

        const item = parsedItems[i];
        const startedAt = performance.now();
        await renderAndAuditSingleItem(item, i);
        elapsedMs += performance.now() - startedAt;

        const completedCount = i + 1;
        const avgMsPerItem = elapsedMs / completedCount;
        const remainingCount = parsedItems.length - completedCount;
        const secondsRemaining = remainingCount > 0
          ? Math.round((avgMsPerItem * remainingCount) / 1000)
          : 0;

        // 🟢 NEW: advance the thin line + refresh the ETA after each item finishes rendering
        setRenderProgress(prev => ({ ...prev, current: completedCount, secondsRemaining }));
      }
    } catch (err) {
      console.error("Bulk loop runner breakdown:", err);
    } finally {
      setIsProcessing(false);
      cancelRenderRef.current = false;
      // 🟢 NEW: hide the line shortly after completion so the finished state briefly reads 100%
      setTimeout(() => setRenderProgress({ isActive: false, current: 0, total: 0, secondsRemaining: null }), 400);
    }
  }

  // 🟢 NEW: Wired to the "Cancel" control that appears next to Render while a bulk render
  // run is in progress. The in-flight image is left to finish (so its state doesn't end up
  // half-written); the loop simply stops picking up the next one.
  function handleCancelRender() {
    cancelRenderRef.current = true;
  }

 async function commitBulkCmsBatchToProductionCloud() {
    const renderedItems = parsedItems.filter(item => item.isRendered);
    if (renderedItems.length === 0) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Compilation Missing",
        message: "Verify and compile preview assets cleanly before triggering server writes.",
        onConfirm: null
      });
      return;
    }

    // 🟢 Triggers our custom modal instead of browser confirm()
    setModalConfig({
      isOpen: true,
      type: "confirm",
      title: "Confirm Deployment",
      message: `Deploy sequence initiated. Confirm commit of ${renderedItems.length} row elements to production schemas?`,
      onConfirm: () => executeActualDeploymentSequence(renderedItems)
    });
  }

  // Helper handling the deployment loop once confirmed
  async function executeActualDeploymentSequence(renderedItems) {
    setIsProcessing(true);
    cancelUploadRef.current = false; // 🟢 NEW: reset any stale cancel flag from a prior run
    // 🟢 NEW: kick off the progress box the moment deployment actually starts
    // (i.e. right after the user hits "Continue" on the confirm modal).
    setUploadProgress({ isActive: true, current: 0, total: renderedItems.length });
    let runningCounterWeight = chapterQuestionCount; //
    let wasCancelled = false;
    let completedSoFar = 0;

    try {
      for (let i = 0; i < renderedItems.length; i++) {
        // 🟢 NEW: honor a cancel request made while the previous upload was in flight
        if (cancelUploadRef.current) { wasCancelled = true; break; }

        const item = renderedItems[i]; //

        // =================================================================
        // 🟢 ADDED: EXTRACTS THE TEXTBOOK IDENTIFIER DIGIT (e.g. "3" from \textbf{3.})
        // =================================================================
        const qNumMatch = item.rawQuestion.match(/(?:\\noindent\s*)?(?:\\textbf\{\s*(\d+)\.\s*\}|\$(\d+)\$\.\s*|\\item\[\s*(\d+)\.\s*\]|(\d+)\.\s*)/);
        const actualQuestionStringNumber = qNumMatch ? qNumMatch.slice(1).find(g => g !== undefined) : String(i + 1);
        // =================================================================

        // 🟢 NEW: fresh AbortController per request so "Cancel Upload" can kill the
        // in-flight fetch immediately instead of waiting for it to resolve on its own.
        const controller = new AbortController();
        uploadAbortControllerRef.current = controller;

        let response;
        try {
          response = await fetch("/api/admin/push", {
            method: "POST", //
            headers: { "Content-Type": "application/json" }, //
            body: JSON.stringify({
              exam, //
              subject, //
              chapter, //
              questionType: qType, //
              questionNumber: actualQuestionStringNumber, // 🟢 INJECTED: Pass the custom textbook string number token
              rawQuestion: item.rawQuestion, // Pass the clean question string text
              rawSolution: item.rawSolution, // Pass the clean solution string text
              answerKey: item.assignedAnswerKey, //
              // 🟢 FIX: was `index: i` -- the position in the *filtered* renderedItems array,
              // which never matches the filename the render route actually wrote to disk
              // (preview_q_<renderToken>.png). Send the real token captured at render time.
              index: item.renderToken //
            }),
            signal: controller.signal
          });
        } catch (fetchErr) {
          if (fetchErr.name === "AbortError") { wasCancelled = true; break; }
          throw fetchErr;
        }

        const result = await response.json(); //
        if (response.ok && result.success) { //
          runningCounterWeight = result.assignedIndex; //
          completedSoFar = i + 1;
          // 🟢 NEW: bump the "X out of Y" counter after each successful push
          setUploadProgress(prev => ({ ...prev, current: i + 1 }));
        } else {
          throw new Error(result.error || `Failed on step layout index: ${i}`); //
        }
      } //

      if (wasCancelled) {
        // 🟢 NEW: surface a clear "you stopped this" message rather than a false success/error
        setModalConfig({
          isOpen: true,
          type: "alert",
          title: "Upload Cancelled",
          message: `Upload stopped at your request. ${completedSoFar} of ${renderedItems.length} items had already been deployed before cancelling.`,
          onConfirm: null
        });
        return;
      }

      // 🟢 Triggers our custom modal instead of browser alert()
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Deployment Success",
        message: "Exhilarating Success! All rendered blocks deployed to Supabase Storage and Database.",
        onConfirm: null
      });

      setBulkLatexCode("");
      setParsedItems([]);
      setChapterQuestionCount(runningCounterWeight);
      if (editorInstance) editorInstance.setValue("");

    } catch (err) {
      setModalConfig({
        isOpen: true,
        type: "alert",
        title: "Deployment Error",
        message: `Transaction sequence aborted mid-run: ${err.message}`,
        onConfirm: null
      });
    } finally {
      setIsProcessing(false);
      cancelUploadRef.current = false;
      uploadAbortControllerRef.current = null;
      // 🟢 NEW: hide the progress box once the run finishes, whether it succeeded or errored
      setUploadProgress({ isActive: false, current: 0, total: 0 });
    }
  }

  // 🟢 NEW: Wired to the "Cancel" control shown on the upload progress box. Immediately
  // aborts whichever /api/admin/push request is currently in flight and stops the loop
  // from starting the next one.
  function handleCancelUpload() {
    cancelUploadRef.current = true;
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
    }
  }

  return (
    <div className="glass-cms-viewport-wrapper">
      {/* TOP CONFIGURATION BAR */}
     {/* TOP CONFIGURATION BAR */}
      <header className="glass-topbar-controls">
        <div className="engine-brand-emblem">
          <div className="pulse-dot"></div>
          <span className="brand-txt-glow">CETWALLE</span>
        </div>

        {/* 🟢 ADDED: Fast link navigation button to hop straight to manual upload view portal */}
        <div style={{ marginLeft: "15px" }}>
          <button
            type="button"
            className="glass-dropdown"
            onClick={() => window.location.href = "/admin/cms/uploadmanually"}
            style={{ padding: "6px 14px", cursor: "pointer", fontSize: "0.85rem", background: "rgba(16, 185, 129, 0.15)", border: "1px solid #10b981" }}
          >
            📁 Switch to Manual Upload
          </button>
        </div>

        {/* 🟢 NEW: Upload XML Media Folder -- lets the user pick the vertopal_xxxx folder
            (which contains /media/*.png etc.) so latex_renderer.py can resolve xlink:href
            image references directly instead of relying on manually renamed assets. */}
        <div style={{ marginLeft: "10px" }}>
          <input
            type="file"
            ref={mediaFolderInputRef}
            webkitdirectory=""
            directory=""
            multiple
            style={{ display: "none" }}
            onChange={handleMediaFolderSelected}
          />
          <button
            type="button"
            className="glass-dropdown"
            onClick={() => mediaFolderInputRef.current?.click()}
            disabled={mediaUploadStatus === "uploading"}
            title={activeMediaFolderId ? `Active media folder: ${activeMediaFolderId}` : "No media folder uploaded yet"}
            style={{
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: "0.85rem",
              background: activeMediaFolderId ? "rgba(56, 189, 248, 0.15)" : "rgba(148, 163, 184, 0.12)",
              border: activeMediaFolderId ? "1px solid #38bdf8" : "1px solid rgba(148, 163, 184, 0.4)",
            }}
          >
            {mediaUploadStatus === "uploading"
              ? "⏳ Uploading media…"
              : activeMediaFolderId
              ? "🖼️ Media Folder Linked ✓"
              : "🖼️ Upload XML Media Folder"}
          </button>

          {/* 🟢 NEW: only shows once a folder is actually linked, so there's nothing to
              accidentally click/delete before an upload has happened. */}
          {activeMediaFolderId && (
            <button
              type="button"
              className="glass-dropdown"
              onClick={handleDeleteMediaFolder}
              disabled={mediaUploadStatus === "uploading"}
              title="Delete linked media folder"
              style={{
                padding: "6px 10px",
                marginLeft: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid #ef4444",
              }}
            >
              🗑️
            </button>
          )}
        </div>
        
        {/* 🟢 FIXED & RESTORED: All your primary workflow drop-down category drop selectors */}
        {/* NEW: swapped native <select> for MacSelect (theme="dark") so the open menu renders as a styled popover */}
        <div className="glass-selector-row" style={{ maxWidth: "80%", display: "flex", gap: "12px", flex: 1 }}>
          <MacSelect
            name="exam"
            theme="dark"
            value={exam}
            onChange={handleDropdownChange}
            options={[
              { value: "MHT-CET", label: "MHT-CET Matrix" },
              { value: "JEE", label: "JEE Core/Adv" },
              { value: "NEET", label: "NEET Medical" }
            ]}
          />

          <MacSelect
            name="subject"
            theme="dark"
            value={subject}
            onChange={handleDropdownChange}
            options={resolveSanitizedSubjects().map((sub) => ({ value: sub, label: sub }))}
          />

          <MacSelect
            name="chapter"
            theme="dark"
            value={chapter}
            onChange={handleDropdownChange}
            className="wide-chapter-dropdown"
            options={availableChapters.map((chap) => ({ value: chap.chapter_name, label: chap.chapter_name }))}
          />

          <MacSelect
            name="qType"
            theme="dark"
            value={qType}
            onChange={handleDropdownChange}
            options={[
              { value: "Theory", label: "Theory Ledger" },
              { value: "Numerical", label: "Numerical Ledger" }
            ]}
          />
        </div>


        <div className="floating-metric-badge">
          <span className="metric-lbl">Live Inventory</span>
          <span className="metric-count-glow">{chapterQuestionCount} Assets</span>
        </div>
      </header>

      {/* MAIN LAYOUT SPLIT */}
      <main className="glass-workspace-split-viewport">
        {/* LEFT WORKSPACE PANEL */}
        <section className="glass-panel-lane layout-editor-left">
          <div className="glass-panel-box-container">
            <div className="panel-box-header">
              <span className="panel-box-badge">LaTeX Editor Studio</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="panel-box-counter-pill"
                  onClick={appendQuestionSkeletonToEditor}
                  style={{ cursor: "pointer", background: "rgba(56, 189, 248, 0.1)", borderColor: "rgba(56, 189, 248, 0.4)" }}
                >
                  ➕ Add Skeleton
                </button>
                {parsedItems.length > 0 && (
                  <span className="panel-box-counter-pill">Detected {parsedItems.length} Blocks</span>
                )}
              </div>
            </div>
            <div id="monaco-editor-canvas-box" style={{ width: "100%", flex: 1, minHeight: 0, textAlign: "left", overflow: "hidden" }} />
          </div>
        </section>

        {/* RIGHT PREVIEW SCREEN */}
        <section className="glass-panel-lane layout-monitor-right">
          <div className="glass-monitor-scaffold-scroll">
            {parsedItems.length === 0 ? (
              <div className="glass-empty-placeholder-card">
                <p>Please enter your code in editor</p>
              </div>
            ) : (
              parsedItems.map((item, idx) => (
                <div key={item.localId} className={`glass-preview-item-card ${item.isRendered ? "state-ready" : ""}`}>
                  <div className="item-card-control-header">
                    <span className="item-sequence-lbl">Question Asset Element #{idx + 1}</span>
                    
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {/* 🟢 NEW: Per-question re-render button -- only re-renders THIS card's
                          question/solution images via renderAndAuditSingleItem, leaving every
                          other card's preview and audit state completely untouched. */}
                      <button
                        type="button"
                        className="ai-audit-badge"
                        onClick={() => handleRerenderSingleItem(item.localId)}
                        disabled={item.auditStatus === "loading"}
                        title="Re-render just this question's images"
                        style={{
                          cursor: item.auditStatus === "loading" ? "not-allowed" : "pointer",
                          background: "rgba(148, 163, 184, 0.22)",
                          border: "1px solid rgba(203, 213, 225, 0.55)",
                          color: "#e2e8f0",
                          opacity: item.auditStatus === "loading" ? 0.6 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "3px 9px",
                          lineHeight: 0
                        }}
                      >
                        {/* 🟢 Icon-only repeat/loop glyph, no text label */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="17 1 21 5 17 9"></polyline>
                          <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                          <polyline points="7 23 3 19 7 15"></polyline>
                          <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                        </svg>
                      </button>

                      {/* 🟢 REMOVED: audit status badges (loading/valid/error) -- auditing pipeline cut */}

                      {/* NEW: swapped native <select> for MacSelect (theme="dark", variant="micro") */}
                      <div className="micro-dropdown-wrapper">
                        <label className="micro-dropdown-lbl">Ans:</label>
                        <MacSelect
                          name="assignedAnswerKey"
                          theme="dark"
                          variant="micro"
                          value={item.assignedAnswerKey}
                          onChange={(name, value) => updateIndividualItemAnswerKey(item.localId, value)}
                          disabled={isProcessing}
                          options={[
                            { value: "A", label: "A" },
                            { value: "B", label: "B" },
                            { value: "C", label: "C" },
                            { value: "D", label: "D" }
                          ]}
                        />
                      </div>

                      {/* 🟢 NEW: Jump-to-code button -- sits right next to the Ans box.
                          Clicking it scrolls/positions the left-side LaTeX Editor Studio
                          (Monaco) to this exact question's code block. */}
                      <button
                        type="button"
                        className="ai-audit-badge"
                        onClick={() => jumpEditorToQuestion(item)}
                        title="Go to this question's code in the editor"
                        style={{
                          cursor: "pointer",
                          background: "rgba(148, 163, 184, 0.22)",
                          border: "1px solid rgba(203, 213, 225, 0.55)",
                          color: "#e2e8f0",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          padding: "3px 9px",
                          lineHeight: 0
                        }}
                      >
                        {/* Triple-chevron "go to" arrow icon */}
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="5 4 11 12 5 20"></polyline>
                          <polyline points="10 4 16 12 10 20"></polyline>
                          <polyline points="15 4 21 12 15 20"></polyline>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="card-asset-viewports-grid">
                    <div className="micro-asset-frame">
                      <div className="frame-badge-tag">Question Layout Image</div>
                      <div className="embedded-img-viewport">
                        <img
                          /* 🟢 FIX: Points fallback to .png asset to ensure it renders prior to compilation */
                          src={item.previewQImg || "/api/images?path=icon and images/image_loading_failed.png"}
                          alt="Question Canvas Preview"
                          className="compiled-engine-png-asset"
                        />
                      </div>
                    </div>

                    <div className="micro-asset-frame">
                      <div className="frame-badge-tag">Solution Explanation Image</div>
                      <div className="embedded-img-viewport">
                        <img
                          /* 🟢 FIX: Points fallback to .png asset to ensure it renders prior to compilation */
                          src={item.previewSImg || "/api/images?path=icon and images/image_loading_failed.png"}
                          alt="Solution Canvas Preview"
                          className="compiled-engine-png-asset"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* FOOTER BAR CONTAINER */}
      <footer className="glass-bottom-control-shelf">
        <div className="shelf-active-breadcrumb">
          <span className="breadcrumb-meta-lbl">Target Ledger Matrix:</span>
          <strong className="breadcrumb-value-glow">
            {exam} ➔ {subject} ➔ {chapter || "Unselected Category"} ({qType})
          </strong>
        </div>

        <div className="global-floating-control-dock">
          {/* 🟢 NEW: thin, text-free rendering progress line -- pinned to screen just above
              the Render/Upload buttons (same fixed footer), fills left-to-right as
              executeBulkRenderPipelineLoop works through parsedItems. */}
          {renderProgress.isActive && (
            <div className="render-progress-thin-line">
              <div
                className="render-progress-thin-fill"
                style={{
                  width: renderProgress.total > 0
                    ? `${(renderProgress.current / renderProgress.total) * 100}%`
                    : "0%"
                }}
              />
            </div>
          )}
          <button
            type="button"
            className="btn-floating-glass variant-green-engine"
            onClick={executeBulkRenderPipelineLoop}
            disabled={isProcessing || parsedItems.length === 0}
          >
            {/* 🟢 NEW: while rendering, show a live "~Ns left" ETA instead of a bare "..." */}
            {renderProgress.isActive
              ? (renderProgress.secondsRemaining === null
                  ? "..."
                  : renderProgress.secondsRemaining > 0
                    ? `~${renderProgress.secondsRemaining}s left`
                    : "Finishing…")
              : "Render"}
          </button>

          {/* 🟢 NEW: appears only while a bulk render run is active; stops the loop from
              starting the next image (current one is left to finish cleanly). */}
          {renderProgress.isActive && (
            <button
              type="button"
              className="btn-floating-glass variant-cancel-engine"
              onClick={handleCancelRender}
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            className="btn-floating-glass variant-green-engine"
            onClick={commitBulkCmsBatchToProductionCloud}
            disabled={isProcessing || parsedItems.length === 0 || !chapter || !parsedItems.some(i => i.isRendered)}
          >
            {isProcessing && uploadProgress.isActive ? "..." : "Upload"}
          </button>

          {/* 🟢 NEW: appears only while a bulk upload run is active; aborts the in-flight
              request immediately and stops the loop from starting the next one. */}
          {uploadProgress.isActive && (
            <button
              type="button"
              className="btn-floating-glass variant-cancel-engine"
              onClick={handleCancelUpload}
            >
              Cancel
            </button>
          )}
        </div>
      </footer>



      {/* ... your existing cards, grid layouts, or shelf elements ... */}

      {/* ================================================================= */}
      {/* 🟢 ADD THIS: CUSTOM GLASSMORPHIC DIALOG CONTAINER */}
      {/* ================================================================= */}
      {modalConfig.isOpen && (
        <div className="custom-modal-blur-overlay">
          <div className="custom-modal-alert-box animate-modal-pop">
            <div className="modal-inner-accent-bar" />
            <h3 className="modal-title-text">{modalConfig.title}</h3>
            <p className="modal-message-body">{modalConfig.message}</p>
            
            <div className="modal-actions-wrapper-row">
              {modalConfig.type === "confirm" && (
                <button 
                  type="button"
                  className="modal-btn modal-btn-secondary"
                  onClick={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </button>
              )}
              <button 
                type="button"
                className="modal-btn modal-btn-primary auto-selected-focus"
                onClick={() => {
                  if (modalConfig.onConfirm) modalConfig.onConfirm();
                  setModalConfig(prev => ({ ...prev, isOpen: false }));
                }}
              >
                {modalConfig.type === "confirm" ? "Continue" : "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* 🟢 NEW: UPLOAD PROGRESS BOX -- appears once the confirm modal above
          is accepted, and tracks "X out of Y images uploaded successfully"
          live as executeActualDeploymentSequence's push loop runs. */}
      {/* ================================================================= */}
      {uploadProgress.isActive && (
        <div className="custom-modal-blur-overlay">
          <div className="upload-progress-box animate-modal-pop">
            <div className="modal-inner-accent-bar" />
            <div className="upload-progress-count-text">
              Uploading {uploadProgress.current} of {uploadProgress.total} images…
            </div>
            <div className="upload-progress-track">
              <div
                className="upload-progress-fill"
                style={{
                  width: uploadProgress.total > 0
                    ? `${(uploadProgress.current / uploadProgress.total) * 100}%`
                    : "0%"
                }}
              />
            </div>
            <div className="upload-progress-sub-label">
              {uploadProgress.current === uploadProgress.total && uploadProgress.total > 0
                ? "Finalizing…"
                : "Please keep this tab open until the upload finishes."}
            </div>

            {/* 🟢 NEW: lets the user stop the deployment mid-run directly from the
                progress box, without having to hunt for the footer's Cancel pill. */}
            {uploadProgress.current < uploadProgress.total && (
              <button
                type="button"
                className="modal-btn modal-btn-secondary upload-progress-cancel-btn"
                onClick={handleCancelUpload}
              >
                Cancel Upload
              </button>
            )}
          </div>
        </div>
      )}
      

    </div> // 🌟 This is your existing, final closing div of the master layout wrapper!
  );
}