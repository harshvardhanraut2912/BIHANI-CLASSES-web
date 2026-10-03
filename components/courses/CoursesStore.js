'use client';

// SAVE THIS FILE AT: components/courses/CoursesStore.js  (new file)
//
// Replaces the script block of the old public/cources.html. Same logic, same
// Supabase tables and same rules -- only the rendering moved from innerHTML
// strings to React:
//   - session bootstrap (getSession, then the cet_session_token cookie fallback)
//   - fetch target_segments, products, courses (sidebar_main_sections with
//     is_course = true + their sidebar_subsections), course-owned chapter ids,
//     and the student's enrollments (product_id AND course_id)
//   - a product is "standalone" only if none of subsection_id /
//     course_subsection_id / chapter_id trace back into a course
//   - search by title/name (220ms debounce)
//   - rows: "Batches" (all courses) + one row per target segment
//     (that segment's courses first, then its standalone products)
//   - "View All" expands a row into a grid and blurs every other row
//   - free enroll / paid-course redirect / owned -> dashboard rules
//
// Navbar, dark-mode toggle, logout and the mobile drawer now come from the
// shared HomeNavbar, so none of that code lives here any more.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { resolveImageUrl } from '@/lib/resolveImageUrl';
import LoadingAnimation from '@/components/common/LoadingAnimation';
import s from './courses.module.css';

const LOGIN_REDIRECT = '/login?redirect=/cources';
const LOGO = '/images/other_images/bihaniclasses-logo.png';

// Fallback for batches that don't have an explicit `slug` column set yet.
function slugifyText(text) {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function slugOf(course) {
  return course.slug || slugifyText(course.name);
}

// "Original" (strike-through) price is always 1.5x the selling price.
function originalPriceOf(price) {
  return Math.round(price * 1.5);
}

/* ---------------- small presentational pieces ---------------- */

function Thumb({ src, alt }) {
  const [bad, setBad] = useState(false);
  const url = resolveImageUrl(src);
  if (!url || bad) {
    return (
      <div className={s.thumbFallback}>
        <img src={LOGO} alt="" />
        <span>Bihani Classes</span>
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setBad(true)} />;
}

function Badge({ label, fallback }) {
  const text = label || fallback;
  if (!text) return null;
  const key = String(text).toLowerCase();
  const tone = key === 'free' ? s.badgeFree : key === 'pro' ? s.badgePro : '';
  return <span className={`${s.badge} ${tone}`}>{text}</span>;
}

function PriceRow({ paid, price, showPercent }) {
  if (!paid) {
    return (
      <div className={s.price}>
        <span className={`${s.now} ${s.freeText}`}>FREE</span>
      </div>
    );
  }
  const original = originalPriceOf(price);
  const pct = original > 0 ? Math.round((1 - price / original) * 100) : 0;
  return (
    <div className={s.price}>
      <span className={s.now}>₹{price}</span>
      <span className={s.was}>₹{original}</span>
      {showPercent && pct > 0 && <span className={s.off}>{pct}% OFF</span>}
    </div>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/* ---------------- main component ---------------- */

export default function CoursesStore() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const [segments, setSegments] = useState([]);
  const [products, setProducts] = useState([]);
  const [courses, setCourses] = useState([]);
  // Course-ownership detection: a product can be linked to a course through
  // three different columns (subsection_id, course_subsection_id, chapter_id)
  // depending on when it was created, so we keep a set for each path.
  const [ownedSubIds, setOwnedSubIds] = useState(() => new Set());
  const [ownedChapterIds, setOwnedChapterIds] = useState(() => new Set());
  const [enrolledProductIds, setEnrolledProductIds] = useState([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState([]);

  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null); // { msg, error }

  const toastTimer = useRef(null);
  const searchTimer = useRef(null);

  function showToast(msg, error = false) {
    clearTimeout(toastTimer.current);
    setToast({ msg, error });
    toastTimer.current = setTimeout(() => setToast(null), 4500);
  }

  /* ---------- boot: auth sync + data ---------- */
  useEffect(() => {
    let alive = true;

    async function fetchStoreData(sess) {
      try {
        const [segRes, prodRes, courseRes] = await Promise.all([
          // Dynamic top-row classifications (11th, 12th, etc.)
          supabase.from('target_segments').select('*').order('display_order', { ascending: true }),
          supabase.from('products').select('*'),
          // Courses are top-level sellable bundles (sidebar_main_sections rows
          // with is_course = true). Their child products live under course
          // subsections and are never rendered as standalone cards.
          supabase
            .from('sidebar_main_sections')
            .select('*, sidebar_subsections(*)')
            .eq('is_course', true)
            .order('display_order', { ascending: true }),
        ]);
        if (!alive) return;

        const segs = segRes.data || [];
        const prods = prodRes.data || [];
        const courseRows = courseRes.data || [];
        setSegments(segs);
        setProducts(prods);
        setCourses(courseRows);

        const subIds = new Set(
          courseRows.flatMap((c) => (c.sidebar_subsections || []).map((x) => x.id))
        );
        const chapIds = new Set();
        if (subIds.size > 0) {
          const { data: chapterRows } = await supabase.from('sidebar_chapters').select('id, subsection_id');
          (chapterRows || []).forEach((ch) => {
            if (subIds.has(ch.subsection_id)) chapIds.add(ch.id);
          });
        }
        if (!alive) return;
        setOwnedSubIds(subIds);
        setOwnedChapterIds(chapIds);

        if (sess) {
          const email = sess.user.email;
          const [{ data: enrollments }, { data: courseEnrollments }] = await Promise.all([
            supabase.from('user_enrollments').select('product_id').eq('student_id', email),
            // separate course enrollment lookup (course_id column, not product_id)
            supabase.from('user_enrollments').select('course_id').eq('student_id', email).not('course_id', 'is', null),
          ]);
          if (!alive) return;
          if (enrollments) setEnrolledProductIds(enrollments.map((r) => r.product_id));
          if (courseEnrollments) setEnrolledCourseIds(courseEnrollments.map((r) => r.course_id));
        }
      } catch (err) {
        console.error('Store Fetch Error:', err);
      }
    }

    async function boot() {
      let sess = null;
      try {
        const { data } = await supabase.auth.getSession();
        sess = data.session;
        if (!sess) {
          const match = document.cookie.match(/(^| )cet_session_token=([^;]+)/);
          if (match && match[2]) {
            const token = match[2];
            const { data: syncData } = await supabase.auth.setSession({ access_token: token, refresh_token: token });
            if (syncData && syncData.session) sess = syncData.session;
          }
        }
      } catch (err) {
        console.error('Auth Sync Error:', err);
      }
      if (!alive) return;
      setSession(sess);

      await fetchStoreData(sess);
      if (alive) setLoading(false);
    }

    boot();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => setSession(sess));

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
      clearTimeout(toastTimer.current);
      clearTimeout(searchTimer.current);
    };
  }, []);

  /* ---------- search ---------- */
  function handleSearch(value) {
    setSearchInput(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setQuery(value.trim().toLowerCase());
      setExpandedRow(null);
    }, 220);
  }

  function clearSearch() {
    clearTimeout(searchTimer.current);
    setSearchInput('');
    setQuery('');
    setExpandedRow(null);
  }

  /* ---------- derived rows ---------- */
  const rows = useMemo(() => {
    // Standalone products only. Excludes a product if ANY of its linkage
    // columns point into a course's own subsections/chapters.
    const standalone = products.filter(
      (p) =>
        !ownedSubIds.has(p.subsection_id) &&
        !ownedSubIds.has(p.course_subsection_id) &&
        !ownedChapterIds.has(p.chapter_id)
    );
    const filteredProducts = query ? standalone.filter((p) => (p.title || '').toLowerCase().includes(query)) : standalone;
    const filteredCourses = query ? courses.filter((c) => (c.name || '').toLowerCase().includes(query)) : courses;

    const list = [];

    // Courses row: every course, regardless of segment.
    if (filteredCourses.length > 0) {
      list.push({ id: 'batches', title: 'Batches', courses: filteredCourses, products: [], expandable: false });
    }

    // One row per target segment (11th, 12th, ...). Courses can optionally
    // ALSO be listed inside a segment's row (admin "Where should this appear?").
    segments.forEach((segment) => {
      const segProducts = filteredProducts.filter((p) => p.segment_id === segment.id);
      const segCourses = filteredCourses.filter((c) => c.segment_id === segment.id);
      if (segProducts.length > 0 || segCourses.length > 0) {
        list.push({ id: segment.id, title: segment.name, courses: segCourses, products: segProducts, expandable: true });
      }
    });

    return { list, isEmpty: filteredProducts.length === 0 && filteredCourses.length === 0 };
  }, [products, courses, segments, ownedSubIds, ownedChapterIds, query]);

  /* ---------- row expansion ("View All") ---------- */
  function toggleRow(rowId) {
    setExpandedRow((prev) => (prev === rowId ? null : rowId));
  }

  // Bring the expanded row to the top, clear of the fixed navbar
  // (clearance comes from scroll-margin-top in the CSS).
  useEffect(() => {
    if (!expandedRow) return;
    const el = document.getElementById(`sec-${expandedRow}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [expandedRow]);

  function scrollTray(rowId, dir) {
    const el = document.getElementById(`tray-${rowId}`);
    if (el) el.scrollBy({ left: dir * 300, behavior: 'smooth' });
  }

  /* ---------- enrollment logic ---------- */
  async function enrollFreeProduct(productId) {
    if (!session) {
      window.location.href = LOGIN_REDIRECT;
      return;
    }
    setBusyId(productId);
    try {
      const { error } = await supabase
        .from('user_enrollments')
        .insert([{ student_id: session.user.email, product_id: productId }]);
      if (error && error.code !== '23505') throw error;

      setEnrolledProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
      showToast('Successfully Enrolled! This material is now unlocked in your Dashboard.');
    } catch (err) {
      console.error('Enrollment Error:', err);
      showToast('Something went wrong. Please try again.', true);
    } finally {
      setBusyId(null);
    }
  }

  function buyProduct(price) {
    if (!session) {
      window.location.href = LOGIN_REDIRECT;
      return;
    }
    showToast(`Payment Gateway initialization for ₹${price} will go here!`);
  }

  async function enrollFreeCourse(courseId) {
    if (!session) {
      window.location.href = LOGIN_REDIRECT;
      return;
    }
    setBusyId(courseId);
    try {
      const email = session.user.email;

      // 1. Enroll in the course itself
      const { error: courseEnrollErr } = await supabase
        .from('user_enrollments')
        .insert([{ student_id: email, course_id: courseId }]);
      if (courseEnrollErr && courseEnrollErr.code !== '23505') throw courseEnrollErr;

      // 2. Auto-enroll in every product currently inside this course so the
      //    dashboard's existing enrolledProductIds check works for course
      //    products too. Products added later are visible directly (the
      //    sidebar gate-keeps access) without any extra enrollment step.
      const course = courses.find((c) => c.id === courseId);
      const subsectionIds = (course?.sidebar_subsections || []).map((x) => x.id);
      if (subsectionIds.length > 0) {
        const { data: courseProducts } = await supabase.from('products').select('id').in('course_subsection_id', subsectionIds);
        if (courseProducts && courseProducts.length > 0) {
          const rowsToUpsert = courseProducts.map((p) => ({ student_id: email, product_id: p.id }));
          // upsert so duplicate rows are silently ignored
          await supabase
            .from('user_enrollments')
            .upsert(rowsToUpsert, { onConflict: 'student_id,product_id', ignoreDuplicates: true });
        }
      }

      setEnrolledCourseIds((prev) => (prev.includes(courseId) ? prev : [...prev, courseId]));
      showToast('Successfully Enrolled! This batch is now unlocked in your Dashboard.');
    } catch (err) {
      console.error('Course Enrollment Error:', err);
      showToast('Something went wrong. Please try again.', true);
    } finally {
      setBusyId(null);
    }
  }

  function buyCourse(course) {
    if (!session) {
      window.location.href = LOGIN_REDIRECT;
      return;
    }
    // Paid batches are bought on the batch's own page, where BuyBox +
    // CouponBox show the real server-verified price and let the student apply
    // a coupon BEFORE any transaction happens.
    const slug = course.slug || (course.name ? slugifyText(course.name) : null);
    if (!slug) {
      showToast('This course page is not set up yet -- contact the admin.', true);
      return;
    }
    window.location.href = `/cources/${slug}`;
  }

  /* ---------- cards (plain render functions, not nested components, so
     React keeps each card mounted instead of remounting on every render) ---------- */
  function renderCourseCard(course) {
    const isEnrolled = enrolledCourseIds.includes(course.id);
    const busy = busyId === course.id;
    const slug = slugOf(course);
    const sectionCount = (course.sidebar_subsections || []).length;

    let action;
    if (isEnrolled) {
      action = (
        <button type="button" className={`${s.btn} ${s.btnStudy}`} onClick={() => (window.location.href = `/dashboard/${course.id}`)}>
          Go Study
        </button>
      );
    } else if (course.is_paid) {
      action = (
        <button type="button" className={s.btn} onClick={() => buyCourse(course)}>
          Buy Now
        </button>
      );
    } else {
      action = (
        <button type="button" className={s.btn} disabled={busy} onClick={() => enrollFreeCourse(course.id)}>
          {busy ? 'Enrolling...' : 'Enroll for Free'}
        </button>
      );
    }

    return (
      <article key={`c-${course.id}`} className={s.card}>
        <div className={s.thumb}>
          <Thumb src={course.thumbnail_url} alt={course.name} />
          <Badge label={course.badge_label} fallback="Batch" />
        </div>
        <div className={s.cardBody}>
          <h3 className={s.title}>
            <a href={`/cources/${slug}`}>{course.name}</a>
          </h3>
          <div className={s.meta}>
            <BookIcon />
            {sectionCount} sections included
          </div>
          <PriceRow paid={course.is_paid} price={course.price} showPercent />
          <div className={s.actions}>
            {action}
            <a href={`/cources/${slug}`} className={s.arrow} aria-label={`View ${course.name}`}>
              <ChevronRight />
            </a>
          </div>
        </div>
      </article>
    );
  }

  function renderProductCard(product) {
    const isEnrolled = enrolledProductIds.includes(product.id);
    const busy = busyId === product.id;

    let action;
    if (isEnrolled) {
      action = (
        <button type="button" className={`${s.btn} ${s.btnOwned}`} onClick={() => (window.location.href = `/dashboard/${product.id}`)}>
          Go to Dashboard
        </button>
      );
    } else if (product.is_paid) {
      action = (
        <button type="button" className={s.btn} onClick={() => buyProduct(product.price)}>
          Buy Now
        </button>
      );
    } else {
      action = (
        <button type="button" className={s.btn} disabled={busy} onClick={() => enrollFreeProduct(product.id)}>
          {busy ? 'Enrolling...' : 'Enroll for Free'}
        </button>
      );
    }

    return (
      <article key={`p-${product.id}`} className={s.card}>
        <div className={s.thumb}>
          <Thumb src={product.thumbnail_url} alt={product.title} />
          <Badge label={product.badge_label} />
        </div>
        <div className={s.cardBody}>
          <h3 className={s.title}>{product.title}</h3>
          {product.instructor && <div className={s.meta}>By {product.instructor}</div>}
          <PriceRow paid={product.is_paid} price={product.price} />
          <div className={s.actions}>{action}</div>
        </div>
      </article>
    );
  }

  /* ---------- render ---------- */
  const jumpRows = rows.list;

  return (
    <>
      <header className={s.head}>
        <p className={s.eyebrow}>Bihani Chemistry Classes</p>
        <h1 className={s.h1}>Batches &amp; Courses</h1>
        <p className={s.lead}>Pick your class, exam or test series. Enroll for free batches in one tap, or open any batch to see what is inside.</p>

        <div className={s.toolbar}>
          <div className={s.search}>
            <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchInput}
              placeholder="Search batches..."
              aria-label="Search batches"
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchInput && (
              <button type="button" className={s.clear} aria-label="Clear search" onClick={clearSearch}>
                ×
              </button>
            )}
          </div>

          {!loading && jumpRows.length > 1 && (
            <nav className={s.jump} aria-label="Jump to a section">
              {jumpRows.map((r) => (
                <a key={r.id} href={`#sec-${r.id}`}>
                  {r.title}
                </a>
              ))}
            </nav>
          )}
        </div>
      </header>

      <div className={s.body}>
        {loading ? (
          <LoadingAnimation message="Loading batches…" />
        ) : rows.isEmpty ? (
          <div className={s.empty}>
            <h3>No Batches Found</h3>
            <p>We don&apos;t have items matching this category yet. Check back soon!</p>
            {query && (
              <button type="button" className={s.btn} style={{ flex: 'none', marginTop: 16 }} onClick={clearSearch}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          rows.list.map((sec, i) => {
            const expanded = expandedRow === sec.id;
            const blurred = expandedRow !== null && !expanded;
            return (
              <section key={sec.id} id={`sec-${sec.id}`} className={`${s.sec} ${blurred ? s.blurred : ''}`}>
                <div className={s.secHead}>
                  <span className={s.secNo}>{String(i + 1).padStart(2, '0')}</span>
                  <h2 className={s.h2}>{sec.title}</h2>
                  <div className={s.secTools}>
                    {!expanded && (
                      <span className={s.arrows}>
                        <button type="button" aria-label="Scroll left" onClick={() => scrollTray(sec.id, -1)}>‹</button>
                        <button type="button" aria-label="Scroll right" onClick={() => scrollTray(sec.id, 1)}>›</button>
                      </span>
                    )}
                    {sec.expandable && (
                      <button type="button" className={s.viewAll} aria-expanded={expanded} onClick={() => toggleRow(sec.id)}>
                        {expanded ? 'Show Less' : 'View All'}
                      </button>
                    )}
                  </div>
                </div>
                <div id={`tray-${sec.id}`} className={expanded ? s.grid : s.tray}>
                  {sec.courses.map(renderCourseCard)}
                  {sec.products.map(renderProductCard)}
                </div>
              </section>
            );
          })
        )}
      </div>

      {toast && (
        <div className={`${s.toast} ${toast.error ? s.toastError : ''}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}
    </>
  );
}
