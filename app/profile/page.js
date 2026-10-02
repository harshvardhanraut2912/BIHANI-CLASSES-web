"use client";


import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Script from "next/script"; // 🟢 ADD THIS NEXT.JS SCRIPT UTILITY IMPORT
import "./profile.css";

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

  return (
    <div className="pf">
      {/* TOP BAR — Y N Classes brand mark + back / logout */}
      <header className="pf-topbar">
        <a href="/" className="pf-brand">
          <span className="pf-brand-logo">
            <img src="/images/other_images/ynclasses-logo.png" alt="Y N Classes Logo" />
          </span>
          <span className="pf-brand-text">Y N CLASSES</span>
        </a>
        <a href="/dashboard" className="pf-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="pf-back-label">Back to Dashboard</span>
        </a>
        <button className="pf-logout" onClick={handleLogout}>Log Out</button>
      </header>

      {/* IDENTITY HERO */}
      <section className="pf-hero">
        <div className="pf-avatar">
          {avatarUrl ? <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" /> : userInitial}
        </div>
        <div className="pf-hero-text">
          <h1>{formData.username || "Your Profile"}</h1>
          <p>{formData.email}</p>
        </div>
      </section>

      {/* FORM */}
      <main className="pf-card">
        <div className="pf-panel">
          <div className="pf-section-label">Profile Details</div>

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
                  {["MHT-CET 2027", "MHT-CET 2028", "HSC Boards 2027", "HSC Boards 2028"].map((exam) => {
                    const isChecked = formData.targetExams.includes(exam);
                    return (
                      <label key={exam} className={`pf-tag ${isChecked ? "is-checked" : ""}`}>
                        <input
                          type="checkbox"
                          value={exam}
                          checked={isChecked}
                          onChange={() => handleCheckboxChange(exam)}
                        />
                        {exam}
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
  );
}
