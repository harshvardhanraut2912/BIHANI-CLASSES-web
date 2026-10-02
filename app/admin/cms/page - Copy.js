"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import "./cms.css";

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
          { token: 'sol-header', foreground: 'DCDCAA', fontStyle: 'bold' }
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

    setParsedItems(tempItems);
    // 🟢 CLEANED: Only re-runs if input text code tracks adjustments
  }, [bulkLatexCode]);



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
  async function executeBulkRenderPipelineLoop() {
    if (parsedItems.length === 0) return;
    
    setIsProcessing(true);
    try {
      for (let i = 0; i < parsedItems.length; i++) {
        const item = parsedItems[i];
        
        // 🟢 Push audit pill into loading status instantly without delay
        setParsedItems(prev => prev.map(pItem => 
          pItem.localId === item.localId ? { ...pItem, auditStatus: "loading" } : pItem
        ));

        // 1. Core Local Render Fetch Execution (Awaited so previews drop immediately)
        try {
          const renderResponse = await fetch("/api/admin/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: item.rawQuestion,
              solution: item.rawSolution,
              index: i
            })
          });

          const renderResult = await renderResponse.json();

        if (renderResponse.ok && renderResult.success) {
          // 🟢 FIXED: Appending a dynamic cache-buster timestamp forces the browser 
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
                  }
                : pItem
            )
          );
          }
        } catch (err) {
          console.error("Local rendering glitch:", err);
        }

        // 2. 🟢 FIRE SILENT BACKSTORY AUDIT FLIGHT VIA CEREBRAS (Does NOT await/block local image loading lines)
        fetch("/api/admin/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: item.rawQuestion,
            solution: item.rawSolution,
            assignedAnswerKey: item.assignedAnswerKey
          })
        })
        .then(async (res) => {
          const auditData = await res.json();
          if (res.ok && auditData.success) {
            setParsedItems(prev => prev.map(pItem => 
              pItem.localId === item.localId 
                ? { 
                    ...pItem, 
                    auditStatus: auditData.isCorrect ? "valid" : "error", 
                    auditMessage: auditData.feedbackMessage 
                  } 
                : pItem
            ));
          } else {
            setParsedItems(prev => prev.map(pItem => 
              pItem.localId === item.localId ? { ...pItem, auditStatus: "error", auditMessage: "Audit rejected." } : pItem
            ));
          }
        })
        .catch((auditErr) => {
          console.error("Audit background pass broke:", auditErr);
          setParsedItems(prev => prev.map(pItem => 
            pItem.localId === item.localId ? { ...pItem, auditStatus: "error", auditMessage: "Connection dropped." } : pItem
          ));
        });
      }
    } catch (err) {
      console.error("Bulk loop runner breakdown:", err);
    } finally {
      setIsProcessing(false);
    }
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
    let runningCounterWeight = chapterQuestionCount; //

    try {
      for (let i = 0; i < renderedItems.length; i++) {
        const item = renderedItems[i]; //

        // =================================================================
        // 🟢 ADDED: EXTRACTS THE TEXTBOOK IDENTIFIER DIGIT (e.g. "3" from \textbf{3.})
        // =================================================================
        const qNumMatch = item.rawQuestion.match(/(?:\\noindent\s*)?(?:\\textbf\{\s*(\d+)\.\s*\}|\$(\d+)\$\.\s*|\\item\[\s*(\d+)\.\s*\]|(\d+)\.\s*)/);
        const actualQuestionStringNumber = qNumMatch ? qNumMatch.slice(1).find(g => g !== undefined) : String(i + 1);
        // =================================================================

        const response = await fetch("/api/admin/push", {
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
            index: i //
          })
        });

        const result = await response.json(); //
        if (response.ok && result.success) { //
          runningCounterWeight = result.assignedIndex; //
        } else {
          throw new Error(result.error || `Failed on step layout index: ${i}`); //
        }
      } //

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
        
        {/* 🟢 FIXED & RESTORED: All your primary workflow drop-down category drop selectors */}
        <div className="glass-selector-row" style={{ maxWidth: "80%", display: "flex", gap: "12px", flex: 1 }}>
          <select className="glass-dropdown" value={exam} onChange={(e) => setExam(e.target.value)}>
            <option value="MHT-CET">MHT-CET Matrix</option>
            <option value="JEE">JEE Core/Adv</option>
            <option value="NEET">NEET Medical</option>
          </select>

          <select className="glass-dropdown" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {resolveSanitizedSubjects().map((sub) => (
              <option key={sub} value={sub}>{sub}</option>
            ))}
          </select>

          <select className="glass-dropdown wide-chapter-dropdown" value={chapter} onChange={(e) => setChapter(e.target.value)}>
            {availableChapters.map((chap) => (
              <option key={chap.chapter_name} value={chap.chapter_name}>{chap.chapter_name}</option>
            ))}
          </select>

          <select className="glass-dropdown" value={qType} onChange={(e) => setQType(e.target.value)}>
            <option value="Theory">Theory Ledger</option>
            <option value="Numerical">Numerical Ledger</option>
          </select>
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
            <div id="monaco-editor-canvas-box" style={{ width: "100%", flex: 1, minHeight: "550px", textAlign: "left" }} />
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
                      {/* 🟢 DYNAMIC CEREBRAS BACKGROUND AUDIT PILLS */}
                      {item.auditStatus === "loading" && (
                        <span className="ai-audit-badge state-loading">🤖 Auditing...</span>
                      )}
                      {item.auditStatus === "valid" && (
                        <span className="ai-audit-badge state-valid" title={`Report: ${item.auditMessage}`}>
                          ✓ Verified Clean
                        </span>
                      )}
                      {item.auditStatus === "error" && (
                        <span className="ai-audit-badge state-error" title={`⚠️ SYSTEM AUDIT CONFLICT:\n${item.auditMessage}`} style={{ cursor: "help" }}>
                          ⚠️ Mismatch Warning
                        </span>
                      )}

                      <div className="micro-dropdown-wrapper">
                        <label className="micro-dropdown-lbl">Ans:</label>
                        <select
                          className="glass-micro-select"
                          value={item.assignedAnswerKey}
                          onChange={(e) => updateIndividualItemAnswerKey(item.localId, e.target.value)}
                          disabled={isProcessing}
                        >
                          <option value="A">A</option>
                          <option value="B">B</option>
                          <option value="C">C</option>
                          <option value="D">D</option>
                        </select>
                      </div>
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
          <button
            type="button"
            className="btn-floating-glass variant-green-engine"
            onClick={executeBulkRenderPipelineLoop}
            disabled={isProcessing || parsedItems.length === 0}
          >
            {isProcessing ? "..." : "Render"}
          </button>
          
          <button
            type="button"
            className="btn-floating-glass variant-green-engine"
            onClick={commitBulkCmsBatchToProductionCloud}
            disabled={isProcessing || parsedItems.length === 0 || !chapter || !parsedItems.some(i => i.isRendered)}
          >
            {isProcessing ? "..." : "Upload"}
          </button>
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
      

    </div> // 🌟 This is your existing, final closing div of the master layout wrapper!
  );
}