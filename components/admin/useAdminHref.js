// components/admin/useAdminHref.js  (new file)
//
// Admin URLs differ by host: on admin.<site> they have no /admin prefix
// (proxy.js rewrites them), on the plain-path fallback they do. This hook
// returns a helper that builds the right href for either case:
//   const href = useAdminHref();   href("/exams/create")
"use client";

import { usePathname } from "next/navigation";

export function useAdminHref() {
  const pathname = usePathname() || "/";
  const prefixed = pathname === "/admin" || pathname.startsWith("/admin/");
  const base = prefixed ? "/admin" : "";
  return (path = "") => `${base}${path}` || "/";
}
