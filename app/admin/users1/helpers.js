// app/admin/users/helpers.js

export function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function statusPillClass(styles, status) {
  // CSS module class names are hashed, so we look them up by the same
  // key the original design used (status-<value>), falling back to none.
  return styles[`status-${status}`] || "";
}