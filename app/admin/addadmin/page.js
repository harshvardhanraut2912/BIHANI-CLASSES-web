"use client";

import { useState } from "react";
import "./addadmin.css";

export default function AddAdminPage() {
  /* ===========================
     STAGE 1 — SECURITY KEY GATE
     Nothing below this loads/renders until the server confirms the
     key matches process.env.ADMIN_PASSWORD_KEY. The key is checked
     fresh on the server every time (see route.js) — this client-side
     "unlocked" flag only controls what's rendered, it is NOT what
     actually protects the create step.
  =========================== */

  const [securityKey, setSecurityKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  async function handleVerifyKey(e) {
    e.preventDefault();
    if (!securityKey || verifying) return;

    setVerifying(true);
    setVerifyError("");

    try {
      const response = await fetch("/api/admin/addadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "verify", key: securityKey }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Invalid security key.");
      }

      setUnlocked(true);
    } catch (err) {
      console.error("Security key verification failed:", err);
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  /* ===========================
     STAGE 2 — CREATE NEW ADMIN
     Only reachable once `unlocked` is true. The security key the
     admin already typed is resent silently with this request too,
     because the server route re-validates it independently on every
     call — the create endpoint never trusts "unlocked" by itself.
  =========================== */

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [assignedRole, setAssignedRole] = useState("admin");

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");

  function generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let out = "";
    for (let i = 0; i < 14; i++) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setPassword(out);
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    if (creating) return;

    setCreating(true);
    setCreateError("");
    setCreateSuccess("");

    try {
      const response = await fetch("/api/admin/addadmin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "create",
          key: securityKey,
          email: email.trim(),
          password,
          assigned_role: assignedRole,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to create admin.");
      }

      setCreateSuccess(`Admin account created for ${json.admin.email}.`);
      setEmail("");
      setPassword("");
      setAssignedRole("admin");
    } catch (err) {
      console.error("Create admin failed:", err);
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  /* ===========================
     JSX
  =========================== */

  if (!unlocked) {
    return (
      <div className="addadmin-page">
        <div className="lockCard">
          <div className="lockIcon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="white" strokeWidth="1.6" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>

          <h1>Restricted Access</h1>
          <p>Enter the security key to reach the Add Admin panel.</p>

          <form onSubmit={handleVerifyKey}>
            <input
              type="password"
              className="lockInput"
              placeholder="Security key"
              value={securityKey}
              onChange={(e) => setSecurityKey(e.target.value)}
              autoFocus
            />

            <button type="submit" className="lockSubmitBtn" disabled={verifying}>
              {verifying ? "Verifying..." : "Unlock"}
            </button>
          </form>

          {verifyError && <p className="lockError">{verifyError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="addadmin-page">
      <div className="formCard">
        <div className="formHeader">
          <h1>Add New Admin</h1>
          <p>This creates a new row in <code>admin_users</code>.</p>
        </div>

        <form onSubmit={handleCreateAdmin} className="addAdminForm">
          <label className="fieldLabel">
            Email
            <input
              type="email"
              className="formInput"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="fieldLabel">
            Password
            <div className="passwordRow">
              <input
                type="text"
                className="formInput"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="generateBtn"
                onClick={generatePassword}
              >
                Generate
              </button>
            </div>
          </label>

          <label className="fieldLabel">
            Assigned Role
            <select
              className="formInput"
              value={assignedRole}
              onChange={(e) => setAssignedRole(e.target.value)}
            >
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
              <option value="moderator">moderator</option>
            </select>
          </label>

          <button type="submit" className="createSubmitBtn" disabled={creating}>
            {creating ? "Creating..." : "Create Admin"}
          </button>

          {createError && <p className="formError">{createError}</p>}
          {createSuccess && <p className="formSuccess">{createSuccess}</p>}
        </form>
      </div>
    </div>
  );
}