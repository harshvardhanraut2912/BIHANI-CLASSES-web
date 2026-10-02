import Link from 'next/link';
import BuyBox from '@/components/course/BuyButton';

// This id must match the row in sidebar_main_sections (see CSV: COURSE_1788860647128)
// -- BuyBox uses it to fetch live price from Supabase. Everything else on this
// page is hardcoded content specific to THIS course, per-page as requested.
const PRODUCT_ID = 'COURSE_1788860647128';

export const metadata = {
    title: 'Y N Classes – MHT-CET 2027 Test Series | Y N Classes',
    description: 'Prepare smarter and stay exam-ready with the Y N Classes MHT-CET 2027 test series — chapter-wise part tests, weekly Sunday mocks and full-syllabus papers built for the MHT-CET 2027 pattern.'
};

const curriculum = [
    { title: 'Chapter-wise Mock Tests', desc: 'Dedicated tests for Physics, Chemistry & Mathematics, chapter by chapter.' },
    { title: 'Weekly Sunday Tests', desc: 'A regular Sunday test schedule that keeps your preparation consistent all year.' },
    { title: 'Full-Syllabus Mock Tests', desc: 'Complete papers covering the entire MHT-CET 2027 pattern, start to finish.' },
    { title: 'Pre-Exam Full Test Series', desc: 'A complete full-syllabus test series in the final stretch before MHT-CET 2027.' },
    { title: 'Detailed Solutions', desc: 'Step-by-step solutions for every question, so no mistake goes unlearned.' },
    { title: 'Performance Analysis', desc: 'Track your score trends and progress test after test.' }
];

const features = [
    'Tests built to improve speed, accuracy and time management',
    'Questions designed to the exact MHT-CET level and pattern',
    'A structured, predictable test schedule you can plan around',
    'Regular practice to strengthen concepts and exam confidence',
    'Access to the Y N Classes online test portal',
    'Practice. Analyse. Improve. Repeat.'
];

export default function YnClassesMhtCet2027Page() {
    return (
        <div className="course-page">
            {/* ================= HERO ================= */}
            <section className="hero">
                <Link href="/cources" className="back-to-cources">← Back to Courses</Link>
                <div className="hero-inner">
                    <div className="hero-text">
                        <span className="hero-badge">📚 MHT-CET 2027 · Full Test Series</span>
                        <h1>Y N Classes – MHT-CET 2027</h1>
                        <p className="hero-sub">
                            Prepare smarter and stay exam-ready with Y N Classes MHT-CET 2027 — chapter-wise
                            mock tests, a full-syllabus series and a Sunday test rhythm built to get you
                            genuinely ready for exam day. 🚀
                        </p>
                        <div className="hero-stats">
                            <div><strong>Chapter-wise</strong><span>Mock Tests</span></div>
                            <div><strong>Every Sunday</strong><span>Scheduled Tests</span></div>
                            <div><strong>Full-Syllabus</strong><span>MHT-CET Pattern</span></div>
                        </div>
                    </div>
                    <div className="hero-buybox">
                        <div className="buybox-frame" style={{ '--card-bg': '#ffffff', '--card-border': 'rgba(203, 220, 232, 0.8)', backgroundColor: '#ffffff' }}>
                            <BuyBox productId={PRODUCT_ID} originalPrice={849} validityText="Valid Till: Lifetime" />
                        </div>
                    </div>
                </div>
            </section>

            {/* ================= CURRICULUM ================= */}
            <section className="section">
                <h2>What You&apos;ll Get</h2>
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
                <h2>Why This Test Series</h2>
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
                <h2>Get ready to give your best in MHT-CET 2027! 🚀</h2>
                <div className="cta-buybox">
                    <BuyBox productId={PRODUCT_ID} originalPrice={849} validityText="Valid Till: Lifetime" />
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
                .curriculum-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-premium); }
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
