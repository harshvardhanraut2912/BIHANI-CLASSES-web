"use client";

import { useEffect, useMemo, useState, memo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import "./admininquiries.css";

const PAGE_SIZE = 25;

// Browser-side realtime listener client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function normalizeKey(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

/* ===========================
   MEMOIZED INQUIRY ROW
=========================== */
const InquiryRow = memo(function InquiryRow({ inquiry, matchedProfile, onOpen, onMarkAsRead }) {
  const isRead = inquiry.status?.toLowerCase() === "read";

  return (
    <tr className="studentRow" onClick={() => onOpen(inquiry)}>
      <td>
        <div className="nameCellRow">
          <div className="nameCell">
            <strong title={inquiry.name}>{inquiry.name}</strong>
            <span title={inquiry.email}>{inquiry.email}</span>
          </div>
        </div>
      </td>

      <td>{inquiry.mobile || "-"}</td>

      <td>
        <div className="messageTruncate" title={inquiry.message}>
          {inquiry.message}
        </div>
      </td>

      <td>{formatDate(inquiry.created_at)}</td>

      <td>
        {matchedProfile ? (
          matchedProfile.is_online ? (
            <span className="online"><span className="dot" /> Online</span>
          ) : (
            <span className="offline"><span className="dot" /> Offline</span>
          )
        ) : (
          <span className="muted">No Account</span>
        )}
      </td>

      <td>
        <span className={isRead ? "active" : "inactive"}>
          <span className="dot" /> {inquiry.status || "Unread"}
        </span>
      </td>

      <td onClick={(e) => e.stopPropagation()}>
        {!isRead ? (
          <button
            type="button"
            className="actionPickBtn"
            onClick={() => onMarkAsRead(inquiry.id)}
          >
            Received
          </button>
        ) : (
          <span className="checkmarkText">✓ Handled</span>
        )}
      </td>
    </tr>
  );
});

/* ===========================
   MAIN INQUIRIES PAGE
=========================== */
export default function AdminInquiriesPage() {
  const [inquiries, setInquiries] = useState([]);
  const [profilesMap, setProfilesMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedInquiry, setSelectedInquiry] = useState(null);

  useEffect(() => {
    loadInquiriesDashboard();
  }, []);

  async function loadInquiriesDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admin/inquiries");
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to load inquiries.");
      }

      setInquiries(json.inquiries || []);
      
      const pMap = {};
      if (json.profiles) {
        json.profiles.forEach((p) => {
          if (p.email) pMap[normalizeKey(p.email)] = p;
        });
      }
      setProfilesMap(pMap);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ===========================
     REALTIME CHANNELS
  =========================== */
  useEffect(() => {
    const inquiriesChannel = supabase
      .channel("realtime-inquiries")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "contact_inquiries" },
        (payload) => {
          setInquiries((prev) =>
            prev.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } : item))
          );
          setSelectedInquiry((prev) =>
            prev && prev.id === payload.new.id ? { ...prev, ...payload.new } : prev
          );
        }
      )
      .subscribe();

    const profilesChannel = supabase
      .channel("realtime-profiles-sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          if (payload.new.email) {
            setProfilesMap((prev) => ({
              ...prev,
              [normalizeKey(payload.new.email)]: payload.new,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(inquiriesChannel);
      supabase.removeChannel(profilesChannel);
    };
  }, []);

  const handleMarkAsRead = useCallback(async (id) => {
    try {
      const response = await fetch("/api/admin/inquiries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "Read" }),
      });

      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to update status.");

      setInquiries((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: "Read" } : item))
      );
      setSelectedInquiry((prev) => (prev && prev.id === id ? { ...prev, status: "Read" } : prev));
    } catch (err) {
      console.error(err);
    }
  }, []);

  /* ===========================
     SEARCH & FILTERING
  =========================== */
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setVisibleCount(PAGE_SIZE);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredInquiries = useMemo(() => {
    if (!search.trim()) return inquiries;
    const keyword = search.toLowerCase();

    return inquiries.filter((item) => {
      return (
        item.name?.toLowerCase().includes(keyword) ||
        item.email?.toLowerCase().includes(keyword) ||
        item.mobile?.toString().includes(keyword) ||
        item.message?.toLowerCase().includes(keyword)
      );
    });
  }, [inquiries, search]);

  const visibleInquiries = useMemo(
    () => filteredInquiries.slice(0, visibleCount),
    [filteredInquiries, visibleCount]
  );

  const unreadCount = useMemo(
    () => filteredInquiries.filter((i) => i.status?.toLowerCase() !== "read").length,
    [filteredInquiries]
  );

  const currentMatchedProfile = useMemo(() => {
    if (!selectedInquiry) return null;
    return profilesMap[normalizeKey(selectedInquiry.email)] || null;
  }, [selectedInquiry, profilesMap]);

  return (
    <>
      <div className={`admin-page ${selectedInquiry ? "blur-page" : ""}`}>
        <div className="header">
          <div className="header-titles">
            <div className="header-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2Zm0 4l-8 5-8-5V6l8 5 8-5v2Z" fill="white" />
              </svg>
            </div>
            <div>
              <h1>Contact Inquiries</h1>
              <p>Manage submissions and verify user presence profiles</p>
            </div>
          </div>

          <div className="header-right">
            <div className="searchBox-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="searchBox"
                placeholder="Search name, email, or message contents..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            {!loading && !error && (
              <div className="statRow">
                <span className="statPill total">
                  <span className="dot" /> <b>{filteredInquiries.length}</b> Inquiries
                </span>
                <span className="statPill inactive">
                  <span className="dot" /> <b>{unreadCount}</b> Unread
                </span>
              </div>
            )}
          </div>
        </div>

        {loading && (
          <div className="message">
            <div className="spinner" />
            Loading system inquiries...
          </div>
        )}

        {error && <div className="error">{error}</div>}

        {!loading && !error && (
          <div className="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Mobile</th>
                  <th>Message Snippet</th>
                  <th>Submitted At</th>
                  <th>User Status</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInquiries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="emptyRow">
                      No inquiries found.
                    </td>
                  </tr>
                )}
                {visibleInquiries.map((inquiry) => (
                  <InquiryRow
                    key={inquiry.id}
                    inquiry={inquiry}
                    matchedProfile={profilesMap[normalizeKey(inquiry.email)]}
                    onOpen={setSelectedInquiry}
                    onMarkAsRead={handleMarkAsRead}
                  />
                ))}
              </tbody>
            </table>

            {visibleCount < filteredInquiries.length && (
              <div className="loadMoreWrap">
                <button
                  className="loadMoreBtn"
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                >
                  Load more ({filteredInquiries.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DETAILED INSIGHT MODAL */}
      {selectedInquiry && (
        <div className="modalOverlay" onClick={() => setSelectedInquiry(null)}>
          <div className="studentModal" onClick={(e) => e.stopPropagation()}>
            <button className="closeBtn" onClick={() => setSelectedInquiry(null)} aria-label="Close">×</button>

            <div className="modalTop">
              <div>
                <h2>Inquiry Profile: {selectedInquiry.name}</h2>
                <div className="modalStatus">
                  <span className={selectedInquiry.status?.toLowerCase() === "read" ? "active" : "inactive"}>
                    <span className="dot" /> Status: {selectedInquiry.status || "Unread"}
                  </span>
                  {selectedInquiry.status?.toLowerCase() !== "read" && (
                    <button
                      type="button"
                      className="editProfileBtn"
                      onClick={() => handleMarkAsRead(selectedInquiry.id)}
                    >
                      Mark Received
                    </button>
                  )}
                </div>

                <div className="modalInfoGrid">
                  <div>
                    <div className="infoLabel">Email Address</div>
                    <div className="infoValue">{selectedInquiry.email}</div>
                  </div>
                  <div>
                    <div className="infoLabel">Contact Phone</div>
                    <div className="infoValue">{selectedInquiry.mobile || "-"}</div>
                  </div>
                  <div>
                    <div className="infoLabel">Created Timestamp</div>
                    <div className="infoValue">{formatDate(selectedInquiry.created_at)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modalBody queryLayoutGrid">
              <div className="section">
                <h3>Message Text</h3>
                <div className="messageBox">
                  <p>{selectedInquiry.message}</p>
                </div>
              </div>

              <div className="section">
                <h3>Account Verification</h3>
                {currentMatchedProfile ? (
                  <div className="profileVerifiedCard">
                    <div className="profileVerifyHeader">
                      <strong>{currentMatchedProfile.full_name || "User Account Found"}</strong>
                      {currentMatchedProfile.is_online ? (
                        <span className="online"><span className="dot" /> Online Now</span>
                      ) : (
                        <span className="offline"><span className="dot" /> Offline</span>
                      )}
                    </div>
                    <div className="profileExtendedLines">
                      <p><strong>Username:</strong> {currentMatchedProfile.username || "-"}</p>
                      <p><strong>Registered Class:</strong> {currentMatchedProfile.current_class || "-"}</p>
                      <p><strong>Active Session ID:</strong> {currentMatchedProfile.current_session_id ? `Session ${currentMatchedProfile.current_session_id}` : "None"}</p>
                      <p><strong>Exam Progress:</strong> {currentMatchedProfile.is_exam_active ? "🟢 Processing Active Exam" : "🔴 Standby"}</p>
                    </div>
                  </div>
                ) : (
                  <p className="empty-note">No linked registration account matched to this inquiry's email.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}