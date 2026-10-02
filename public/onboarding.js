// ===================================================
// Profile Onboarding Banner — YN Classes theme
// Built the SAME way as cookie-consent.js: self-contained,
// injects its own <style>, bottom-right slide-up card.
// Include AFTER auth.js is loaded, e.g.:
//   <script src="/auth.js"></script>
//   <script src="/onboarding.js"></script>
//
// Behavior:
//   - Runs a silent background check first: does this logged-in
//     student's profiles row have every column WE actually collect
//     (full_name, mobile_number, current_class, target_exams)?
//     Other columns (username, avatar_url, email, current_session_id,
//     is_online, is_exam_active, last_seen_at, updated_at) are system/
//     internal fields onboarding never touches and never checks.
//   - If everything required is already filled -> does nothing at
//     all, on any page, for the rest of the session.
//   - If something's missing -> shows a small bottom-right card
//     (same slot/style family as the cookie banner) asking ONLY for
//     the missing fields, one at a time, and tells the student they
//     can update these anytime from their Profile page.
//   - Re-checks on every page load with a live session, so it comes
//     back on a later login too if something is still missing.
// ===================================================

(function () {
  const REQUIRED_FIELDS = ["full_name", "mobile_number", "current_class", "target_exams"];
  const TARGET_EXAM_OPTIONS = ["MHT-CET 2027", "MHT-CET 2028", "HSC Boards 2027", "HSC Boards 2028"];

  function isMissing(record) {
    return (
      !record.full_name?.trim() ||
      !record.mobile_number?.trim() ||
      !record.current_class?.trim() ||
      !Array.isArray(record.target_exams) ||
      record.target_exams.length === 0
    );
  }

  function firstMissingField(record) {
    if (!record.full_name?.trim()) return "full_name";
    if (!record.mobile_number?.trim()) return "mobile_number";
    if (!record.current_class?.trim()) return "current_class";
    return "target_exams";
  }

  function injectStyles() {
    if (document.getElementById("ob-consent-styles")) return;
    const style = document.createElement("style");
    style.id = "ob-consent-styles";
    style.textContent = `
      @keyframes ob-slide-up {
        0%   { opacity: 0; transform: translateY(40px) scale(0.9); }
        60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
        100% { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes ob-slide-down {
        0%   { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(24px) scale(0.97); }
      }
      @keyframes ob-card-glow {
        0%, 100% { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 0 rgba(29, 127, 214, 0.45); }
        50%      { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 7px rgba(29, 127, 214, 0); }
      }
      @keyframes ob-dot-ping {
        0%   { transform: scale(1); opacity: 1; }
        75%, 100% { transform: scale(2.2); opacity: 0; }
      }
      @keyframes ob-backdrop-in { 0% { opacity: 0; } 100% { opacity: 1; } }

      .ob-backdrop {
        position: fixed;
        inset: 0;
        z-index: 8999;
        pointer-events: none;
        background: radial-gradient(circle at bottom right, rgba(6, 49, 92, 0.16), rgba(6, 49, 92, 0) 55%);
        animation: ob-backdrop-in 0.5s ease-out;
      }

      .ob-banner {
        position: fixed;
        right: 18px;
        bottom: 18px;
        max-width: 400px;
        width: calc(100vw - 32px);
        max-height: calc(100vh - 32px);
        overflow: auto;
        background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
        border: 1.5px solid rgba(29, 127, 214, 0.4);
        border-radius: 20px;
        padding: 24px 26px 22px;
        box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08);
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
        z-index: 9000;
        color: #0f1f2e;
        animation: ob-slide-up 0.55s cubic-bezier(0.22, 1, 0.36, 1), ob-card-glow 2.6s ease-in-out 0.6s 3;
      }
      .ob-banner.ob-leaving { animation: ob-slide-down 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; }
      .ob-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .ob-icon {
        position: relative;
        flex: none; width: 40px; height: 40px; border-radius: 12px;
        background: linear-gradient(135deg, #1d7fd6, #0b4f8a);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 6px 16px rgba(11, 79, 138, 0.35);
      }
      .ob-icon svg { width: 21px; height: 21px; }
      .ob-icon-dot {
        position: absolute; top: -3px; right: -3px; width: 10px; height: 10px;
        border-radius: 50%; background: #ff5757; border: 2px solid #fff;
      }
      .ob-icon-dot::after {
        content: ''; position: absolute; inset: -2px; border-radius: 50%;
        background: #ff5757; animation: ob-dot-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .ob-banner h3 { margin: 0; font-size: 18px; font-weight: 800; color: #06315c; letter-spacing: -0.01em; }
      .ob-banner p { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #5c6b7a; }
      .ob-progress { display: flex; gap: 6px; margin-bottom: 14px; }
      .ob-dot { flex: 1; height: 4px; border-radius: 999px; background: #e2e8f0; }
      .ob-dot.is-active { background: #1d7fd6; }
      .ob-dot.is-done { background: #0b4f8a; }
      .ob-input {
        width: 100%; box-sizing: border-box; background: #f7f9fc;
        border: 1px solid #dbe6f0; border-radius: 10px; padding: 12px 14px;
        font-size: 15px; font-weight: 500; color: #0f1f2e; outline: none;
        margin-bottom: 4px; font-family: inherit;
      }
      .ob-input:focus { border-color: #1d7fd6; box-shadow: 0 0 0 3px rgba(29,127,214,0.12); }
      .ob-phone-wrap { position: relative; display: flex; align-items: center; }
      .ob-phone-prefix {
        position: absolute; left: 12px; display: flex; align-items: center; gap: 6px;
        font-size: 13px; font-weight: 700; color: #0f1f2e;
        border-right: 1px solid #dbe6f0; padding-right: 8px; height: 18px; user-select: none;
      }
      .ob-phone-prefix img { width: 16px; border-radius: 2px; }
      .ob-input.ob-phone-input { padding-left: 68px; }
      .ob-choice-grid { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
      .ob-choice {
        width: 100%; text-align: left; background: #f7f9fc; border: 1px solid #dbe6f0;
        border-radius: 10px; padding: 11px 14px; font-size: 13.5px; font-weight: 600;
        color: #0f1f2e; cursor: pointer; font-family: inherit; transition: all 0.15s ease;
      }
      .ob-choice:hover { border-color: #1d7fd6; }
      .ob-choice.is-checked { background: #eaf3fc; border-color: #0b4f8a; color: #0b4f8a; font-weight: 700; }
      .ob-error {
        margin-top: 10px; background: #fdecea; border: 1px solid #ef4444; color: #b42318;
        font-size: 12px; font-weight: 600; padding: 8px 11px; border-radius: 8px;
      }
      .ob-note { margin-top: 12px; font-size: 11.5px; color: #8494a5; line-height: 1.5; }
      .ob-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 10px; }
      .ob-btn-back { background: transparent; border: none; color: #5c6b7a; font-size: 13px; font-weight: 700; cursor: pointer; padding: 8px 4px; font-family: inherit; }
      .ob-btn-back:hover { color: #0f1f2e; }
      .ob-btn-next {
        background: linear-gradient(135deg, #1d7fd6, #0b4f8a); color: #fff; border: none;
        padding: 11px 24px; border-radius: 999px; font-size: 13.5px; font-weight: 700;
        cursor: pointer; font-family: inherit; margin-left: auto;
        box-shadow: 0 6px 16px rgba(11, 79, 138, 0.28);
      }
      .ob-btn-next:hover:not(:disabled) { transform: translateY(-1px); }
      .ob-btn-next:disabled { opacity: 0.7; cursor: not-allowed; }
      [data-theme="dark"] .ob-banner { background: linear-gradient(180deg, #0e1a2b 0%, #0a1522 100%); border-color: rgba(29,127,214,0.25); }
      [data-theme="dark"] .ob-banner h3 { color: #eaf2fb; }
      [data-theme="dark"] .ob-banner p, [data-theme="dark"] .ob-note { color: #93a3b8; }
      [data-theme="dark"] .ob-input, [data-theme="dark"] .ob-choice { background: #16233a; border-color: rgba(29,127,214,0.25); color: #eaf2fb; }
      @media (max-width: 420px) { .ob-banner { right: 8px; bottom: 8px; padding: 18px 18px 16px; } }
    `;
    document.head.appendChild(style);
  }

  function renderBanner(client, userId, record) {
    injectStyles();

    const steps = REQUIRED_FIELDS.slice();
    let stepIndex = steps.indexOf(firstMissingField(record));
    const formData = {
      full_name: record.full_name || "",
      mobile_number: record.mobile_number || "",
      current_class: record.current_class || "",
      target_exams: Array.isArray(record.target_exams) ? record.target_exams : [],
    };

    const backdrop = document.createElement("div");
    backdrop.className = "ob-backdrop";
    backdrop.setAttribute("data-testid", "yn-onboarding-backdrop");
    document.body.appendChild(backdrop);

    const el = document.createElement("div");
    el.className = "ob-banner";
    el.setAttribute("data-testid", "yn-onboarding-banner");
    document.body.appendChild(el);

    function removeAll() {
      backdrop.style.transition = "opacity 0.28s ease";
      backdrop.style.opacity = "0";
      setTimeout(() => backdrop.remove(), 280);
      el.classList.add("ob-leaving");
      setTimeout(() => el.remove(), 280);
    }

    function validateStep() {
      const step = steps[stepIndex];
      if (step === "full_name" && !formData.full_name.trim()) return "Please enter your name.";
      if (step === "mobile_number" && !/^[6-9][0-9]{9}$/.test(formData.mobile_number.trim())) return "Enter a valid 10-digit mobile number.";
      if (step === "current_class" && !formData.current_class) return "Please choose one option.";
      if (step === "target_exams" && formData.target_exams.length === 0) return "Select at least one target milestone.";
      return "";
    }

    async function handleNext(errorEl, nextBtn) {
      const err = validateStep();
      if (err) { errorEl.textContent = err; errorEl.style.display = "block"; return; }
      errorEl.style.display = "none";

      if (stepIndex < steps.length - 1) { stepIndex++; draw(); return; }

      nextBtn.disabled = true;
      nextBtn.textContent = "Saving…";
      try {
        const { error } = await client
          .from("profiles")
          .update({
            full_name: formData.full_name.trim(),
            mobile_number: formData.mobile_number.trim(),
            current_class: formData.current_class,
            target_exams: formData.target_exams,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);
        if (error) throw error;
        removeAll();
      } catch (e) {
        console.error(e);
        errorEl.textContent = "Could not save right now. Please try again.";
        errorEl.style.display = "block";
        nextBtn.disabled = false;
        nextBtn.textContent = stepIndex === steps.length - 1 ? "Finish" : "Next";
      }
    }

    function draw() {
      const step = steps[stepIndex];
      const isLastStep = stepIndex === steps.length - 1;

      let fieldHtml = "";
      if (step === "full_name") {
        fieldHtml = `
          <h3>What's your name?</h3>
          <p>This is how we'll address you across the portal.</p>
          <input type="text" class="ob-input" id="ob-field" placeholder="Enter your full name" value="${formData.full_name.replace(/"/g, "&quot;")}" autofocus />`;
      } else if (step === "mobile_number") {
        fieldHtml = `
          <h3>Your mobile number?</h3>
          <p>We'll use this for important exam & batch updates.</p>
          <div class="ob-phone-wrap">
            <span class="ob-phone-prefix"><img src="https://flagcdn.com/w20/in.png" alt="India Flag" /> +91</span>
            <input type="tel" class="ob-input ob-phone-input" id="ob-field" placeholder="9876543210" value="${formData.mobile_number.replace(/"/g, "&quot;")}" autofocus />
          </div>`;
      } else if (step === "current_class") {
        fieldHtml = `
          <h3>What are you looking for?</h3>
          <p>Boards, MHT-CET, or Engineering prep.</p>
          <div class="ob-choice-grid" id="ob-class-grid">
            ${[["11th", "11th Standard"], ["12th", "12th Standard"], ["Dropper", "Dropper / Repeater"]]
              .map(([v, l]) => `<button type="button" class="ob-choice ${formData.current_class === v ? "is-checked" : ""}" data-value="${v}">${l}</button>`)
              .join("")}
          </div>`;
      } else {
        fieldHtml = `
          <h3>Target milestones?</h3>
          <p>Select all that apply.</p>
          <div class="ob-choice-grid" id="ob-exam-grid">
            ${TARGET_EXAM_OPTIONS.map((exam) => `<button type="button" class="ob-choice ${formData.target_exams.includes(exam) ? "is-checked" : ""}" data-value="${exam}">${exam}</button>`).join("")}
          </div>`;
      }

      el.innerHTML = `
        <div class="ob-progress">
          ${steps.map((s, i) => `<span class="ob-dot ${i === stepIndex ? "is-active" : i < stepIndex ? "is-done" : ""}"></span>`).join("")}
        </div>
        <div class="ob-top">
          <div class="ob-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="8" r="4"></circle>
              <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"></path>
            </svg>
            <span class="ob-icon-dot"></span>
          </div>
        </div>
        ${fieldHtml}
        <div class="ob-error" style="display:none"></div>
        <p class="ob-note">You can always update these later from your Profile page.</p>
        <div class="ob-actions">
          ${stepIndex > 0 ? `<button type="button" class="ob-btn-back" id="ob-back">Back</button>` : "<span></span>"}
          <button type="button" class="ob-btn-next" id="ob-next">${isLastStep ? "Finish" : "Next"}</button>
        </div>
      `;

      const errorEl = el.querySelector(".ob-error");
      const nextBtn = el.querySelector("#ob-next");
      const backBtn = el.querySelector("#ob-back");
      const field = el.querySelector("#ob-field");

      if (field) {
        field.addEventListener("input", (e) => {
          formData[step] = e.target.value;
        });
        field.addEventListener("keydown", (e) => {
          if (e.key === "Enter") handleNext(errorEl, nextBtn);
        });
      }

      const classGrid = el.querySelector("#ob-class-grid");
      if (classGrid) {
        classGrid.querySelectorAll(".ob-choice").forEach((btn) => {
          btn.addEventListener("click", () => { formData.current_class = btn.dataset.value; draw(); });
        });
      }

      const examGrid = el.querySelector("#ob-exam-grid");
      if (examGrid) {
        examGrid.querySelectorAll(".ob-choice").forEach((btn) => {
          btn.addEventListener("click", () => {
            const v = btn.dataset.value;
            const i = formData.target_exams.indexOf(v);
            if (i >= 0) formData.target_exams.splice(i, 1);
            else formData.target_exams.push(v);
            draw();
          });
        });
      }

      if (backBtn) backBtn.addEventListener("click", () => { stepIndex = Math.max(0, stepIndex - 1); draw(); });
      nextBtn.addEventListener("click", () => handleNext(errorEl, nextBtn));
    }

    draw();
  }

  async function checkAndRender() {
    try {
      // classic <script> tags share one global scope, so `supabaseClient`
      // (declared with const in auth.js) is directly readable here as a
      // bare identifier -- it is NOT a property of `window`.
      if (typeof supabaseClient === "undefined") return;

      const { data: { session } } = await supabaseClient.auth.getSession();
      if (!session) return;

      const { data: record, error } = await supabaseClient
        .from("profiles")
        .select("full_name, mobile_number, current_class, target_exams")
        .eq("id", session.user.id)
        .single();

      if (error || !record) return;
      if (!isMissing(record)) return; // everything required is filled -> never fires

      renderBanner(supabaseClient, session.user.id, record);
    } catch (e) {
      console.error("Onboarding check failed:", e);
    }
  }

  document.addEventListener("DOMContentLoaded", checkAndRender);
})();
