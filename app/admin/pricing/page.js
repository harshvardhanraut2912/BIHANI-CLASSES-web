"use client";

// app/admin/pricing/page.js
//
// Admin > Pricing. Four plans, a "included in every plan" strip, a cost
// calculator, a comparison table and an FAQ. Reached from the shortcut
// card on /admin and protected by the same admin gate (proxy.js + layout.js)
// as every other /admin/* page -- nothing to configure here.
//
// To change a price or a bullet point, edit the constants below.

import { useState } from "react";
import { fontVars } from "@/components/site/fonts";
import s from "./pricing.module.css";

/* ================= EDIT HERE: prices & plan content ================= */
const PER_STUDENT = 350;   // Student-Wise: Rs per student per year
const MONTHLY = 2500;      // Monthly: Rs per month
const YEARLY = 25000;      // Yearly: Rs per year
const MANAGED = 30000;     // Fully Managed: Rs per year

const INCLUDED_EVERYWHERE = [
  { icon: "globe", title: "Website", text: "Your institute's own website, ready to share with students and parents." },
  { icon: "phone", title: "Student App", text: "Students attend tests and access their batches from their phone." },
  { icon: "panel", title: "Admin App for Teacher", text: "A control panel for the teacher to manage students, batches and tests." },
];

const PLANS = [
  {
    id: "student",
    icon: "atom",
    name: "Student-Wise",
    tag: "Pay per student",
    price: PER_STUDENT,
    unit: "per student / year",
    blurb: "Pay only for the students you enrol, for the entire year.",
    points: [
      "1 year of all facilities",
      "All batches available to every student",
      "Unlimited test planning",
      "Unlimited test scheduling",
      "Server cost included",
    ],
    excluded: ["Domain cost not included"],
  },
  {
    id: "monthly",
    icon: "flask",
    name: "Monthly",
    tag: "Pay as you go",
    price: MONTHLY,
    unit: "per month",
    blurb: "Start when you need it, stop when you don't.",
    points: [
      "Unlimited students",
      "Unlimited mock tests",
      "Server cost handled by us",
    ],
    excluded: ["Domain charges paid by the client"],
    warning: "Pay as you use. If a month goes unpaid, the website goes down immediately.",
  },
  {
    id: "yearly",
    icon: "benzene",
    name: "Yearly",
    tag: "Best value",
    featured: true,
    price: YEARLY,
    unit: "per year",
    blurb: "One yearly payment with the domain taken care of.",
    save: `Saves ${"\u20B9"}${(MONTHLY * 12 - YEARLY).toLocaleString("en-IN")} compared to 12 months of Monthly`,
    points: [
      "Unlimited test planning",
      "Unlimited students",
      "Access to every batch",
      "Server cost handled by us",
      "Domain registration handled by us",
    ],
    note: "Tests are organised by the client (manual work).",
  },
  {
    id: "managed",
    icon: "molecule",
    name: "Fully Managed",
    tag: "Premium",
    price: MANAGED,
    unit: "per year",
    blurb: "Sit back. We run everything for you.",
    points: [
      "All facilities of the Yearly plan",
      "All test organisation handled by us",
      "All test scheduling handled by us",
      "Design updates handled by us",
      "Everything handled by us",
    ],
  },
];

// Comparison table. "-" means the plan details don't mention it.
const COMPARE = [
  { row: "Website + Student App + Admin App", cells: ["yes", "yes", "yes", "yes"] },
  { row: "Students", cells: [`${"\u20B9"}${PER_STUDENT} each`, "Unlimited", "Unlimited", "Unlimited"] },
  { row: "Access to all batches", cells: ["yes", "-", "yes", "yes"] },
  { row: "Tests", cells: ["Unlimited planning & scheduling", "Unlimited mock tests", "Unlimited test planning", "Organised & scheduled by us"] },
  { row: "Server cost", cells: ["Included", "Handled by us", "Handled by us", "Handled by us"] },
  { row: "Domain", cells: ["Not included", "Paid by client", "Registration by us", "Registration by us"] },
  { row: "Who organises tests", cells: ["-", "-", "Client (manual)", "Us"] },
  { row: "Design updates", cells: ["-", "-", "-", "yes"] },
  { row: "Billing", cells: ["Yearly, per student", "Monthly, pay as you go", "Yearly", "Yearly"] },
];

const FAQ = [
  ["What is included in every plan?", "Every plan includes a website, a student app and an admin app for the teacher."],
  ["Who pays for the domain?", "On the Student-Wise and Monthly plans the domain cost is paid by the client. On the Yearly and Fully Managed plans domain registration is handled by us."],
  ["Is the server cost extra?", "No. Server cost is included in the Student-Wise plan and handled by us on the Monthly, Yearly and Fully Managed plans."],
  ["What happens if I stop paying on the Monthly plan?", "The Monthly plan is pay as you go. If a month goes unpaid, the website goes down immediately."],
  ["Who organises the tests?", "On the Yearly plan the client organises tests manually. On the Fully Managed plan all test organisation and scheduling is handled by us."],
];
/* ===================================================================== */

const inr = (n) => "\u20B9" + Math.round(n).toLocaleString("en-IN");

function Icon({ k }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round" };
  const g = {
    flask: <><path d="M22 6h20M26 6v16L10 52a4 4 0 0 0 4 6h36a4 4 0 0 0 4-6L38 22V6" /><path d="M17 42h30" /></>,
    atom: <><ellipse cx="32" cy="32" rx="26" ry="10" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(60 32 32)" /><ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(120 32 32)" /><circle cx="32" cy="32" r="3" fill="currentColor" /></>,
    benzene: <><path d="M32 8l20 12v24L32 56 12 44V20z" /><path d="M32 17l12 7v16l-12 7-12-7V24z" /></>,
    molecule: <><circle cx="16" cy="40" r="8" /><circle cx="46" cy="40" r="8" /><circle cx="32" cy="14" r="7" /><path d="M23 36l6-15M39 35l-5-14M24 40h14" /></>,
    globe: <><circle cx="32" cy="32" r="24" /><ellipse cx="32" cy="32" rx="10" ry="24" /><path d="M8 32h48M12 19h40M12 45h40" /></>,
    phone: <><rect x="18" y="5" width="28" height="54" rx="6" /><path d="M28 51h8" /></>,
    panel: <><rect x="6" y="10" width="52" height="40" rx="5" /><path d="M6 22h52M18 56h28M32 50v6M14 32h14M14 40h10M36 32h14v10H36z" /></>,
  };
  return <svg className={s.icon} viewBox="0 0 64 64" aria-hidden="true" {...p}>{g[k]}</svg>;
}

const Tick = () => (
  <svg viewBox="0 0 24 24" className={s.tick} aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Cross = () => (
  <svg viewBox="0 0 24 24" className={s.cross} aria-hidden="true"><circle cx="12" cy="12" r="11" /><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /></svg>
);

const BUBBLES = [
  { x: "55%", sz: 7, d: "7.2s", dl: "0s" },
  { x: "66%", sz: 5, d: "8.4s", dl: "-3s" },
  { x: "78%", sz: 9, d: "9.1s", dl: "-5s" },
  { x: "89%", sz: 6, d: "7.8s", dl: "-2s" },
  { x: "96%", sz: 5, d: "8.8s", dl: "-6s" },
];

export default function AdminPricingPage() {
  const [students, setStudents] = useState(60);
  const [copied, setCopied] = useState("");

  function setStudentCount(v) {
    const n = Math.min(2000, Math.max(1, Math.floor(Number(v)) || 1));
    setStudents(n);
  }

  async function copyQuote(plan) {
    const lines = [
      `${plan.name} plan: ${inr(plan.price)} ${plan.unit}`,
      "",
      "Included in every plan: Website, Student App and Admin App for the teacher.",
      "",
      ...plan.points.map((p) => `- ${p}`),
      ...(plan.excluded || []).map((p) => `- ${p}`),
      ...(plan.note ? [`- ${plan.note}`] : []),
      ...(plan.warning ? ["", plan.warning] : []),
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(plan.id);
      setTimeout(() => setCopied((c) => (c === plan.id ? "" : c)), 1800);
    } catch (e) {
      window.prompt("Copy this quote:", text);
    }
  }

  // ---- calculator ----
  const rows = [
    { id: "student", label: "Student-Wise", total: PER_STUDENT * students, note: `${inr(PER_STUDENT)} \u00D7 ${students} student${students === 1 ? "" : "s"}` },
    { id: "monthly", label: "Monthly", total: MONTHLY * 12, note: `${inr(MONTHLY)} \u00D7 12 months` },
    { id: "yearly", label: "Yearly", total: YEARLY, note: "One yearly payment" },
    { id: "managed", label: "Fully Managed", total: MANAGED, note: "One yearly payment" },
  ];
  const maxTotal = Math.max(...rows.map((r) => r.total));
  const minTotal = Math.min(...rows.map((r) => r.total));
  const breakEven = Math.floor(YEARLY / PER_STUDENT);

  return (
    <div className={`${s.page} ${fontVars}`}>
      <div className={s.wrap}>
        <a href="/admin" className={s.back}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Admin Panel
        </a>

        {/* ===== HERO ===== */}
        <header className={s.hero}>
          <div className={s.decor} aria-hidden="true">
            <svg className={s.ring} viewBox="0 0 100 100" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round">
              <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
              <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" strokeWidth="1.4" />
              <circle cx="50" cy="50" r="9" />
            </svg>
            {BUBBLES.map((b, i) => (
              <span key={i} className={s.bubble} style={{ left: b.x, width: b.sz, height: b.sz, animationDuration: b.d, animationDelay: b.dl }} />
            ))}
          </div>
          <span className={s.eyebrow}>Pricing</span>
          <h1 className={s.title}>Simple plans for every institute</h1>
          <p className={s.lede}>
            Pick how you want to pay. Every plan comes with a website, a student app and an admin app for the teacher.
          </p>
          <div className={s.heroStats}>
            <span><b>4</b> plans</span>
            <span><b>{inr(PER_STUDENT)}</b> per student / year</span>
            <span><b>{inr(MONTHLY)}</b> per month</span>
          </div>
        </header>

        {/* ===== INCLUDED IN EVERY PLAN ===== */}
        <section className={s.section}>
          <h2 className={s.h2}>Included in every plan</h2>
          <p className={s.sub}>No matter which plan you choose, you get the complete set of apps.</p>
          <div className={s.incGrid}>
            {INCLUDED_EVERYWHERE.map((x) => (
              <div key={x.title} className={s.incCard}>
                <span className={s.incIcon}><Icon k={x.icon} /></span>
                <div>
                  <h3>{x.title}</h3>
                  <p>{x.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== PLANS ===== */}
        <section className={s.section}>
          <h2 className={s.h2}>Choose a plan</h2>
          <p className={s.sub}>All prices are in Indian Rupees.</p>
          <div className={s.plans}>
            {PLANS.map((p, i) => (
              <article key={p.id} className={`${s.plan} ${s[`plan${i + 1}`]} ${p.featured ? s.featured : ""}`}>
                <div className={s.planTop}>
                  <span className={s.planIcon}><Icon k={p.icon} /></span>
                  <span className={s.planNo}>Plan {i + 1}</span>
                </div>
                <span className={s.planTag}>{p.tag}</span>
                <h3 className={s.planName}>{p.name}</h3>
                <p className={s.planBlurb}>{p.blurb}</p>

                <div className={s.priceRow}>
                  <span className={s.price}>{inr(p.price)}</span>
                  <span className={s.unit}>{p.unit}</span>
                </div>
                {p.save && <div className={s.save}>{p.save}</div>}

                <ul className={s.points}>
                  {p.points.map((pt) => (<li key={pt}><Tick /><span>{pt}</span></li>))}
                  {(p.excluded || []).map((pt) => (<li key={pt} className={s.excluded}><Cross /><span>{pt}</span></li>))}
                </ul>

                {p.note && <div className={s.note}>{p.note}</div>}
                {p.warning && <div className={s.warn}><b>Pay as you go.</b> {p.warning.replace("Pay as you use. ", "")}</div>}

                <button type="button" className={s.copyBtn} onClick={() => copyQuote(p)}>
                  {copied === p.id ? "Copied \u2713" : "Copy quote"}
                </button>
              </article>
            ))}
          </div>
        </section>

        {/* ===== CALCULATOR ===== */}
        <section className={s.section}>
          <div className={s.calc}>
            <div className={s.calcHead}>
              <div>
                <h2 className={s.h2}>Estimate the yearly cost</h2>
                <p className={s.sub}>Move the slider to see what each plan costs for a full year.</p>
              </div>
              <label className={s.calcInput}>
                <span>Students</span>
                <input
                  type="number" min="1" max="2000" value={students}
                  onChange={(e) => setStudentCount(e.target.value)}
                  aria-label="Number of students"
                />
              </label>
            </div>
            <input
              type="range" min="1" max="500" value={Math.min(students, 500)}
              onChange={(e) => setStudentCount(e.target.value)}
              className={s.range} aria-label="Number of students slider"
            />
            <div className={s.bars}>
              {rows.map((r) => (
                <div key={r.id} className={`${s.barRow} ${r.total === minTotal ? s.best : ""}`}>
                  <div className={s.barLabel}>
                    <b>{r.label}</b>
                    {r.total === minTotal && <em>Lowest</em>}
                  </div>
                  <div className={s.barTrack}><div className={s.barFill} style={{ width: `${Math.max(3, (r.total / maxTotal) * 100)}%` }} /></div>
                  <div className={s.barValue}>
                    <b>{inr(r.total)}</b>
                    <small>{r.note}</small>
                  </div>
                </div>
              ))}
            </div>
            <p className={s.insight}>
              Student-Wise is the lowest-cost plan up to <b>{breakEven} students</b>; beyond that, Yearly costs less. Monthly costs {inr(MONTHLY * 12 - YEARLY)} more than Yearly over a full year, but lets you start and stop any time.
              Domain charges are extra on the Student-Wise and Monthly plans.
            </p>
          </div>
        </section>

        {/* ===== COMPARISON TABLE ===== */}
        <section className={s.section}>
          <h2 className={s.h2}>Compare plans</h2>
          <p className={s.sub}>A dash means the plan details do not cover that item.</p>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th />
                  {PLANS.map((p) => (<th key={p.id} className={p.featured ? s.thFeatured : ""}>{p.name}<small>{inr(p.price)} {p.unit}</small></th>))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={PLANS[i].featured ? s.tdFeatured : ""}>
                        {c === "yes" ? <Tick /> : c === "-" ? <span className={s.dash}>&mdash;</span> : c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section className={s.section}>
          <h2 className={s.h2}>Frequently asked questions</h2>
          <div className={s.faq}>
            {FAQ.map(([q, a]) => (
              <details key={q} className={s.faqItem}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className={s.foot}>Prices are in INR. Domain charges, where not included, are paid by the client.</p>
      </div>
    </div>
  );
}
