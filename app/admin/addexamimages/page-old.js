"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import "../users/adminuser.css"; 
import "../reports/adminreports.css";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AddExamImagesPage() {
  // --- PHASE 1: CONFIGURATION STATE ---
  const [phase, setPhase] = useState(1);
  const [exam, setExam] = useState("MHT-CET");
  const [mockName, setMockName] = useState("");
  const [folderName, setFolderName] = useState("");

  // --- PHASE 2: INVENTORY & ALLOCATION STATE ---
  const [inventory, setInventory] = useState([]); 
  const [isFixedWeight, setIsFixedWeight] = useState(true);
  const [allocations, setAllocations] = useState({}); 
  const [selectedQuestions, setSelectedQuestions] = useState({}); 
  
  // --- MODALS, PROGRESS & ERROR STATE ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [isError, setIsError] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState([]);
  
  // Picker Modal State
  const [activePickerChapter, setActivePickerChapter] = useState(null);
  const [pickerQuestions, setPickerQuestions] = useState([]);
  const [tempSelection, setTempSelection] = useState([]);

  const handleStartAssembler = async () => {
    if (!mockName || !folderName) {
      alert("Please define the mock test and target folder name.");
      return;
    }
    
    setIsProcessing(true);
    setIsError(false);
    try {
      const { data: syllabusData, error: syllabusErr } = await supabase
        .from("syllabus_chapters")
        .select("chapter_name, subject, default_weight")
        .eq("exam", exam);
        
      if (syllabusErr) throw syllabusErr;

      const { data: bundlesData, error: bundlesErr } = await supabase
        .from("question_bundles")
        .select("chapter, subject, questions")
        .eq("exam", exam);
        
      if (bundlesErr) throw bundlesErr;

      const mergedInventory = syllabusData.map(chapterNode => {
        const matchedBundles = bundlesData.filter(b => b.chapter === chapterNode.chapter_name);
        let allQuestions = [];
        matchedBundles.forEach(b => {
          if (Array.isArray(b.questions)) {
            allQuestions = [...allQuestions, ...b.questions];
          }
        });

        return {
          ...chapterNode,
          available_count: allQuestions.length,
          questions_pool: allQuestions
        };
      });

      setInventory(mergedInventory);

      const initialAllocs = {};
      mergedInventory.forEach(item => {
        initialAllocs[item.chapter_name] = {
          count: item.default_weight || 0,
          mode: "Random"
        };
      });
      setAllocations(initialAllocs);
      setPhase(2);
    } catch (err) {
      alert(`Initialization failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Automated algorithmic rolling engine for random targets
  const rollRandomQuestions = (chapterName, targetCount, currentInventory = inventory) => {
    const chapterNode = currentInventory.find(i => i.chapter_name === chapterName);
    if (!chapterNode || targetCount <= 0) return [];

    const shuffled = [...chapterNode.questions_pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, targetCount);
  };

  // Sync automatic selections directly whenever Phase 2 updates or weights shift
  useEffect(() => {
    if (phase === 2 && inventory.length > 0) {
      const autoSelections = { ...selectedQuestions };
      inventory.forEach(item => {
        const alloc = allocations[item.chapter_name];
        if (alloc && alloc.mode === "Random") {
          autoSelections[item.chapter_name] = rollRandomQuestions(item.chapter_name, alloc.count);
        }
      });
      setSelectedQuestions(autoSelections);
    }
  }, [phase, isFixedWeight, inventory]);

  const toggleFixedWeight = () => {
    const nextState = !isFixedWeight;
    setIsFixedWeight(nextState);
    if (nextState) {
      const fixedAllocs = { ...allocations };
      const autoSelections = { ...selectedQuestions };
      
      inventory.forEach(item => {
        const targetCount = item.default_weight || 0;
        fixedAllocs[item.chapter_name].count = targetCount;
        
        if (fixedAllocs[item.chapter_name].mode === "Random") {
          autoSelections[item.chapter_name] = rollRandomQuestions(item.chapter_name, targetCount);
        }
      });
      
      setAllocations(fixedAllocs);
      setSelectedQuestions(autoSelections);
    }
  };

  const handleManualCountChange = (chapterName, value) => {
    if (isFixedWeight) return; 
    const countNum = Number(value);
    setAllocations(prev => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], count: countNum }
    }));

    if (allocations[chapterName]?.mode === "Random") {
      setSelectedQuestions(prev => ({
        ...prev,
        [chapterName]: rollRandomQuestions(chapterName, countNum)
      }));
    }
  };

  const toggleSelectionMode = (chapterName) => {
    const currentAlloc = allocations[chapterName];
    if (!currentAlloc) return;

    const nextMode = currentAlloc.mode === "Random" ? "Manual" : "Random";
    
    setAllocations(prev => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], mode: nextMode }
    }));

    if (nextMode === "Random") {
      setSelectedQuestions(prev => ({
        ...prev,
        [chapterName]: rollRandomQuestions(chapterName, currentAlloc.count)
      }));
    } else {
      // Clear previous auto rolls on manual shift to prompt choice
      setSelectedQuestions(prev => ({ ...prev, [chapterName]: [] }));
    }
  };

  const openManualPicker = (chapterName) => {
    const chapterNode = inventory.find(i => i.chapter_name === chapterName);
    setPickerQuestions(chapterNode?.questions_pool || []);
    setTempSelection(selectedQuestions[chapterName] || []);
    setActivePickerChapter(chapterName);
  };

  const toggleManualQuestionSelection = (questionObj) => {
    setTempSelection(prev => {
      const exists = prev.find(q => q.q_id === questionObj.q_id || (q.id && q.id === questionObj.id));
      if (exists) return prev.filter(q => (q.q_id !== questionObj.q_id && q.id !== questionObj.id));
      return [...prev, questionObj];
    });
  };

  const saveManualSelection = () => {
    const targetCount = allocations[activePickerChapter].count;
    if (tempSelection.length !== targetCount) {
      alert(`Allocation Rule Violation: You must select exactly ${targetCount} items. Current: ${tempSelection.length}`);
      return;
    }
    setSelectedQuestions(prev => ({ ...prev, [activePickerChapter]: tempSelection }));
    setActivePickerChapter(null);
  };

  const logToTerminal = (msg) => setTerminalLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // ========================================================
  // 🚀 ATOMIC STREAM DEPLOYMENT MECHANISM
  // ========================================================
  const handleDeployTest = async () => {
    setIsProcessing(true);
    setIsError(false);
    setTerminalLogs([]);
    
    logToTerminal("⏳ Launching Test Compilation Engine Pipeline...");

    try {
      let globalQuestionIndex = 1;
      let finalManifest = [];

      logToTerminal("📦 Processing allocation matrix arrays...");

      const orderedInventory = [...inventory].sort((a, b) => a.subject.localeCompare(b.subject));

      for (const chapterNode of orderedInventory) {
        const chapterSelections = selectedQuestions[chapterNode.chapter_name] || [];
        const targetedAlloc = allocations[chapterNode.chapter_name]?.count || 0;

        if (targetedAlloc > 0 && chapterSelections.length !== targetedAlloc) {
          throw new Error(`Compilation Hold: "${chapterNode.chapter_name}" matrix mapping is uneven. Expected: ${targetedAlloc}, Assigned: ${chapterSelections.length}. Please click 'Choose' to satisfy requirements.`);
        }

        chapterSelections.forEach(q => {
          const subId = chapterNode.subject.substring(0, 3).toLowerCase() + "_sec";
          const shortSub = chapterNode.subject.substring(0, 3).toLowerCase();
          
          const qGitName = `test1_${shortSub}_q${globalQuestionIndex}.png`;
          const sGitName = `test1_${shortSub}_s${globalQuestionIndex}.png`;
          
          finalManifest.push({
            test_q_num: globalQuestionIndex,
            sub_id: subId,
            test_q_git_name: qGitName,
            github_que_raw_url: `https://raw.githubusercontent.com/harshvardhanraut2912/mht-cet-images/main/tests/${folderName}/${qGitName}`,
            test_s_git_name: sGitName,
            github_sol_raw_url: `https://raw.githubusercontent.com/harshvardhanraut2912/mht-cet-images/main/solutions/${folderName}/${sGitName}`,
            q_id: q.q_id || q.id || `gen_id_${globalQuestionIndex}`,
            answer_key: q.answer_key || q.ans || "A",
            question_img_url: q.question_img_url,
            solution_img_url: q.solution_img_url
          });

          globalQuestionIndex++;
        });
      }

      if (finalManifest.length === 0) {
        throw new Error("Compilation Halt: Target allocation stack totals 0 questions.");
      }

      logToTerminal(`🚀 Shipping operational schema (${finalManifest.length} nodes) to server route execution environment...`);
      
      const response = await fetch("/api/deploy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          mockName,
          folderName,
          manifest: finalManifest
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.error || "Execution error encountered on server route.");
      }
      
      logToTerminal("✨ SUCCESS: GitHub directory targets updated with explicit dual folder binaries!");
      logToTerminal("✨ SUCCESS: Supabase exam_question_data transactional row committed!");
      logToTerminal("🎉 Operations completed smoothly.");

      setTimeout(() => {
        alert("Mock Test compiled and saved successfully!");
        setIsProcessing(false);
        setPhase(1);
      }, 1200);

    } catch (err) {
      setIsError(true);
      logToTerminal(`❌ PIPELINE CRASH: ${err.message}`);
    }
  };

  return (
    <div className="admin-layout-container" style={{ padding: "24px", minHeight: "100vh" }}>
      <div className="header" style={{ marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--primary-dark)" }}>Mock Test Assembly Engine</h1>
          <p style={{ color: "var(--ink-soft)", margin: 0 }}>Automated Image Deployment Pipeline</p>
        </div>
      </div>

      {phase === 1 && (
        <div className="tableWrapper" style={{ padding: "24px", maxWidth: "600px", background: "var(--surface)" }}>
          <h3 style={{ marginTop: 0 }}>Step 1: Test Instantiation</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="searchBox-wrap">
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-soft)" }}>Target Exam Type</label>
              <select className="searchBox" value={exam} onChange={(e) => setExam(e.target.value)} style={{ width: "100%", marginTop: "4px" }}>
                <option value="MHT-CET">MHT-CET</option>
                <option value="JEE">JEE Mains</option>
                <option value="NEET">NEET</option>
              </select>
            </div>
            <div className="searchBox-wrap">
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-soft)" }}>Internal Mock Name</label>
              <input type="text" className="searchBox" placeholder="e.g., Target Mock Test 01" value={mockName} onChange={(e) => setMockName(e.target.value)} style={{ width: "100%", marginTop: "4px" }} />
            </div>
            <div className="searchBox-wrap">
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-soft)" }}>GitHub Target Folder</label>
              <input type="text" className="searchBox" placeholder="e.g., mock_test_01" value={folderName} onChange={(e) => setFolderName(e.target.value)} style={{ width: "100%", marginTop: "4px" }} />
            </div>
            <button className="actionPickBtn" onClick={handleStartAssembler} disabled={isProcessing} style={{ padding: "12px", fontSize: "14px", width: "100%" }}>
              Initialize Engine
            </button>
          </div>
        </div>
      )}

      {phase === 2 && (
        <div className="tableWrapper" style={{ background: "var(--surface)" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface-alt)" }}>
            <div>
              <h3 style={{ margin: 0 }}>Step 2: Blueprint Architecture</h3>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-soft)" }}>{mockName} ({folderName})</p>
            </div>
            <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                <input type="checkbox" checked={isFixedWeight} onChange={toggleFixedWeight} style={{ width: "16px", height: "16px" }} />
                Lock Fixed Weightage Schema
              </label>
              <button className="actionPickBtn reportTopGrad" onClick={handleDeployTest} disabled={isProcessing} style={{ padding: "8px 24px", color: "white" }}>
                🚀 Compile & Deploy
              </button>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--surface-alt)", textAlign: "left", fontSize: "12px", color: "var(--ink-soft)" }}>
                <th style={{ padding: "12px 24px" }}>Subject</th>
                <th style={{ padding: "12px 24px" }}>Chapter Node</th>
                <th style={{ padding: "12px 24px" }}>Target Allocation</th>
                <th style={{ padding: "12px 24px" }}>Selection Mode</th>
                <th style={{ padding: "12px 24px" }}>Action Status</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item, idx) => {
                const alloc = allocations[item.chapter_name] || { count: 0, mode: "Random" };
                const currentSelectionsCount = selectedQuestions[item.chapter_name]?.length || 0;
                const isWarning = alloc.count > item.available_count;
                
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 24px" }}>
                      <span className="sectionBadge">{item.subject}</span>
                    </td>
                    <td style={{ padding: "12px 24px", fontWeight: 600, color: "var(--ink)" }}>
                      {item.chapter_name}
                      <div style={{ fontSize: "11px", color: isWarning ? "var(--danger)" : "var(--ink-faint)", marginTop: "4px" }}>
                        Inventory Available: {item.available_count}
                      </div>
                    </td>
                    <td style={{ padding: "12px 24px" }}>
                      <input 
                        type="number" 
                        className="searchBox" 
                        value={alloc.count} 
                        onChange={(e) => handleManualCountChange(item.chapter_name, e.target.value)}
                        disabled={isFixedWeight}
                        style={{ width: "60px", padding: "4px 8px", textAlign: "center" }}
                      />
                    </td>
                    <td style={{ padding: "12px 24px" }}>
                      <button 
                        className="actionPickBtn" 
                        onClick={() => toggleSelectionMode(item.chapter_name)}
                        style={{ background: alloc.mode === "Random" ? "var(--primary-soft)" : "var(--surface-alt)", color: alloc.mode === "Random" ? "var(--primary)" : "var(--ink-soft)", border: "1px solid var(--border)" }}
                      >
                        {alloc.mode === "Random" ? "🎲 Auto-Random" : "✋ Manual Pick"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 24px" }}>
                      {alloc.mode === "Random" ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="checkmarkText" style={{ whiteSpace: "nowrap" }}>✓ Auto ({alloc.count})</span>
                          <button type="button" className="actionPickBtn" onClick={() => openManualPicker(item.chapter_name)} style={{ background: "var(--primary-soft)", color: "var(--primary)", padding: "4px 10px", fontSize: "11px" }}>
                            👁️ Preview
                          </button>
                        </div>
                      ) : (
                        <button type="button" className="actionPickBtn" onClick={() => openManualPicker(item.chapter_name)} style={{ background: currentSelectionsCount === alloc.count ? "var(--success-bg)" : "var(--danger-bg)", color: currentSelectionsCount === alloc.count ? "var(--success)" : "var(--danger)", border: currentSelectionsCount === alloc.count ? "1px solid var(--success-border)" : "1px solid var(--danger-border)" }}>
                          {currentSelectionsCount === alloc.count ? `✓ Configured (${currentSelectionsCount}/${alloc.count})` : `⚠️ Choose (${currentSelectionsCount}/${alloc.count})`}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: MANUAL GRID PICKER */}
      {activePickerChapter && (
        <div className="studentModalBackdrop" style={{ display: "flex", position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", justifyContent: "center", alignItems: "center", zIndex: 999 }}>
          <div className="studentModal" style={{ width: "900px", maxWidth: "95vw", height: "85vh", display: "flex", flexDirection: "column" }}>
            <div className="modalHeader" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>Select Questions: {activePickerChapter}</h2>
                <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-soft)" }}>
                  Target Configuration: <strong style={{ color: "var(--primary)" }}>{tempSelection.length} / {(allocations[activePickerChapter] || {count:0}).count}</strong> Selected
                </p>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button className="actionPickBtn" style={{ background: "transparent", color: "var(--ink)" }} onClick={() => setActivePickerChapter(null)}>Cancel</button>
                <button className="actionPickBtn" onClick={saveManualSelection}>Save Selection</button>
              </div>
            </div>
            <div className="modalBody" style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", padding: "16px" }}>
              {pickerQuestions.map((q, idx) => {
                const isSelected = tempSelection.some(sel => (sel.q_id === q.q_id || (sel.id && sel.id === q.id)));
                return (
                  <div key={q.q_id || q.id || `picker-idx-${idx}`} onClick={() => toggleManualQuestionSelection(q)} style={{ border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}`, borderRadius: "8px", cursor: "pointer", position: "relative", background: isSelected ? "var(--primary-soft)" : "var(--surface)", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: "6px", left: "6px", background: "var(--surface)", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, border: "1px solid var(--border)" }}>
                      Key: {(q.answer_key || q.ans || "A").toUpperCase()}
                    </div>
                    {isSelected && <div style={{ position: "absolute", top: "6px", right: "6px", background: "var(--primary)", color: "white", width: "20px", height: "20px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: "bold" }}>✓</div>}
                    <img src={q.question_img_url} alt="Question Graphic" style={{ width: "100%", height: "180px", objectFit: "contain", padding: "24px 8px 8px 8px" }} loading="lazy" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RUNTIME PROGRESS TERMINAL */}
      {isProcessing && terminalLogs.length > 0 && (
        <div className="studentModalBackdrop" style={{ display: "flex", position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", backgroundColor: "rgba(15, 23, 42, 0.7)", backdropFilter: "blur(5px)", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div className="studentModal reportTopGrad" style={{ width: "630px", padding: "24px", color: "#e2e8f0" }}>
            <h3 style={{ margin: "0 0 16px 0", color: isError ? "#f87171" : "#38bdf8", display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="dot" style={{ background: isError ? "#f87171" : "#38bdf8" }} />
              {isError ? "Build Engine Exception Encountered" : "Compiling Package & Pushing Changes..."}
            </h3>
            <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: "8px", padding: "16px", fontFamily: "monospace", fontSize: "12px", height: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {terminalLogs.map((log, i) => (
                <div key={i} style={{ color: log.includes("❌") || log.includes("Exception") ? "#f87171" : log.includes("🎉") || log.includes("SUCCESS") || log.includes("✨") ? "#4ade80" : "#94a3b8" }}>
                  {log}
                </div>
              ))}
            </div>
            {isError && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                <button className="actionPickBtn" style={{ background: "var(--danger)", color: "white", border: "none" }} onClick={() => setIsProcessing(false)}>
                  Close Terminal Workspace
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}