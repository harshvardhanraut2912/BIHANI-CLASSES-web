import Link from 'next/link';
import BuyBox from '@/components/course/BuyButton';

// This id must match the row in sidebar_main_sections (see CSV: COURSE_1788865705842)
// -- BuyBox fetches this course's live price/is_paid from Supabase via
// /api/course-price?id=... . Since is_paid=false, price=0.00 for this row,
// BuyBox will automatically render "FREE" and its button will read
// "Enroll for Free" -- clicking it calls handleEnroll() -> POST
// /api/enroll/coupon -> writes a real user_enrollments row -> redirects to
// /dashboard. No Razorpay script is loaded and no payment flow runs for
// this course. Everything else on this page is hardcoded content specific
// to THIS course, per-page as requested.
const PRODUCT_ID = 'COURSE_1788865705842';

export const metadata = {
    title: 'Y N Classes – MHT-CET 2027 Free Batch | Y N Classes',
    description: 'Get a free demo experience of Y N Classes for your MHT-CET 2027 preparation — a limited set of chapter-wise mock tests to try the test platform before joining the full program.'
};

const curriculum = [
    { title: 'Limited Chapter-wise Tests', desc: 'Access a small, selected collection of chapter-wise mock tests for Physics, Chemistry & Mathematics.' },
    { title: '5–10 Selected Mock Tests', desc: 'Attempt a handful of carefully picked mock tests to experience our test-taking platform.' },
    { title: 'Real MHT-CET Pattern', desc: 'Understand the MHT-CET-style questions and test pattern used across our test series.' },
    { title: 'Exam-Feel Practice', desc: 'Practice questions designed to give you a genuine feel of the actual exam.' },
    { title: 'Score & Performance Check', desc: 'Check your score, accuracy and performance after every test you attempt.' },
    { title: 'Solutions Included', desc: 'Get solutions for every test so you can understand your mistakes and improve.' }
];

const features = [
    'Explore our test interface and preparation methodology firsthand',
    'This batch is created only as a demo/free trial for students',
    'Does not include complete-year guidance or the full test series',
    'Limited content — experience Y N Classes before joining the full program',
    'Try it. Experience it. Prepare better. 🚀'
];

export default function YnClassesMhtCet2027FreeBatchPage() {
    return (
        <div className="course-page">
            {/* ================= HERO ================= */}
            <section className="hero">
                <Link href="/cources" className="back-to-cources">← Back to Courses</Link>
                <div className="hero-inner">
                    <div className="hero-text">
                        <span className="hero-badge">📚 MHT-CET 2027 · Free Demo Batch</span>
                        <h1>Y N Classes – MHT-CET 2027 Free</h1>
                        <p className="hero-sub">
                            Get a free demo experience of Y N Classes for your MHT-CET 2027 preparation —
                            a limited set of chapter-wise mock tests so you can try our test platform
                            before joining the complete program.
                        </p>
                        <div className="hero-stats">
                            <div><strong>Free</strong><span>No Payment Needed</span></div>
                            <div><strong>5–10</strong><span>Selected Mock Tests</span></div>
                            <div><strong>Demo</strong><span>Platform Experience</span></div>
                        </div>
                    </div>
                    <div className="hero-buybox">
                        <div className="buybox-frame" style={{ '--card-bg': '#ffffff', '--card-border': 'rgba(203, 220, 232, 0.8)', backgroundColor: '#ffffff' }}>
                            <BuyBox productId={PRODUCT_ID} originalPrice={0} validityText="Free · No Payment Needed" />
                        </div>
                    </div>
                </div>
            </section>

            {/* ================= CURRICULUM ================= */}
            <section className="section">
                <h2>What&apos;s Inside</h2>
                <div className="curriculum-grid">
                    {curriculum.map((item) => (
                        <div className="curriculum-card" key={item.title}>
                            <h3>{item.title}</h3>
                            <p>{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ================= FEATURES ================= */}
            <section className="section section-alt">
                <h2>Why Try This Free Batch</h2>
                <ul className="features-list">
                    {features.map((f) => (
                        <li key={f}>
                            <span className="check">✓</span> {f}
                        </li>
                    ))}
                </ul>
            </section>

            {/* ================= BOTTOM CTA (mobile sticky-style) ================= */}
            <section className="section section-cta">
                <h2>Try it. Experience it. Prepare better. 🚀</h2>
                <div className="cta-buybox">
                    <BuyBox productId={PRODUCT_ID} originalPrice={0} validityText="Free · No Payment Needed" />
                </div>
            </section>

            <style>{`
                :root {
                    --primary-blue: #0b4f8a;
                    --deep-blue: #06315c;
                    --accent-blue: #1d7fd6;
                    --brand-orange: #f2871a;
                    --brand-green: #0fae6c;
                    --brand-yellow: #f5c518;
                    --faint-blue: #e8f1fb;
                    --gray-bg: #f7f9fc;
                    --card-bg: #ffffff;
                    --text-main: #0f1f2e;
                    --text-muted: #5c6b7a;
                    --card-border: rgba(203, 220, 232, 0.8);
                    --radius-lg: 16px;
                    --shadow-premium: 0 20px 40px -5px rgba(11, 79, 138, 0.15);
                }
                .course-page {
                    font-family: 'Plus Jakarta Sans', 'Segoe UI', sans-serif;
                    color: var(--text-main);
                    background: var(--gray-bg);
                    padding-top: 90px;
                }
                h1, h2, h3 { font-family: 'Manrope', 'Plus Jakarta Sans', sans-serif; }

                .hero {
                    background: linear-gradient(135deg, var(--deep-blue), var(--primary-blue) 55%, var(--brand-green));
                    padding: 60px 24px;
                    position: relative;
                    overflow: hidden;
                }
                .hero-inner {
                    max-width: 1100px;
                    margin: 0 auto;
                    margin-top: 40px;
                    display: grid;
                    grid-template-columns: 1.4fr 1fr;
                    gap: 40px;
                    align-items: start;
                    position: relative;
                }
                .hero-badge {
                    display: inline-block;
                    background: rgba(245, 197, 24, 0.2);
                    border: 1px solid rgba(245, 197, 24, 0.5);
                    color: #fff;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 16px;
                }
                .back-to-cources {
                    position: absolute;
                    top: 24px;
                    left: 24px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: rgba(255,255,255,0.12);
                    border: 1px solid rgba(255,255,255,0.35);
                    color: #fff;
                    font-size: 14px;
                    font-weight: 700;
                    text-decoration: none;
                    padding: 9px 16px;
                    border-radius: 999px;
                    backdrop-filter: blur(4px);
                    transition: background 0.15s ease, transform 0.15s ease;
                    z-index: 2;
                }
                .back-to-cources:hover { background: rgba(255,255,255,0.22); transform: translateX(-2px); text-decoration: none; }
                .hero-text h1 {
                    color: #fff;
                    font-size: 36px;
                    line-height: 1.2;
                    margin-bottom: 14px;
                }
                .hero-sub { color: rgba(255,255,255,0.88); font-size: 16px; line-height: 1.6; max-width: 540px; }
                .hero-stats { display: flex; gap: 30px; margin-top: 30px; flex-wrap: wrap; }
                .hero-stats div { display: flex; flex-direction: column; }
                .hero-stats strong { color: var(--brand-yellow); font-size: 20px; font-family: 'Manrope', sans-serif; }
                .hero-stats span { color: rgba(255,255,255,0.75); font-size: 13px; }

                .buybox-frame {
                    --card-bg: #ffffff;
                    --card-border: rgba(203, 220, 232, 0.8);
                    background: #ffffff;
                    border-radius: calc(var(--radius-lg) + 6px);
                    padding: 14px;
                    box-shadow: var(--shadow-premium);
                }

                .section { max-width: 1100px; margin: 0 auto; padding: 60px 24px; }
                .section h2 {
                    font-size: 26px;
                    margin-bottom: 26px;
                    position: relative;
                    display: inline-block;
                }
                .section h2::after {
                    content: '';
                    display: block;
                    width: 56px;
                    height: 4px;
                    border-radius: 4px;
                    margin-top: 10px;
                    background: linear-gradient(90deg, var(--brand-orange), var(--brand-green), var(--brand-yellow));
                }
                .section-alt { background: var(--card-bg); }
                .section-cta {
                    text-align: center;
                    background: linear-gradient(135deg, var(--faint-blue), #eafaf2);
                    border-radius: var(--radius-lg);
                    margin: 40px auto 60px;
                }
                .section-cta h2 { margin-bottom: 24px; }
                .section-cta h2::after { margin-left: auto; margin-right: auto; }
                .cta-buybox { max-width: 420px; margin: 0 auto; }

                .curriculum-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                .curriculum-card {
                    background: var(--card-bg);
                    border: 1px solid var(--card-border);
                    border-top: 3px solid var(--accent-blue);
                    border-radius: var(--radius-lg);
                    padding: 22px;
                    box-shadow: var(--shadow-premium);
                    transition: transform 0.15s ease, border-color 0.15s ease;
                }
                .curriculum-card:nth-child(3n+2) { border-top-color: var(--brand-green); }
                .curriculum-card:nth-child(3n+3) { border-top-color: var(--brand-yellow); }
                .curriculum-card:hover { transform: translateY(-4px); }
                .curriculum-card h3 { font-size: 16px; margin-bottom: 8px; color: var(--primary-blue); }
                .curriculum-card p { font-size: 14px; color: var(--text-muted); line-height: 1.5; }

                .features-list { list-style: none; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; max-width: 1100px; margin: 0 auto; padding: 0 24px; }
                .features-list li {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 15px;
                    background: var(--gray-bg);
                    border: 1px solid var(--card-border);
                    border-radius: 10px;
                    padding: 12px 14px;
                }
                .check {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: var(--brand-green);
                    color: #fff;
                    font-weight: 800;
                    font-size: 13px;
                    flex-shrink: 0;
                }

                @media (max-width: 860px) {
                    .hero-inner { grid-template-columns: 1fr; margin-top: 44px; }
                    .back-to-cources { top: 16px; left: 16px; padding: 7px 12px; font-size: 13px; }
                    .curriculum-grid { grid-template-columns: 1fr; }
                    .features-list { grid-template-columns: 1fr; }
                }
            `}</style>
        </div>
    );
}