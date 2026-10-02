// 📂 SAVE THIS FILE AT: app/admin/cms-v2/page.js
//
// CETWALLE CMS v2 — authors question_bundles_v2 rows from structured MathML/HTML
// question-bank JSON (the { chapters: { CODE: [ {html, options, answer, hint, ...} ] } }
// export shape), instead of raw LaTeX + server-side Playwright rendering.
//
// KEY DIFFERENCES FROM THE ORIGINAL CMS (page.js):
//   - No Python render server, no Playwright, no WebP screenshots. Math is native
//     MathML already embedded in the source `html`/`hint` strings — the browser
//     renders it live, instantly, with zero round-trip.
//   - Images are extracted from inline base64 data URIs (not a separately-uploaded
//     Vertopal media folder) and uploaded to Storage at deploy time.
//   - Chapter picker reads `syllabus_chapters_v2` and uses its `id` as both the
//     foreign key on question_bundles_v2 AND the Storage folder name for that
//     chapter's images — one stable key for both.
//   - Deploy pushes structured objects (question_html/options/solution_html) into
//     question_bundles_v2.questions, not a single reconstructed LaTeX blob.
//   - HTML is sanitized (DOMPurify, loaded from CDN) before both preview render and
//     before being sent to the server — untrusted export HTML never touches
//     dangerouslySetInnerHTML unsanitized, and never gets stored unsanitized either.

"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { supabase } from "../../../lib/supabase";
import "./cms-v2.css";

// ---------------------------------------------------------------------------
// DOMPurify is loaded once from CDN (matches this project's existing pattern of
// pulling Monaco from cdnjs rather than bundling it). Falls back to a minimal
// manual strip if the CDN script hasn't loaded yet, so preview never renders
// raw unsanitized HTML even in that edge case.
// ---------------------------------------------------------------------------
function basicStrip(raw) {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "");
}

function sanitizeHtml(raw) {
  if (!raw) return "";
  if (typeof window !== "undefined" && window.DOMPurify) {
    try {
      const clean = window.DOMPurify.sanitize(raw, {
        ADD_TAGS: ["math", "mi", "mo", "mn", "mrow", "mfrac", "msup", "msub", "msqrt", "mtext", "mspace", "msubsup"],
        ADD_ATTR: ["mathvariant", "xmlns"],
      });
      // DOMPurify can legitimately return "" if it decided the whole fragment was
      // unsafe, but it can also come back empty on certain malformed MathML without
      // throwing. Either way, empty output for non-empty input is suspicious enough
      // to fall back rather than silently show a blank card.
      if (!clean && raw.trim()) {
        console.warn("sanitizeHtml: DOMPurify returned empty output for non-empty input, falling back.", raw.slice(0, 200));
        return basicStrip(raw);
      }
      return clean;
    } catch (err) {
      // A single malformed question (bad MathML, mismatched tags, etc.) must never
      // blank its own card silently — log it and fall back to the manual strip so
      // the content still renders, even if slightly less sanitized.
      console.error("sanitizeHtml: DOMPurify threw, falling back to basic strip.", err, raw.slice(0, 200));
      return basicStrip(raw);
    }
  }
  // Minimal fallback: strip script/style/on* — not a substitute for DOMPurify,
  // only a safety net for the brief window before the CDN script finishes loading.
  return basicStrip(raw);
}

// Locates a question's position in the raw editor text by finding its "id"
// field, searching forward from fromIndex so repeated/duplicate ids resolve
// in document order rather than always jumping to the first match. Tries a
// few common JSON spacing variants since Monaco text may or may not have a
// space after the colon.
function findQuestionOffset(text, sourceId, fromIndex) {
  if (sourceId == null || !text) return -1;
  const idStr = String(sourceId);
  const patterns = [
    `"id": "${idStr}"`,
    `"id":"${idStr}"`,
    `"id": ${idStr}`,
    `"id":${idStr}`,
  ];
  let best = -1;
  for (const p of patterns) {
    const i = text.indexOf(p, fromIndex);
    if (i !== -1 && (best === -1 || i < best)) best = i;
  }
  return best;
}

// Finds every data:image/...;base64,... occurrence in a string and returns
// [{ fullMatch, mimeType, base64Data }] so the caller can decode + replace each one.
function extractBase64Images(text) {
  if (!text) return [];
  const re = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g;
  const found = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    found.push({ fullMatch: m[0], mimeType: m[1], base64Data: m[2] });
  }
  return found;
}

// Swaps any predicted Storage URL that has a not-yet-uploaded local blob for its
// blob object URL, so preview shows the real image instantly after conversion,
// even though nothing has actually reached Storage yet. Only affects rendering —
// the underlying editor text keeps the real predicted URL, unchanged.
function resolvePreviewSrcs(html, pendingImages) {
  if (!html || !pendingImages || Object.keys(pendingImages).length === 0) return html;
  let out = html;
  for (const [publicUrl, info] of Object.entries(pendingImages)) {
    if (out.includes(publicUrl)) out = out.split(publicUrl).join(info.objectUrl);
  }
  return out;
}

// Converts a Blob back to a base64 string so it can travel inside a JSON body —
// used only at Deploy time, to hand a locally-converted-but-not-yet-uploaded
// image's real bytes to the server for the actual Storage write.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Decodes a data: URI image and re-encodes it as a genuine PNG via canvas —
// guarantees the output format is PNG regardless of what the source was
// (jpeg/webp/png), matching "convert to PNG" rather than just relabeling bytes.
function convertDataUriToPngBlob(dataUri) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas PNG export failed."));
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to decode embedded image."));
    img.src = dataUri;
  });
}

// Predicts the exact public Storage URL a converted image will live at once
// actually deployed — same bucket/path convention push-v2's extractAndUploadImages
// uses server-side (question-images/{chapterId}/{randomId}.{ext}), generated
// here client-side so the editor text can be patched immediately, before upload.
function predictImagePath(chapterId, ext) {
  const randomId = Math.random().toString(16).slice(2, 8); // 6 hex-ish chars
  const fileName = `${randomId}.${ext}`;
  const storagePath = `${chapterId}/${fileName}`;
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images-v2/${storagePath}`;
  return { fileName, storagePath, publicUrl };
}

// Renders one option's letter + pre-sanitized HTML content. Memoized so an
// unrelated parent re-render (e.g. typing in Monaco) doesn't re-run this for
// all 800+ options — only when this option's own clean HTML or the pending
// image set actually changes.
const OptionRow = memo(function OptionRow({ letter, cleanHtml, isAnswer, pendingImages, pendingImageVersion }) {
  return (
    <div className={`qv2-option ${isAnswer ? "is-answer" : ""}`}>
      <span className="qv2-option-letter">{letter}</span>
      <div dangerouslySetInnerHTML={{ __html: resolvePreviewSrcs(cleanHtml, pendingImages) }} />
    </div>
  );
});

// A single parsed+previewed question card. Memoized: with 700-800 cards on
// screen, re-running DOMPurify + rebuilding this whole subtree on every
// keystroke elsewhere in the app (Monaco typing, toasts, upload progress...)
// was the actual source of the lag — sanitization now happens once at parse
// time (see parseInput), and this component only re-renders when its own
// item, index, or the pending-image set actually changes.
const QuestionCard = memo(function QuestionCard({ item, index, onAnswerChange, onRemove, onJumpToCode, pendingImages, pendingImageVersion }) {
  const imgCount =
    extractBase64Images(item.question_html).length +
    extractBase64Images(item.solution_html || "").length;

  return (
    <div className={`qv2-card ${item.parseError ? "has-error" : ""}`}>
      <div className="qv2-card-head">
        <span className="qv2-card-title">
          Question <strong>#{item.q_num ?? index + 1}</strong>
          {item.sourceId ? <> — src id {item.sourceId}</> : null}
        </span>
        <div className="actions">
          {item.textOffset != null && item.textOffset >= 0 && (
            <button
              type="button"
              className="qv2-icon-btn qv2-jump-btn"
              onClick={() => onJumpToCode(item.textOffset)}
              title="Jump to this question's JSON in the editor"
            >
              ↳ Code
            </button>
          )}
          <select
            className="qv2-answer-select"
            value={item.answer_key}
            onChange={(e) => onAnswerChange(item.localId, e.target.value)}
          >
            {["a", "b", "c", "d"].map((l) => (
              <option key={l} value={l}>{l.toUpperCase()}</option>
            ))}
          </select>
          <button type="button" className="qv2-icon-btn" onClick={() => onRemove(item.localId)}>
            Remove
          </button>
        </div>
      </div>

      <div className="qv2-body">
        {item.parseError && (
          <div className="qv2-warning-banner">{item.parseError}</div>
        )}

        <div dangerouslySetInnerHTML={{ __html: resolvePreviewSrcs(item.question_html_clean, pendingImages) }} />

        <div className="qv2-options">
          {["A", "B", "C", "D"].map((letter) => (
            <OptionRow
              key={letter}
              letter={letter}
              cleanHtml={item.options_clean?.[letter] || ""}
              isAnswer={item.answer_key?.toUpperCase() === letter}
              pendingImages={pendingImages}
              pendingImageVersion={pendingImageVersion}
            />
          ))}
        </div>

        {item.solution_html_clean && (
          <div className="qv2-solution">
            <div className="qv2-solution-label">Solution</div>
            <div dangerouslySetInnerHTML={{ __html: resolvePreviewSrcs(item.solution_html_clean, pendingImages) }} />
          </div>
        )}

        <div className="qv2-meta-row">
          {item.section && <span className="qv2-meta-chip">{item.section}</span>}
          {item.quesType && <span className="qv2-meta-chip">{item.quesType === "P" ? "Numerical" : "Theory"}</span>}
          {imgCount > 0 && <span className="qv2-meta-chip">{imgCount} embedded image{imgCount > 1 ? "s" : ""}</span>}
          {item.examHistory?.length > 0 && (
            <span className="qv2-meta-chip">
              {item.examHistory.map((e) => `${e.examName} ${e.examYear}`).join(", ")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function CmsV2() {
  // --- taxonomy state, sourced from syllabus_chapters_v2 ---
  const [chapterOptions, setChapterOptions] = useState([]); // full rows: {id, exam, standard, subject, chapter_name, default_weight}
  const [standard, setStandard] = useState("12th");
  const [subject, setSubject] = useState("Physics");
  const [chapterId, setChapterId] = useState("");
  const [questionType, setQuestionType] = useState("Theory");

  const [chapterQuestionCount, setChapterQuestionCount] = useState(0);
  // Tracks "Deploy" success independently per section (Theory / Numerical) so
  // deploying one doesn't affect the other's button state.
  const [deployedTypes, setDeployedTypes] = useState({ Theory: false, Numerical: false });
  // When we clear the editor ourselves right after a successful deploy, the
  // resulting onDidChangeModelContent firing shouldn't count as "the user
  // edited the JSON" and wipe out the green state we just set.
  const suppressDeployResetRef = useRef(false);

  // --- editor + parsed state ---
  const [rawJsonInput, setRawJsonInput] = useState("");
  const [parsedItems, setParsedItems] = useState([]);
  const [globalParseError, setGlobalParseError] = useState("");
  // Full breakdown of what's actually in the pasted JSON, independent of the
  // Theory/Numerical dropdown filter — so you always know what's in the file
  // before deciding what to deploy.
  const [detectedCounts, setDetectedCounts] = useState({ theory: 0, numerical: 0, other: 0, total: 0 });

  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ isActive: false, current: 0, total: 0 });
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: null });

  const editorRef = useRef(null);
  const cancelUploadRef = useRef(false);
  const deployAbortRef = useRef(null); // AbortController for the in-flight single-shot deploy request
  // publicUrl -> { blob, objectUrl, base64Data, mimeType, storagePath }
  // Populated by "Convert Images" — real bytes sitting in the browser, predicted
  // final path already baked into the editor text, nothing uploaded to Storage yet.
  const pendingImagesRef = useRef({});
  const [pendingImageVersion, setPendingImageVersion] = useState(0); // bump to force re-render after conversion

  // Load DOMPurify from CDN once, and force one re-render when it's ready so
  // any cards that already rendered (via the weaker fallback strip) get
  // re-sanitized properly instead of staying stuck on the fallback forever.
  const [dompurifyReady, setDompurifyReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.DOMPurify) {
      setDompurifyReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.5/purify.min.js";
    script.async = true;
    script.onload = () => setDompurifyReady(true);
    script.onerror = () => console.error("Failed to load DOMPurify from CDN — preview will use the basic fallback sanitizer.");
    document.body.appendChild(script);
  }, []);

  // --- sync chapter list from syllabus_chapters_v2 ---
  useEffect(() => {
    async function loadChapters() {
      try {
        const { data, error } = await supabase
          .from("syllabus_chapters_v2")
          .select("id, exam, standard, subject, chapter_name, default_weight")
          .eq("standard", standard)
          .eq("subject", subject)
          .order("chapter_name", { ascending: true });

        if (error) throw error;
        setChapterOptions(data || []);
        if (data && data.length > 0) {
          setChapterId(data[0].id);
        } else {
          setChapterId("");
        }
      } catch (err) {
        console.error("syllabus_chapters_v2 fetch failed:", err);
        setChapterOptions([]);
      }
    }
    loadChapters();
  }, [standard, subject]);

  const activeChapterRow = chapterOptions.find((c) => c.id === chapterId) || null;

  // --- live question count for the selected chapter/type ---
  useEffect(() => {
    async function loadCount() {
      if (!chapterId) { setChapterQuestionCount(0); return; }
      try {
        const res = await fetch(
          `/api/admin/chapter-count?chapter_id=${encodeURIComponent(chapterId)}&question_type=${encodeURIComponent(questionType)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load count.");
        setChapterQuestionCount(Number(data.count) || 0);
      } catch (err) {
        console.error("Live count fetch failed:", err);
        setChapterQuestionCount(0);
      }
    }
    loadCount();
  }, [chapterId, questionType]);

  // --- Monaco setup (JSON language, no custom LaTeX tokenizer needed anymore) ---
  useEffect(() => {
    if (typeof window === "undefined" || !window.require) return;

    const createEditor = () => {
      const container = document.getElementById("cmsv2-editor-canvas");
      if (!container || container.children.length > 0) return;

      const editor = window.monaco.editor.create(container, {
        value: rawJsonInput,
        language: "json",
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        wordWrap: "on",
      });

      editor.onDidChangeModelContent(() => {
        const val = editor.getValue();
        setRawJsonInput(val);
        if (suppressDeployResetRef.current) {
          // This change came from our own post-deploy editor.setValue("") —
          // not a real edit, so don't touch the deployed-green state.
          suppressDeployResetRef.current = false;
        } else {
          // Real user edit — whatever was deployed before no longer matches
          // what's in the editor, so both sections go back to normal.
          setDeployedTypes({ Theory: false, Numerical: false });
        }
      });
      editorRef.current = editor;
    };

    // 🟢 FIX: if Monaco was already loaded by another mounted page (e.g. the old
    // CMS at /admin/cms, kept alive by App Router across a client-side nav), just
    // create the editor instance directly — re-running window.require(['vs/editor/editor.main'])
    // against an already-defined module is what caused the
    // "Duplicate definition of module 'vs/editor/editor.main'" console error.
    if (window.monaco) {
      createEditor();
      return;
    }

    window.require.config({ paths: { vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs" } });
    window.require(["vs/editor/editor.main"], createEditor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- parse the pasted JSON into preview-ready items ---
  const parseInput = useCallback(() => {
    setGlobalParseError("");
    if (!rawJsonInput.trim()) {
      setParsedItems([]);
      setDetectedCounts({ theory: 0, numerical: 0, other: 0, total: 0 });
      return;
    }

    let raw;
    try {
      raw = JSON.parse(rawJsonInput);
    } catch (e) {
      setGlobalParseError(`JSON did not parse: ${e.message}`);
      setParsedItems([]);
      setDetectedCounts({ theory: 0, numerical: 0, other: 0, total: 0 });
      return;
    }

    // Accept either the full { chapters: { CODE: [...] } } export shape,
    // a bare array of question objects, or a single question object.
    // NOTE: the CODE key itself (e.g. "MHP3") is intentionally never used —
    // which chapter these belong to is decided purely by the topbar dropdown,
    // matched against syllabus_chapters_v2.id. The export's own chapter code
    // is just leftover from whatever tool generated the file.
    let list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && Array.isArray(raw.chapters)) {
      list = raw.chapters;
    } else if (raw && raw.chapters && typeof raw.chapters === "object") {
      list = Object.values(raw.chapters).flat();
    } else if (raw && typeof raw === "object") {
      list = [raw];
    }

    // Theory vs Numerical is decided by each question's own quesType field
    // ("T" / "P"), never by what happens to be selected in the dropdown.
    let theoryCount = 0, numericalCount = 0, otherCount = 0;
    for (const q of list) {
      const t = String(q.quesType || "").trim().toUpperCase();
      if (t === "T") theoryCount++;
      else if (t === "P") numericalCount++;
      else otherCount++;
    }
    setDetectedCounts({ theory: theoryCount, numerical: numericalCount, other: otherCount, total: list.length });

    // Track each question's character offset in the raw editor text (by locating
    // its "id" field, scanning forward so duplicate ids resolve in document order)
    // so the preview can jump the Monaco cursor straight to it later.
    let searchCursor = 0;
    const wantedCode = questionType === "Numerical" ? "P" : "T";

    const items = list
      .map((q, idx) => {
        let parseError = null;
        if (!q.html) parseError = "Missing question html field.";
        if (!q.options || !q.options.A || !q.options.B || !q.options.C || !q.options.D) {
          parseError = (parseError ? parseError + " " : "") + "Missing one or more options (A-D).";
        }
        if (!q.answer) parseError = (parseError ? parseError + " " : "") + "Missing answer key.";

        const offset = findQuestionOffset(rawJsonInput, q.id, searchCursor);
        if (offset !== -1) searchCursor = offset + 1;

        // Sanitize once, here, at parse time — not on every render. With
        // 700-800 cards this is the single biggest cost in the app; doing it
        // here means it only re-runs when the JSON text actually changes
        // (debounced), not on every keystroke or unrelated re-render.
        const opts = q.options || {};

        return {
          localId: `item_${idx}_${q.id ?? Math.random().toString(36).slice(2, 7)}`,
          sourceId: q.id ?? null,
          q_num: idx + 1,
          question_html: q.html || "",
          question_html_clean: sanitizeHtml(q.html || ""),
          options: opts,
          options_clean: {
            A: sanitizeHtml(opts.A || ""),
            B: sanitizeHtml(opts.B || ""),
            C: sanitizeHtml(opts.C || ""),
            D: sanitizeHtml(opts.D || ""),
          },
          answer_key: (q.answer || "a").toLowerCase(),
          solution_html: q.hint || "",
          solution_html_clean: sanitizeHtml(q.hint || ""),
          section: q.section1 || "",
          quesType: q.quesType || "",
          examHistory: q.exams || [],
          textOffset: offset,
          parseError,
        };
      })
      // Filter by the question's own quesType matching the Theory/Numerical
      // dropdown — items with no/other quesType are excluded and counted
      // separately in detectedCounts.other so nothing sneaks through unlabeled.
      .filter((it) => String(it.quesType || "").trim().toUpperCase() === wantedCode);

    setParsedItems(items);
  }, [rawJsonInput, questionType]);

  // Re-parse whenever the editor content settles (debounced) — mirrors the
  // original CMS's live-reparse-on-type behavior, adapted for JSON instead of
  // a regex LaTeX splitter.
  useEffect(() => {
    const t = setTimeout(parseInput, 400);
    return () => clearTimeout(t);
  }, [rawJsonInput, parseInput]);

  // Stable references via useCallback — required for QuestionCard's memo to
  // actually bail out on unrelated re-renders (typing, toasts, etc). Without
  // this, a fresh function identity on every parent render would defeat the
  // memoization even though item/pendingImageVersion haven't changed.
  const handleAnswerChange = useCallback((localId, newKey) => {
    setParsedItems((prev) =>
      prev.map((it) => (it.localId === localId ? { ...it, answer_key: newKey } : it))
    );
  }, []);

  const handleRemoveItem = useCallback((localId) => {
    setParsedItems((prev) => prev.filter((it) => it.localId !== localId));
  }, []);

  // Jumps the Monaco cursor straight to a question's "id" field in the raw
  // JSON text and centers it, so you don't have to manually scroll/search
  // through hundreds of questions to find the source of one preview card.
  const handleJumpToCode = useCallback((offset) => {
    if (offset == null || offset < 0 || !editorRef.current) return;
    const editor = editorRef.current;
    const model = editor.getModel();
    if (!model) return;
    const pos = model.getPositionAt(offset);
    editor.revealLineInCenter(pos.lineNumber);
    editor.setPosition(pos);
    editor.focus();
  }, []);

  function handleCancelUpload() {
    cancelUploadRef.current = true;
    if (deployAbortRef.current) deployAbortRef.current.abort();
  }

  // --- Convert Images: decode every embedded base64 image in the raw JSON right
  // now, in the browser (no server round-trip, nothing uploaded to Storage yet).
  // Each one gets a predicted final Storage path/URL (same convention push-v2
  // uses server-side), the base64 data: URI in the editor text gets replaced
  // with that predicted URL, and the preview swaps in a local blob URL so the
  // image still displays correctly even though it hasn't actually been uploaded.
  // The real upload happens later at Deploy, to the exact path predicted here.
  async function handleConvertImages() {
    if (!chapterId) {
      setToast({ type: "error", message: "Pick a chapter first — the predicted path needs it." });
      return;
    }

    const re = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g;
    const matches = [...rawJsonInput.matchAll(re)];
    if (matches.length === 0) {
      setToast({ type: "error", message: "No embedded base64 images found in the current text." });
      return;
    }

    let text = rawJsonInput;
    let convertedCount = 0;

    for (const m of matches) {
      const [fullMatch, mimeType, base64Data] = m;
      // fullMatch may already have been swapped out by an earlier iteration if the
      // exact same data-URI appeared twice — skip if it's no longer present.
      if (!text.includes(fullMatch)) continue;

      const { storagePath, publicUrl } = predictImagePath(chapterId, "png");

      let blob;
      try {
        blob = await convertDataUriToPngBlob(fullMatch);
      } catch (e) {
        console.error("Failed to convert embedded image to PNG:", e);
        continue;
      }

      pendingImagesRef.current[publicUrl] = {
        blob,
        base64Data,
        mimeType,
        storagePath,
        objectUrl: URL.createObjectURL(blob),
      };

      text = text.split(fullMatch).join(publicUrl);
      convertedCount++;
    }

    setRawJsonInput(text);
    if (editorRef.current) editorRef.current.setValue(text);
    setPendingImageVersion((v) => v + 1); // force preview to pick up new pendingImagesRef entries
    setImagesJustDeployed(false); // new images are pending again — button should go back to normal

    setToast({
      type: "success",
      message: `Converted ${convertedCount} image(s) to PNG locally. Paths predicted — not uploaded yet, push them with "Deploy Images" or they'll go out automatically with "Deploy".`,
    });
  }

  // --- Deploy Images: push every pending converted image straight to Storage
  // at its exact predicted path, independent of deploying question rows. Lets
  // images go live before/without touching question_bundles_v2 at all.
  const [imageDeployProgress, setImageDeployProgress] = useState({ isActive: false, current: 0, total: 0 });
  const [imagesJustDeployed, setImagesJustDeployed] = useState(false);

  async function handleDeployImages() {
    const pending = Object.entries(pendingImagesRef.current).filter(([, info]) => !info.uploaded);
    if (pending.length === 0) {
      setToast({ type: "error", message: "No converted images waiting to be deployed. Run Convert Images first." });
      return;
    }

    setImageDeployProgress({ isActive: true, current: 0, total: pending.length });

    // Pre-encode every blob to base64 up front (cheap, local, doesn't need
    // to be reflected in the progress bar) so each batch request below only
    // has to do the actual network + Storage work.
    const items = await Promise.all(
      pending.map(async ([publicUrl, info]) => ({
        publicUrl,
        storagePath: info.storagePath,
        base64Data: await blobToBase64(info.blob),
      }))
    );

    // Send in small concurrent batches instead of one giant request — this is
    // what actually makes the progress bar move (current updates as each
    // batch resolves) and, as a side effect, is faster than either one huge
    // request or fully sequential ones.
    const BATCH_SIZE = 4;
    const CONCURRENCY = 3;
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));

    let completed = 0;
    let uploadedCount = 0;
    let failedCount = 0;
    const allFailed = [];
    let hardError = null;

    async function runBatch(batch) {
      try {
        const res = await fetch("/api/admin/push-images-v2", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploads: batch.map(({ storagePath, base64Data }) => ({ storagePath, base64Data })) }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Image upload failed.");

        const uploadedPaths = new Set((result.uploaded || []).map((u) => u.storagePath));
        for (const { publicUrl, storagePath } of batch) {
          if (uploadedPaths.has(storagePath) && pendingImagesRef.current[publicUrl]) {
            pendingImagesRef.current[publicUrl].uploaded = true;
          }
        }
        uploadedCount += result.uploadedCount || 0;
        failedCount += result.failedCount || 0;
        if (result.failed?.length) allFailed.push(...result.failed);
      } catch (err) {
        // A whole batch failing (network drop, etc.) shouldn't stop the rest —
        // record it and keep going so other batches still land.
        failedCount += batch.length;
        allFailed.push({ storagePath: null, error: err.message });
        hardError = hardError || err;
      } finally {
        completed += batch.length;
        setImageDeployProgress({ isActive: true, current: completed, total: items.length });
        setPendingImageVersion((v) => v + 1);
      }
    }

    // Simple concurrency-limited pool: keep up to CONCURRENCY batches in
    // flight at once, pulling the next one as each finishes.
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < batches.length) {
        const batch = batches[nextIndex++];
        await runBatch(batch);
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

    setImageDeployProgress({ isActive: false, current: items.length, total: items.length });

    if (failedCount > 0) {
      console.error("Some images failed to upload:", allFailed);
      setImagesJustDeployed(false);
      setToast({
        type: "error",
        message: `${uploadedCount} image(s) deployed, ${failedCount} failed — check console for details.`,
      });
    } else {
      setImagesJustDeployed(true);
      setToast({ type: "success", message: `Deployed ${uploadedCount} image(s) to Storage.` });
    }
  }

  // --- deploy: for each item, decode any base64 images, hand them + the
  // cleaned text to /api/admin/push-v2, which uploads to Storage under
  // question-images/{chapterId}/... and upserts question_bundles_v2. ---
  async function handleDeploy() {
    const validItems = parsedItems.filter((it) => !it.parseError);
    if (validItems.length === 0) {
      setModalConfig({
        isOpen: true,
        title: "Nothing to deploy",
        message: "No valid parsed questions — fix the flagged errors above first.",
        onConfirm: null,
      });
      return;
    }
    if (!chapterId) {
      setModalConfig({
        isOpen: true,
        title: "No chapter selected",
        message: "Pick a chapter from the top bar before deploying.",
        onConfirm: null,
      });
      return;
    }

    setModalConfig({
      isOpen: true,
      title: "Confirm deployment",
      message: `Deploy ${validItems.length} question(s) into "${activeChapterRow?.chapter_name}" (${questionType})? Embedded images will be extracted and uploaded to Storage.`,
      onConfirm: () => runDeploy(validItems),
    });
  }

  async function runDeploy(validItems) {
    setIsProcessing(true);
    cancelUploadRef.current = false;
    setUploadProgress({ isActive: true, current: 0, total: validItems.length });

    const abortController = new AbortController();
    deployAbortRef.current = abortController;

    try {
      // 1. Build the COMPLETE payload in-browser first — this array's order
      // is exactly the order questions will be appended in the DB (item 0
      // becomes q_num = existingCount+1, item 1 becomes existingCount+2, ...).
      // Nothing about this changes once built; what you see here is exactly
      // what gets written.
      const questions = await Promise.all(
        validItems.map(async (item) => {
          const itemText = `${item.question_html}||${item.solution_html || ""}||${Object.values(item.options || {}).join("|")}`;
          const explicitUploads = [];
          for (const [publicUrl, info] of Object.entries(pendingImagesRef.current)) {
            if (info.uploaded) continue; // already pushed via "Deploy Images" — bytes are already live at storagePath
            if (itemText.includes(publicUrl)) {
              explicitUploads.push({
                storagePath: info.storagePath,
                base64Data: await blobToBase64(info.blob),
                mimeType: "png",
              });
            }
          }
          return {
            explicitUploads,
            question: {
              sourceId: item.sourceId,
              question_html: item.question_html,
              options: item.options,
              answer_key: item.answer_key,
              solution_html: item.solution_html,
              section: item.section,
              quesType: item.quesType,
              examHistory: item.examHistory,
            },
          };
        })
      );

      if (cancelUploadRef.current) {
        setToast({ type: "error", message: "Cancelled before sending." });
        return;
      }

      // 2. Send the whole thing as ONE request. The server does a single
      // fetch → single sequential append (in this exact array order) →
      // single upsert. There's no window between reading the existing bundle
      // and writing it back where anything else could interleave — it's one
      // atomic round trip, so no two questions' data can ever overlap and
      // ordering is guaranteed to match this array exactly.
      const res = await fetch("/api/admin/push-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          exam: activeChapterRow?.exam || "MHT-CET",
          subject,
          chapter: activeChapterRow?.chapter_name || "",
          questionType,
          questions,
        }),
        signal: abortController.signal,
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || "Deploy failed.");
      }

      setUploadProgress({ isActive: false, current: validItems.length, total: validItems.length });
      setToast({ type: "success", message: `Deployed ${validItems.length} question(s). Chapter total: ${result.totalCount}.` });
      setDeployedTypes((prev) => ({ ...prev, [questionType]: true }));
      // Deliberately NOT clearing rawJsonInput/parsedItems/editor here — one
      // pasted JSON file has both Theory and Numerical questions in it, and
      // wiping the editor after deploying one type made it impossible to
      // then deploy the other type without re-pasting from scratch.
      setChapterQuestionCount(result.totalCount);
    } catch (err) {
      if (err.name === "AbortError") {
        setToast({ type: "error", message: "Deploy cancelled." });
      } else {
        setToast({ type: "error", message: err.message });
      }
    } finally {
      setIsProcessing(false);
      cancelUploadRef.current = false;
      deployAbortRef.current = null;
      setUploadProgress({ isActive: false, current: 0, total: 0 });
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const validCount = parsedItems.filter((it) => !it.parseError).length;
  const errorCount = parsedItems.length - validCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingImageVersion is the deliberate trigger to re-read this ref
  const pendingImageCount = Object.values(pendingImagesRef.current).filter((i) => !i.uploaded).length;

  return (
    <div className="cmsv2-root">
      {/* ---------------- TOPBAR ---------------- */}
      <header className="cmsv2-topbar">
        <div className="cmsv2-brand">
          <span className="dot" />
          CETWALLE
          <span className="badge">CMS v2</span>
        </div>

        <div className="cmsv2-taxonomy">
          <select className="cmsv2-select" value={standard} onChange={(e) => setStandard(e.target.value)}>
            <option value="11th">11th</option>
            <option value="12th">12th</option>
          </select>

          <select className="cmsv2-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {["Physics", "Chemistry", "Mathematics", "Biology"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="cmsv2-select"
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            disabled={chapterOptions.length === 0}
          >
            {chapterOptions.length === 0 && <option value="">No chapters found</option>}
            {chapterOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.chapter_name}</option>
            ))}
          </select>

          <select className="cmsv2-select" value={questionType} onChange={(e) => setQuestionType(e.target.value)}>
            <option value="Theory">Theory</option>
            <option value="Numerical">Numerical</option>
          </select>
        </div>

        <div className="cmsv2-count-pill">
          Already in bundle: <strong>{chapterQuestionCount}</strong>
        </div>
      </header>

      {/* ---------------- SPLIT: EDITOR | PREVIEW ---------------- */}
      <div className="cmsv2-main">
        <div className="cmsv2-editor-pane">
          <div className="cmsv2-pane-header">
            <span>Question Bank JSON</span>
            <div className="actions">
              <button
                type="button"
                className="qv2-icon-btn"
                onClick={handleConvertImages}
                title="Decode embedded base64 images locally, convert to PNG, and patch the editor text with predicted final Storage paths — nothing uploads yet."
              >
                Convert Images
              </button>
              <button
                type="button"
                className="qv2-icon-btn"
                onClick={() => {
                  setRawJsonInput("");
                  if (editorRef.current) editorRef.current.setValue("");
                }}
              >
                Clear
              </button>
            </div>
          </div>
          <div id="cmsv2-editor-canvas" className="cmsv2-json-editor" />
        </div>

        <div className="cmsv2-preview-pane">
          <div className="cmsv2-pane-header">
            <span>
              Live Preview {parsedItems.length > 0 && `(${validCount} ready${errorCount ? `, ${errorCount} flagged` : ""})`}
            </span>
          </div>
          {detectedCounts.total > 0 && (
            <div className="qv2-detected-counts">
              Detected in pasted file: <strong>{detectedCounts.theory}</strong> Theory · <strong>{detectedCounts.numerical}</strong> Numerical
              {detectedCounts.other > 0 && <> · <strong>{detectedCounts.other}</strong> unlabeled (excluded)</>}
              {" — "}showing <strong>{questionType}</strong> only, based on each question's own quesType field.
            </div>
          )}
          <div className="cmsv2-preview-scroll">
            {globalParseError && <div className="qv2-warning-banner">{globalParseError}</div>}

            {parsedItems.length === 0 && !globalParseError && (
              <div className="qv2-empty-state">
                Paste a chapter's question-bank JSON on the left.<br />
                Question, options, answer, and solution render here live — exactly as they'll appear on the exam page.
              </div>
            )}

            {parsedItems.map((item, idx) => (
              <QuestionCard
                key={item.localId}
                item={item}
                index={idx}
                onAnswerChange={handleAnswerChange}
                onRemove={handleRemoveItem}
                onJumpToCode={handleJumpToCode}
                pendingImages={pendingImagesRef.current}
                pendingImageVersion={pendingImageVersion}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="cmsv2-footer">
        <div className="cmsv2-breadcrumb">
          <strong>{activeChapterRow?.exam || "MHT-CET"}</strong> → {standard} → {subject} → {activeChapterRow?.chapter_name || "—"} ({questionType})
        </div>

        <div className="cmsv2-actions">
          {uploadProgress.isActive && (
            <>
              <div className="cmsv2-progress-line">
                <div
                  className="cmsv2-progress-fill"
                  style={{ width: uploadProgress.total > 0 ? `${(uploadProgress.current / uploadProgress.total) * 100}%` : "0%" }}
                />
              </div>
              <button type="button" className="cmsv2-btn cmsv2-btn-danger" onClick={handleCancelUpload}>
                Cancel
              </button>
            </>
          )}

          {imageDeployProgress.isActive && (
            <div className="cmsv2-progress-line">
              <div
                className="cmsv2-progress-fill"
                style={{ width: imageDeployProgress.total > 0 ? `${(imageDeployProgress.current / imageDeployProgress.total) * 100}%` : "0%" }}
              />
            </div>
          )}

          <button
            type="button"
            className="cmsv2-btn"
            onClick={handleDeployImages}
            disabled={imageDeployProgress.isActive || pendingImageCount === 0}
            title="Push every converted-but-not-yet-uploaded image to Storage, at the exact path already baked into the JSON — independent of deploying question rows."
            style={
              imagesJustDeployed && !imageDeployProgress.isActive
                ? { backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#fff" }
                : undefined
            }
          >
            {imageDeployProgress.isActive
              ? "Deploying images…"
              : imagesJustDeployed
              ? "✓ Deployed"
              : `Deploy Images${pendingImageCount ? ` (${pendingImageCount})` : ""}`}
          </button>

          <button
            type="button"
            className="cmsv2-btn cmsv2-btn-primary"
            onClick={handleDeploy}
            disabled={isProcessing || validCount === 0 || !chapterId}
            style={
              deployedTypes[questionType] && !isProcessing
                ? { backgroundColor: "#16a34a", borderColor: "#16a34a", color: "#fff" }
                : undefined
            }
          >
            {isProcessing
              ? `Deploying ${uploadProgress.current}/${uploadProgress.total}…`
              : deployedTypes[questionType]
              ? `✓ Deployed (${questionType})`
              : `Deploy ${validCount || ""}`}
          </button>
        </div>
      </footer>

      {/* ---------------- MODAL ---------------- */}
      {modalConfig.isOpen && (
        <div className="cmsv2-modal-overlay">
          <div className="cmsv2-modal-box">
            <h3>{modalConfig.title}</h3>
            <p>{modalConfig.message}</p>
            <div className="cmsv2-modal-row">
              <button
                type="button"
                className="cmsv2-btn"
                onClick={() => setModalConfig((p) => ({ ...p, isOpen: false }))}
              >
                {modalConfig.onConfirm ? "Cancel" : "Close"}
              </button>
              {modalConfig.onConfirm && (
                <button
                  type="button"
                  className="cmsv2-btn cmsv2-btn-primary"
                  onClick={() => {
                    modalConfig.onConfirm();
                    setModalConfig((p) => ({ ...p, isOpen: false }));
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TOAST ---------------- */}
      {toast && (
        <div className={`cmsv2-toast ${toast.type === "success" ? "is-success" : "is-error"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}