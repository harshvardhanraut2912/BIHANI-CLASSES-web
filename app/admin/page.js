"use client";

import { useState, useEffect } from "react";
import styles from "./admin.module.css";

const DEFAULT_BOXES = [
  { name: "CMS", path: "/admin/cms-v2", icon: "https://i.ibb.co/8L4KKVvx/database.png", locked: true },
  
  { name: "Overview", path: "/admin/overview", icon: "https://i.ibb.co/pvMKVvxt/link.png", locked: true },
  { name: "Products Cards", path: "/admin/products", icon: "https://i.ibb.co/MxSmG2f9/layers.png", locked: true },
  { name: "Users", path: "/admin/users", icon: "https://i.ibb.co/9mtqPtTz/conference-call.png", locked: true },
  { name: "Add Exam Questions", path: "/admin/addexamimages-v2", icon: "https://i.ibb.co/jvbhBSK0/images.png", locked: true },
  { name: "Contact Inquiries", path: "/admin/inquiries", icon: "https://i.ibb.co/qL5b0R0C/chat.png", locked: true },
  { name: "Leaderboard", path: "/admin/leaderboard", icon: "https://i.ibb.co/gZdWVKv4/warning-shield.png", locked: true },
  { name: "Error Reports", path: "/admin/reports", icon: "https://i.ibb.co/gZdWVKv4/warning-shield.png", locked: true },
  { name: "App Installs", path: "/admin/app-installs", icon: "https://img.icons8.com/fluency/96/get-app.png", locked: true },
  { name: "Maintenance Mode", path: "/admin/maintenance", icon: "https://img.icons8.com/fluency/96/maintenance.png", locked: true },
  { name: "admin", path: "/admin/addadmin", icon: "https://i.ibb.co/1GrdKjd8/administrator.png", locked: true },
  { name: "Analytics", path: "/admin/analytics", icon: "https://i.ibb.co/0yqKtLD9/combo-chart.png", locked: true },
  { name: "Settings", path: "/admin/settings", icon: "https://i.ibb.co/k2kCK0Ph/settings.png", locked: true },
];



const FALLBACK_ICON = "https://img.icons8.com/fluency/96/link.png";
const STORAGE_KEY = "cetwalle_admin_custom_boxes";

export default function AdminPage() {
  const [customBoxes, setCustomBoxes] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "", link: "" });

  // Load any previously saved custom boxes once the component mounts in the browser
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCustomBoxes(JSON.parse(raw));
    } catch (e) {
      console.error("Could not load saved admin boxes:", e);
    }
  }, []);

  // Keep localStorage in sync whenever custom boxes change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customBoxes));
    } catch (e) {
      console.error("Could not save admin boxes:", e);
    }
  }, [customBoxes]);

  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setForm({ name: "", icon: "", link: "" });
  }

  function handleSave() {
    const name = form.name.trim();
    const link = form.link.trim();
    const icon = form.icon.trim();

    if (!name || !link) {
      alert("Please fill in at least the Box Name and Redirect Page.");
      return;
    }

    setCustomBoxes((prev) => [...prev, { name, path: link, icon: icon || FALLBACK_ICON, locked: false }]);
    closeModal();
  }

  function handleDelete(index) {
    setCustomBoxes((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.body}>
      <header className={styles.adminHeader}>
        <div className={styles.brandLockup}>
          <img
            src="/api/images?path=icon and images/CETWALLE_homepage_logo_image.png"
            alt="CETWALLE Logo"
            className={styles.brandLogoBig}
          />
          <h1 className={styles.brandName}>CETWALLE</h1>
        </div>
        <p className={styles.adminSubtitle}>Admin Control Panel</p>
      </header>

      <section className={styles.shortcutsSection}>
        <div className={styles.shortcutsGrid}>
          {DEFAULT_BOXES.map((box, i) => (
            <ShortcutCard key={`default-${i}`} box={box} />
          ))}

          {customBoxes.map((box, i) => (
            <ShortcutCard key={`custom-${i}`} box={box} onDelete={() => handleDelete(i)} />
          ))}

          <div className={`${styles.shortcutCard} ${styles.addCard}`} onClick={openModal}>
            <div className={styles.shortcutIconWrap}>
              <span className={styles.plusIcon}>+</span>
            </div>
            <div className={styles.shortcutLabel}>Add More Pages</div>
          </div>
        </div>
      </section>

      {/* Add Page Modal */}
      <div
        className={`${styles.modalOverlay} ${isModalOpen ? styles.active : ""}`}
        onClick={(e) => e.target === e.currentTarget && closeModal()}
      >
        <div className={styles.modalBox}>
          <h3>Add New Page</h3>
          <p className={styles.modalSub}>Create a shortcut box for another admin page.</p>

          <div className={styles.modalField}>
            <label htmlFor="newBoxName">Box Name</label>
            <input
              id="newBoxName"
              type="text"
              placeholder="e.g. Coupons"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className={styles.modalField}>
            <label htmlFor="newBoxIcon">Icon Image Link</label>
            <input
              id="newBoxIcon"
              type="text"
              placeholder="https://img.icons8.com/.../icon.png"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
            />
          </div>
          <div className={styles.modalField}>
            <label htmlFor="newBoxLink">Redirect Page</label>
            <input
              id="newBoxLink"
              type="text"
              placeholder="/admin/coupons"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
          </div>

          <div className={styles.modalActions}>
            <button className={styles.btnModalCancel} onClick={closeModal}>Cancel</button>
            <button className={styles.btnModalSave} onClick={handleSave}>Add Page</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutCard({ box, onDelete }) {
  return (
    <a href={box.path} className={styles.shortcutCard}>
      {onDelete && (
        <div
          className={styles.shortcutDelete}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          &times;
        </div>
      )}
      <div className={styles.shortcutIconWrap}>
        <img
          src={box.icon || FALLBACK_ICON}
          alt={box.name}
          onError={(e) => (e.currentTarget.src = FALLBACK_ICON)}
        />
      </div>
      <div className={styles.shortcutLabel}>{box.name}</div>
      <div className={styles.shortcutPath}>{box.path}</div>
      <div className={styles.shortcutChevron}>&rarr;</div>
    </a>
  );
}