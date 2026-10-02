"use client";

import { useState } from "react";
import "./overview.css";

export default function CMSOverviewDashboard() {
  const [exam, setExam] = useState("MHT-CET");
  const [subject, setSubject] = useState("Physics");
  const [chapter, setChapter] = useState("Solid State");
  const [qType, setQType] = useState("Theory");
  
  // 🟢 Features state management
  const [zoomScale, setZoomScale] = useState(60); 
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [bookmarkedIds, setBookmarkedIds] = useState([]);
  
  // Modal visibility flags
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [showBookmarksOverlay, setShowBookmarksOverlay] = useState(false);
  const [showDbInspectorOverlay, setShowDbInspectorOverlay] = useState(false);
  
  // 🟢 Enhanced high-density sample mock database structures
  const [mockQuestions, setMockQuestions] = useState([
    { id: "q_cet_001", num: 1, ans: "d", prompt: "The constituent particles in a solid possess ____________.", q_img: "https://picsum.photos/id/10/600/200", s_img: "https://picsum.photos/id/20/600/200" },
    { id: "q_cet_002", num: 2, ans: "b", prompt: "The constituent particles of solid can only ____________ about their mean position.", q_img: "https://picsum.photos/id/30/600/200", s_img: "https://picsum.photos/id/40/600/200" },
    { id: "q_cet_003", num: 3, ans: "a", prompt: "Thermal energy of solid substance is __________.", q_img: "https://picsum.photos/id/50/600/200", s_img: "https://picsum.photos/id/60/600/200" },
    { id: "q_cet_004", num: 4, ans: "c", prompt: "Anisotropic performance values are highly characteristic footprints.", q_img: "https://picsum.photos/id/70/600/200", s_img: "https://picsum.photos/id/80/600/200" }
  ]);

  // Simulated Global Database tree matrix mapping layout counts
  const mockGlobalDbTree = [
    { chapterName: "Solid State Chemistry", theoryCount: 42, numericalCount: 28 },
    { chapterName: "AC Circuits Vector", theoryCount: 35, numericalCount: 50 },
    { chapterName: "Rotational Dynamics", theoryCount: 61, numericalCount: 44 },
    { chapterName: "Mechanical Properties of Fluids", theoryCount: 19, numericalCount: 32 }
  ];

  const handleAnswerChange = (itemId, val) => {
    setMockQuestions(prev => prev.map(q => q.id === itemId ? { ...q, ans: val } : q));
  };

  const toggleBookmark = (id) => {
    setBookmarkedIds(prev => prev.includes(id) ? prev.filter(bId => bId !== id) : [...prev, id]);
  };

  // 🟢 FIXED: Smooth step transitions (1 column -> 2 columns -> 4 columns) mapping slider ranges
  let gridLayoutClass = "canvas-grid-split-row-engine"; 
  let currentModeText = "Mode: Single Asset Split Row Layout";

  if (zoomScale >= 35 && zoomScale < 70) {
    gridLayoutClass = "canvas-grid-dual-engine";
    currentModeText = "Mode: 2-Column Responsive Asset Row Layout";
  } else if (zoomScale < 35) {
    gridLayoutClass = "canvas-grid-quad-engine";
    currentModeText = "Mode: 4-Column High-Density Card Grid Layout";
  }

  const imageFrameHeight = `${100 + (zoomScale * 1.5)}px`;
  const filteredBookmarkedItems = mockQuestions.filter(q => bookmarkedIds.includes(q.id));

  return (
    <div className={`micro-overview-viewport-wrapper ${isDarkMode ? "theme-dark-lux" : "theme-light-lux"}`}>
      
      {/* 🟢 TOP CONTROLS HEADER BAR */}
      <header className="micro-topbar-controls">
        <div className="engine-brand-emblem-compact">
          <div className="pulse-dot-micro"></div>
          <span className="brand-txt-glow-micro">Production Ledger Workspace</span>
        </div>

        <div className="micro-selector-row">
          <select className="micro-dropdown-select" value={exam} onChange={(e) => setExam(e.target.value)}>
            <option value="MHT-CET">MHT-CET Matrix</option>
            <option value="JEE">JEE Core/Adv</option>
          </select>
          <select className="micro-dropdown-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="Physics">Physics</option>
            <option value="Chemistry">Chemistry</option>
          </select>
          <select className="micro-dropdown-select wide-select" value={chapter} onChange={(e) => setChapter(e.target.value)}>
            <option value="Solid State">Solid State Chemistry</option>
            <option value="AC Circuits">AC Circuits Vector</option>
          </select>
          <select className="micro-dropdown-select" value={qType} onChange={(e) => setQType(e.target.value)}>
            <option value="Theory">Theory Ledger</option>
            <option value="Numerical">Numerical Ledger</option>
          </select>
        </div>

        {/* Action Button cluster in right top header area */}
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

      {/* 🟢 UTILITIES UTILITY SHELF PANEL */}
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
        <div className="layout-indicator-tag">{currentModeText}</div>
      </div>

      {/* 🟢 CORE FLUID CANVAS TILES */}
      <main className="micro-fluid-grid-canvas">
        <div className={gridLayoutClass}>
          {mockQuestions.map((item) => (
            <div key={item.id} className="micro-asset-card-frame">
              <div className="card-micro-header-meta">
                <span className="meta-q-index-id">#{item.num} · <span className="dim-id-txt">{item.id}</span></span>
                
                <div className="card-right-controls-action-cluster">
                  <div className="micro-ans-picker-wrapper">
                    <span className="micro-label-dim">Key:</span>
                    <select className="micro-select-key-trigger" value={item.ans} onChange={(e) => handleAnswerChange(item.id, e.target.value)}>
                      <option value="a">a</option><option value="b">b</option><option value="c">c</option><option value="d">d</option>
                    </select>
                  </div>

                  {/* Bookmark Button Tag */}
                  <button type="button" className={`micro-bookmark-btn-badge ${bookmarkedIds.includes(item.id) ? "is-active" : ""}`} onClick={() => toggleBookmark(item.id)}>
                    {bookmarkedIds.includes(item.id) ? "🔖" : "🏳️"}
                  </button>

                  <button type="button" className="micro-action-btn-trigger variant-replace" onClick={() => setActiveModalItem(item)}>
                    🔄 Replace
                  </button>
                </div>
              </div>

              <div className="card-asset-viewports-split-grid">
                <div className="micro-img-viewport-frame" style={{ height: imageFrameHeight }}>
                  <div className="micro-viewport-indicator-tag">Question Image</div>
                  <img src={item.q_img} alt="Q" className="micro-rendering-img-asset" />
                </div>
                <div className="micro-img-viewport-frame" style={{ height: imageFrameHeight }}>
                  <div className="micro-viewport-indicator-tag">Solution Image</div>
                  <img src={item.s_img} alt="S" className="micro-rendering-img-asset" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* 🟢 FEATURE 1: BLURRED OVERLAY INTERACTIVE BOOKMARK VAULT VIEWPORT */}
      {showBookmarksOverlay && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog modal-wide-scroll-view animate-fade">
            <div className="modal-hud-header display-flex-row-space">
              <div>
                <span className="modal-title-txt color-amber">🔖 Active Category Bookmark Vault Ledger</span>
                <span className="modal-subtitle-id-token">Viewing filtered stored entries within target context ({chapter})</span>
              </div>
              <button type="button" className="close-pane-hud-btn" onClick={() => setShowBookmarksOverlay(false)}>✕</button>
            </div>

            <div className="modal-internal-scrollable-payload-lane">
              {filteredBookmarkedItems.length === 0 ? (
                <div className="empty-state-micro-notice">No questions bookmarked under this specific category matrix ledger.</div>
              ) : (
                filteredBookmarkedItems.map((item) => (
                  <div key={item.id} className="micro-asset-card-frame sub-panel-bg" style={{ marginBottom: "10px" }}>
                    <div className="card-micro-header-meta">
                      <span className="meta-q-index-id">#{item.num} · <span className="dim-id-txt">{item.id}</span></span>
                      <span className="micro-select-key-trigger">Key: {item.ans.toUpperCase()}</span>
                    </div>
                    <div className="card-asset-viewports-split-grid">
                      <div className="micro-img-viewport-frame" style={{ height: "140px" }}><img src={item.q_img} className="micro-rendering-img-asset" alt="Q" /></div>
                      <div className="micro-img-viewport-frame" style={{ height: "140px" }}><img src={item.s_img} className="micro-rendering-img-asset" alt="S" /></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🟢 FEATURE 2: BLURRED OVERLAY ACTIVE DATABASE STRUCTURAL MANAGER INSPECTOR */}
      {showDbInspectorOverlay && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog modal-wide-scroll-view animate-fade">
            <div className="modal-hud-header display-flex-row-space">
              <div>
                <span className="modal-title-txt color-emerald">🗄️ Total DB Inventory Structural Manifest</span>
                <span className="modal-subtitle-id-token">Real-time production summary allocations across course syllabus targets</span>
              </div>
              <button type="button" className="close-pane-hud-btn" onClick={() => setShowDbInspectorOverlay(false)}>✕</button>
            </div>

            <div className="modal-internal-scrollable-payload-lane">
              <table className="micro-dense-matrix-grid-table">
                <thead>
                  <tr>
                    <th>Chapter Index Title Location Target</th>
                    <th style={{ color: "#10b981" }}>Theory Ledger Assets</th>
                    <th style={{ color: "#3b82f6" }}>Numerical Ledger Assets</th>
                    <th>Combined Total Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {mockGlobalDbTree.map((ch, index) => (
                    <tr key={index}>
                      <td className="font-weight-700">{ch.chapterName}</td>
                      <td className="text-center align-mono">{ch.theoryCount} Qs</td>
                      <td className="text-center align-mono">{ch.numericalCount} Qs</td>
                      <td className="text-center align-mono font-weight-700 color-blue-glow">{ch.theoryCount + ch.numericalCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 CORE ASSET REPLACEMENT POPUP MODAL DIALOG */}
      {activeModalItem && (
        <div className="opaque-modal-backdrop-overlay">
          <div className="opaque-central-hud-dialog">
            <div className="modal-hud-header">
              <span className="modal-title-txt">Asset Replacement Routine Ledger Matrix</span>
              <span className="modal-subtitle-id-token">Target Item Index Token ID Reference: {activeModalItem.id}</span>
            </div>
            <div className="modal-dropzones-horizontal-split-row">
              <div className="opaque-interactive-drop-bucket">
                <div className="dropzone-hud-icon-badge">📁</div>
                <span className="dropzone-main-heading-txt">Upload Question Image Component</span>
                <input type="file" className="hidden-input-overlay-trigger" accept="image/png" />
              </div>
              <div className="opaque-interactive-drop-bucket">
                <div className="dropzone-hud-icon-badge">📁</div>
                <span className="dropzone-main-heading-txt">Upload Solution Image Component</span>
                <input type="file" className="hidden-input-overlay-trigger" accept="image/png" />
              </div>
            </div>
            <div className="modal-action-footer-shelf">
              <button type="button" className="modal-action-btn variant-cancel" onClick={() => setActiveModalItem(null)}>Abort Changes</button>
              <button type="button" className="modal-action-btn variant-confirm" onClick={() => setActiveModalItem(null)}>Confirm and Sync Asset Buffers</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}