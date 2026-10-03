"use client";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Script from "next/script"; // 🟢 ADD THIS NEXT.JS SCRIPT UTILITY IMPORT
import HomeNavbar from "@/components/home/HomeNavbar";
import { fontVars } from "@/components/site/fonts";
import "./profile.css";


// ---- Chemistry-theme helpers (presentation only, no logic) ----------------
const EXAM_OPTIONS = ["MHT-CET 2027", "MHT-CET 2028", "HSC Boards 2027", "HSC Boards 2028"];

// Periodic-table style tile for each milestone: year as "atomic number",
// Ce = CET, Hs = HSC (both real element symbols).
function examTile(exam) {
  return { num: exam.slice(-2), sym: exam.startsWith("MHT") ? "Ce" : "Hs" };
}

const BUBBLES = [
  { x: "52%", s: 7, d: "7.2s", dl: "0s" },
  { x: "64%", s: 5, d: "8.4s", dl: "-3s" },
  { x: "76%", s: 9, d: "9.1s", dl: "-5s" },
  { x: "88%", s: 6, d: "7.8s", dl: "-2s" },
  { x: "95%", s: 5, d: "8.8s", dl: "-6s" },
];

function Glyph({ name }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "back") return (<svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>);
  if (name === "logout") return (<svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>);
  if (name === "flask") return (<svg {...p}><path d="M9.5 3h5M10.5 3v6L4.8 18.6A2 2 0 0 0 6.5 21.5h11a2 2 0 0 0 1.7-2.9L13.5 9V3" /><path d="M7.4 15.2h9.2" /></svg>);
  return null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isFetching, setIsFetching] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    mobile: "",
    currentClass: "",
    targetExams: [],
  });

  // 1. Initial Data Fetch & Security Gate
  useEffect(() => {
    const bootProfile = async () => {
      try {
        const { data: { session }, error: authError } = await supabase.auth.getSession();
        
        if (authError || !session) {
          router.push("/login");
          return;
        }
        
        setUser(session.user);
        setFormData((prev) => ({ ...prev, email: session.user.email }));

        const { data: record, error: dbError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (record && !dbError) {
          setFormData((prev) => ({
            ...prev,
            username: record.username || "",
            mobile: record.mobile_number || "",
            currentClass: record.current_class || "",
            targetExams: Array.isArray(record.target_exams) ? record.target_exams : [],
          }));
        }
      } catch (err) {
        console.error("Profile Boot Error:", err);
      } finally {
        // 🟢 Guarantee that the loading screen goes away, even if there's an error
        setIsFetching(false);
      }
    };

    bootProfile();
  }, [router]);

  // 2. Handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (examValue) => {
    setFormData((prev) => {
      const isSelected = prev.targetExams.includes(examValue);
      return {
        ...prev,
        targetExams: isSelected
          ? prev.targetExams.filter((t) => t !== examValue)
          : [...prev.targetExams, examValue],
      };
    });
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (formData.targetExams.length === 0) {
      alert("Please tick mark at least one Target Milestone.");
      return;
    }

    setIsSaving(true);

    try {
      // 💥 PURE STATELESS UPDATE: No local storage conflicts
      const { error } = await supabase.from("profiles")
        .update({
          username: formData.username.trim(),
          mobile_number: formData.mobile.trim(),
          current_class: formData.currentClass,
          target_exams: formData.targetExams,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
      alert("Profile changes successfully synced into database ledger!");
    } catch (err) {
      console.error(err);
      alert("An error occurred while saving profile metrics data. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    document.cookie = "cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut();
    window.location.href = '/'; 
  };

  // 🟢 ORIGINAL LOTTIE ANIMATION LOADER FOR NEXT.JS (Bypasses React JSX validation)
  if (isFetching) {
    return (
      <>
        {/* Streams your official unpkg player compilation script directly into the document stack */}
        <Script 
          src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js" 
          strategy="beforeInteractive"
        />
        
        <div className="pf-loading">
          <div 
            dangerouslySetInnerHTML={{ 
              __html: `<lottie-player src="/loading.json" background="transparent" speed="1" style="width: 120px; height: 120px;" loop autoplay></lottie-player>` 
            }} 
          />
        </div>
      </>
    );
  }

  const userInitial = user?.email?.charAt(0).toUpperCase();
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  // Display-only: how many of the four editable profile fields are filled.
  const filledCount = [
    formData.username.trim(),
    formData.mobile.trim(),
    formData.currentClass,
    formData.targetExams.length > 0,
  ].filter(Boolean).length;

  return (
    <div className={`pf ${fontVars}`}>
      {/* SAME NAVBAR AS THE HOMEPAGE */}
      <HomeNavbar fontClass={fontVars} />

      <div className="pf-body">
        {/* IDENTITY HERO */}
        <section className="pf-hero">
          <div className="pf-hero-card">
            <div className="pf-decor" aria-hidden="true">
              <svg className="pf-ring" viewBox="0 0 100 100" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinejoin="round">
                <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
                <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" strokeWidth="1.4" />
                <circle cx="50" cy="50" r="9" />
              </svg>
              <svg className="pf-mol" viewBox="0 0 160 90" fill="none" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round">
                <path d="M20 62 52 40 88 58 124 30 146 48" />
                <circle cx="20" cy="62" r="6" fill="#12a0ee" stroke="none" />
                <circle cx="52" cy="40" r="8" fill="#ffffff" fillOpacity="0.85" stroke="none" />
                <circle cx="88" cy="58" r="6" fill="#12a0ee" stroke="none" />
                <circle cx="124" cy="30" r="8" fill="#ffffff" fillOpacity="0.85" stroke="none" />
                <circle cx="146" cy="48" r="5" fill="#e0242c" stroke="none" />
              </svg>
              {BUBBLES.map((b, i) => (
                <span key={i} className="pf-bubble" style={{ left: b.x, width: b.s, height: b.s, animationDuration: b.d, animationDelay: b.dl }} />
              ))}
            </div>

            <div className="pf-hero-top">
              <div className="pf-avatar-wrap">
                <div className="pf-avatar">
                  {avatarUrl ? <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" /> : userInitial}
                </div>
              </div>
              <div className="pf-hero-text">
                <span className="pf-eyebrow">Student Profile</span>
                <h1>{formData.username || "Your Profile"}</h1>
                <p>{formData.email}</p>
              </div>
            </div>

            <div className="pf-hero-bottom">
              <div className="pf-meter" aria-label={`Profile completeness ${filledCount} of 4`}>
                <div className="pf-meter-head">
                  <span>Profile completeness</span>
                  <b>{filledCount}/4</b>
                </div>
                <div className="pf-meter-bar">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`pf-meter-seg ${i < filledCount ? "is-on" : ""}`} />
                  ))}
                </div>
              </div>
              <div className="pf-hero-actions">
                <a href="/dashboard" className="pf-back">
                  <Glyph name="back" />
                  <span className="pf-back-label">Back to Dashboard</span>
                </a>
                <button type="button" className="pf-logout" onClick={handleLogout}>
                  <Glyph name="logout" />
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FORM */}
        <main className="pf-card">
          <div className="pf-panel">
            <div className="pf-panel-head">
              <span className="pf-panel-icon"><Glyph name="flask" /></span>
              <div>
                <div className="pf-section-label">Profile Details</div>
                <p className="pf-section-sub">Keep these up to date so we can send you the right exam &amp; batch updates.</p>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate}>
              <div className="pf-grid">

                <div className="pf-field pf-span-2">
                  <label className="pf-label" htmlFor="usernameInput">
                    Name <span className="pf-req">*</span>
                  </label>
                  <input
                    type="text"
                    id="usernameInput"
                    name="username"
                    className="pf-input"
                    placeholder="Enter your full name"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="pf-field">
                  <label className="pf-label" htmlFor="emailInput">
                    Email <span className="pf-verified">✓</span>
                  </label>
                  <input
                    type="email"
                    id="emailInput"
                    className="pf-input"
                    value={formData.email}
                    disabled
                  />
                </div>

                <div className="pf-field">
                  <label className="pf-label" htmlFor="phoneInput">
                    Mobile <span className="pf-req">*</span><span className="pf-verified">✓</span>
                  </label>
                  <div className="pf-phone-wrap">
                    <div className="pf-phone-prefix">
                      <img src="https://flagcdn.com/w20/in.png" alt="India Flag" />
                      <span>+91</span>
                    </div>
                    <input
                      type="tel"
                      id="phoneInput"
                      name="mobile"
                      className="pf-input pf-phone-input"
                      placeholder="9876543210"
                      pattern="[6-9][0-9]{9}"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="pf-field pf-span-2">
                  <label className="pf-label" htmlFor="classSelect">
                    What are you looking for — Boards, MHT-CET, Engineering <span className="pf-req">*</span>
                  </label>
                  <select
                    id="classSelect"
                    name="currentClass"
                    className="pf-select"
                    value={formData.currentClass}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="" disabled>Choose your current class standard...</option>
                    <option value="11th">11th Standard</option>
                    <option value="12th">12th Standard</option>
                    <option value="Dropper">Dropper / Repeater</option>
                  </select>
                </div>

                <div className="pf-field pf-span-2">
                  <label className="pf-label">
                    Target Milestones (Select Multiple) <span className="pf-req">*</span>
                  </label>
                  <div className="pf-tag-grid">
                    {EXAM_OPTIONS.map((exam) => {
                      const isChecked = formData.targetExams.includes(exam);
                      const tile = examTile(exam);
                      return (
                        <label key={exam} className={`pf-tag ${isChecked ? "is-checked" : ""}`}>
                          <input
                            type="checkbox"
                            value={exam}
                            checked={isChecked}
                            onChange={() => handleCheckboxChange(exam)}
                          />
                          <span className="pf-tile"><small>{tile.num}</small>{tile.sym}</span>
                          <span className="pf-tag-label">{exam}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pf-field pf-span-2 pf-actions">
                  <button type="submit" className="pf-save" disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>

              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
