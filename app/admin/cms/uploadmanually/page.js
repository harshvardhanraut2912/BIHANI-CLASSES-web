"use client";

import { useState, useEffect, useRef, memo } from "react";
import { supabase } from "../../../../lib/supabase"; // Adjust path to your supabase client
import "../cms.css";

// NEW: same MacSelect component used on the main CMS page -- replaces native <select>
// with a div-based popover so the OPEN menu can be fully styled (native <option> lists
// are rendered by the OS/browser and can't be restyled with CSS alone).
// theme="dark" matches this page's glassmorphism; theme="light" is available for bright pages.
// variant="default" is the full topbar dropdown; variant="micro" is the compact inline pill.
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
      {isOpen && !disabled && (
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

export default function ManualUploadCMS() {
  const [exam, setExam] = useState("MHT-CET");
  const [subject, setSubject] = useState("Physics");
  const [chapter, setChapter] = useState("");
  const [qType, setQType] = useState("Theory");
  
  const [availableChapters, setAvailableChapters] = useState([]);
  const [chapterQuestionCount, setChapterQuestionCount] = useState(0);

  // Additive Memory States for Manual Uploads
  const [datasheetItems, setDatasheetItems] = useState([]); 
  const [qImageMap, setQImageMap] = useState({});
  const [sImageMap, setSImageMap] = useState({});
  
  // Final preview state mimicking your main CMS flow
  const [parsedItems, setParsedItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // NEW: routes MacSelect's (name, value) callback to the right setState for each topbar dropdown
  const handleDropdownChange = (name, value) => {
    if (name === "exam") setExam(value);
    else if (name === "subject") setSubject(value);
    else if (name === "chapter") setChapter(value);
    else if (name === "qType") setQType(value);
  };

  // Sync Syllabus
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
        console.error("Syllabus sync error:", err);
      }
    };
    syncSyllabusFromDatabase();
  }, [exam, subject]);

  // Sync Live Count
  useEffect(() => {
    const fetchCurrentLiveCount = async () => {
      if (!chapter) return;
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
        setChapterQuestionCount(data && data.questions ? data.questions.length : 0);
      } catch (err) {
        console.error("Count sync error:", err);
      }
    };
    fetchCurrentLiveCount();
  }, [exam, subject, chapter, qType]);

  const resolveSanitizedSubjects = () => {
    if (exam === "JEE") return ["Physics", "Chemistry", "Mathematics"];
    if (exam === "NEET") return ["Physics", "Chemistry", "Biology"];
    return ["Physics", "Chemistry", "Mathematics", "Biology"];
  };

  // --- HELPER: FILE TO BASE64 ---
  const readFileAsBase64 = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  };

  // --- DROPZONE HANDLERS ---
  const handleDatasheetDrop = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const dataArray = Array.isArray(json) ? json : [json];
        
        // Additive merge based on unique ID
        setDatasheetItems(prev => {
          const merged = [...prev];
          dataArray.forEach(newItem => {
            if (!merged.find(item => item.id === newItem.id)) merged.push(newItem);
          });
          return merged;
        });
      } catch (err) {
        alert("Invalid JSON Datasheet format.");
      }
    };
    reader.readAsText(file);
  };

  const handleQImagesDrop = async (e) => {
    const files = Array.from(e.target.files).filter(f => /\.(png|jpg|jpeg)$/i.test(f.name));
    const newMap = {};
    for (let f of files) {
      const base64 = await readFileAsBase64(f);
      const keyName = f.name.replace(/\.[^/.]+$/, ""); // e.g., "q_cet_001.png" -> "q_cet_001"
      newMap[keyName] = base64;
    }
    setQImageMap(prev => ({ ...prev, ...newMap }));
  };

  const handleSImagesDrop = async (e) => {
    const files = Array.from(e.target.files).filter(f => /\.(png|jpg|jpeg)$/i.test(f.name));
    const newMap = {};
    for (let f of files) {
      const base64 = await readFileAsBase64(f);
      const keyName = f.name.replace(/\.[^/.]+$/, ""); // e.g., "q_cet_sol_001.png" -> "q_cet_sol_001"
      newMap[keyName] = base64;
    }
    setSImageMap(prev => ({ ...prev, ...newMap }));
  };
// --- FETCH & AUDIT PIPELINE ---
  const executeFetchPipelineLoop = async () => {
    if (datasheetItems.length === 0) return alert("Please load a datasheet first.");
    setIsProcessing(true);
    
    const initialParsedState = datasheetItems.map((data) => {
      // Reconstruct the raw prompt block exactly matching your standard format structure
      const rawQuestion = `${data.prompt}\n\\textbf{a)} ${data.a} \\hfill \\textbf{b)} ${data.b} \\\\\n\\textbf{c)} ${data.c} \\hfill \\textbf{d)} ${data.d}`;
      
      // Extracts the raw textbook digit value safely and converts "003" -> "3" to prevent index calculation errors
      const numericDigitStr = String(parseInt(data.id.replace(/\D/g, ''), 10) || 1);

      return {
        localId: data.id,
        originalQuestionNumber: numericDigitStr, // Saved as "1", "2", "3" to align with database sort rules
        rawQuestion: rawQuestion,
        rawSolution: data.sol || "",
        assignedAnswerKey: (data.ans || "A").toUpperCase(),
        previewQImg: null,
        previewSImg: null,
        isRendered: false,
        auditStatus: "loading",
        auditMessage: ""
      };
    });
    
    setParsedItems(initialParsedState);

    try {
      for (let i = 0; i < datasheetItems.length; i++) {
        const item = datasheetItems[i];
        
        // Strict key lookups matching your dropzone array bindings
        const qKey = item.id; 
        const rawDigit = item.id.replace(/\D/g, ''); 
        const sKey = `q_cet_sol_${rawDigit}`; 

        // 🟢 IN-MEMORY BYPASS: Grab the Base64 strings directly from your dropzone maps
        const qBase64 = qImageMap[qKey] || null;
        const sBase64 = sImageMap[sKey] || null;

        // 🟢 INSTANT PREVIEW: Map the Base64 data directly into the preview components
        setParsedItems(prev => prev.map(pItem => 
          pItem.localId === item.id ? { 
            ...pItem, 
            previewQImg: qBase64, // The browser renders Base64 natively instantly!
            previewSImg: sBase64, // The browser renders Base64 natively instantly!
            isRendered: qBase64 ? true : false // Mark as ready if the question image exists
          } : pItem
        ));

        // Fire Silent Background AI Audit using reconstructed data blocks
        const auditRes = await fetch("/api/admin/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: initialParsedState[i].rawQuestion,
            solution: initialParsedState[i].rawSolution,
            assignedAnswerKey: initialParsedState[i].assignedAnswerKey
          })
        });

        const auditData = await auditRes.json();
        setParsedItems(prev => prev.map(pItem => 
          pItem.localId === item.id ? { 
            ...pItem, 
            auditStatus: auditData.success && auditData.isCorrect ? "valid" : "error", 
            auditMessage: auditData.feedbackMessage || "Audit verification check failed" 
          } : pItem
        ));
      }
    } catch (err) {
      console.error("Fetch Pipeline Failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- UPLOAD PIPELINE ---
  const commitManualBatchToProduction = async () => {
    const renderedItems = parsedItems.filter(item => item.isRendered);
    if (renderedItems.length === 0) return alert("Fetch and verify items first.");
    if (!confirm(`Deploy ${renderedItems.length} items to database?`)) return;

    setIsProcessing(true);
    let runningCounterWeight = chapterQuestionCount;

    try {
      for (let i = 0; i < renderedItems.length; i++) {
        const item = renderedItems[i];

        // 🟢 FIXED: Retrieve direct state mapping tracking matching keys
        const qKey = item.localId;
        const rawDigit = item.localId.replace(/\D/g, ''); 
        const sKey = `q_cet_sol_${rawDigit}`; 

        const qBase64 = qImageMap[qKey] || null;
        const sBase64 = sImageMap[sKey] || null;

        const response = await fetch("/api/admin/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exam,
            subject,
            chapter,
            questionType: qType,
            questionNumber: item.originalQuestionNumber,
            rawQuestion: item.rawQuestion,
            rawSolution: item.rawSolution,
            answerKey: item.assignedAnswerKey,
            index: i,
            // 🟢 INJECTED: Pass data directly over network without using local disk caches
            qBase64,
            sBase64
          })
        });

        const result = await response.json();
        if (response.ok && result.success) {
          runningCounterWeight = result.assignedIndex;
        } else {
          throw new Error(result.error || `Failed on upload item index: ${i}`);
        }
      }

      alert("Deployment Success! Row bundle ingestion complete.");
      setDatasheetItems([]);
      setQImageMap({});
      setSImageMap({});
      setParsedItems([]);
      setChapterQuestionCount(runningCounterWeight);

    } catch (err) {
      alert(`Deployment Error: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="glass-cms-viewport-wrapper">
      <header className="glass-topbar-controls">
        <div className="engine-brand-emblem">
          <div className="pulse-dot"></div>
          <span className="brand-txt-glow">CETWALLE</span>
        </div>
        <div style={{ marginLeft: "15px" }}>
          <button
            type="button"
            className="glass-dropdown"
            onClick={() => window.location.href = "/admin/cms"}
            style={{ padding: "6px 14px", cursor: "pointer", fontSize: "0.85rem", background: "rgba(59, 130, 246, 0.15)", border: "1px solid #3b82f6" }}
          >
            💻 Return to Studio Editor
          </button>
        </div>
        
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

      <main className="glass-workspace-split-viewport">
        {/* LEFT PANEL: DRAG AND DROP ZONES */}
        <section className="glass-panel-lane layout-editor-left">
          <div className="glass-panel-box-container" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            {/* Box 1: Datasheet */}
            <div className="glass-drag-drop-hudbox-container" style={{ textAlign: "center", padding: "20px" }}>
              <h4>1. Load Datasheet (JSON)</h4>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Current Items: {datasheetItems.length}</p>
              <input type="file" accept=".json" onChange={handleDatasheetDrop} style={{ marginTop: "10px" }} />
            </div>

            {/* Box 2: Question Images */}
            <div className="glass-drag-drop-hudbox-container" style={{ textAlign: "center", padding: "20px" }}>
              <h4>2. Load Question Images</h4>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Loaded: {Object.keys(qImageMap).length} images</p>
              <input type="file" multiple accept=".png,.jpg,.jpeg" onChange={handleQImagesDrop} style={{ marginTop: "10px" }} />
            </div>

            {/* Box 3: Solution Images */}
            <div className="glass-drag-drop-hudbox-container" style={{ textAlign: "center", padding: "20px" }}>
              <h4>3. Load Solution Images</h4>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Loaded: {Object.keys(sImageMap).length} images</p>
              <input type="file" multiple accept=".png,.jpg,.jpeg" onChange={handleSImagesDrop} style={{ marginTop: "10px" }} />
            </div>

          </div>
        </section>

        {/* RIGHT PANEL: PREVIEW */}
        <section className="glass-panel-lane layout-monitor-right">
          <div className="glass-monitor-scaffold-scroll">
            {parsedItems.length === 0 ? (
              <div className="glass-empty-placeholder-card">
                <p>Please enter your files.</p>
              </div>
            ) : (
              parsedItems.map((item, idx) => (
                <div key={item.localId} className={`glass-preview-item-card ${item.isRendered ? "state-ready" : ""}`}>
                  <div className="item-card-control-header">
                    <span className="item-sequence-lbl">Asset Element #{item.originalQuestionNumber}</span>
                    
                   {/* 🟢 FIXED: Injects the dynamic auditMessage string directly into HTML title attributes for instant hover visibility */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      {item.auditStatus === "loading" && (
                        <span className="ai-audit-badge state-loading" title="Running deep logic verification loops...">
                          🤖 Auditing...
                        </span>
                      )}
                      {item.auditStatus === "valid" && (
                        <span className="ai-audit-badge state-valid" title={item.auditMessage || "Verified perfectly clean!"}>
                          ✓ Verified
                        </span>
                      )}
                      {item.auditStatus === "error" && (
                        <span 
                          className="ai-audit-badge state-error" 
                          title={item.auditMessage || "AI flagged an answer key or logical discrepancy!"}
                          style={{ cursor: "help", textDecoration: "underline dotted" }}
                        >
                          ⚠️ Mismatch
                        </span>
                      )}

                      {/* NEW: swapped native <select> for MacSelect (theme="dark", variant="micro").
                          This one stays read-only (disabled) exactly as before -- no onChange wired up,
                          it's just a styled display of the datasheet-derived answer key. */}
                      <div className="micro-dropdown-wrapper">
                        <label className="micro-dropdown-lbl">Ans:</label>
                        <MacSelect
                          name="assignedAnswerKey"
                          theme="dark"
                          variant="micro"
                          value={item.assignedAnswerKey}
                          onChange={() => {}}
                          disabled
                          options={[
                            { value: "A", label: "A" },
                            { value: "B", label: "B" },
                            { value: "C", label: "C" },
                            { value: "D", label: "D" }
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="card-asset-viewports-grid">
                    <div className="micro-asset-frame">
                      <div className="frame-badge-tag">Question Layout</div>
                      <div className="embedded-img-viewport">
                        <img src={item.previewQImg || "/api/images?path=icon and images/image_loading_failed.png"} alt="Q" className="compiled-engine-png-asset" />
                      </div>
                    </div>
                    <div className="micro-asset-frame">
                      <div className="frame-badge-tag">Solution Explanation</div>
                      <div className="embedded-img-viewport">
                        <img src={item.previewSImg || "/api/images?path=icon and images/image_loading_failed.png"} alt="S" className="compiled-engine-png-asset" />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="glass-bottom-control-shelf">
        <div className="shelf-active-breadcrumb">
          <span className="breadcrumb-meta-lbl">Target Ledger Matrix:</span>
          <strong className="breadcrumb-value-glow">
            {exam} ➔ {subject} ➔ {chapter || "Unselected Category"} ({qType})
          </strong>
        </div>

        <div className="global-floating-control-dock">
          <button type="button" className="btn-floating-glass variant-green-engine" onClick={executeFetchPipelineLoop} disabled={isProcessing || datasheetItems.length === 0}>
            {isProcessing ? "..." : "Fetch"}
          </button>
          
          <button type="button" className="btn-floating-glass variant-green-engine" onClick={commitManualBatchToProduction} disabled={isProcessing || parsedItems.length === 0}>
            {isProcessing ? "..." : "Upload"}
          </button>
        </div>
      </footer>
    </div>
  );
}