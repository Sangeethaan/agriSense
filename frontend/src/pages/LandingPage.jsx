import { Link } from 'react-router-dom';
import '../landing.css';

// ── SVG Icons ─────────────────────────────────────────────────
const MicIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const FlowerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 7.5a4.5 4.5 0 1 1 4.5 4.5M12 7.5A4.5 4.5 0 1 0 7.5 12M12 7.5V9m-4.5 3a4.5 4.5 0 1 0 4.5 4.5M7.5 12H9m7.5 0a4.5 4.5 0 1 1-4.5 4.5m4.5-4.5H15m-3 4.5V15" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const MapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
    <line x1="9" y1="3" x2="9" y2="18" />
    <line x1="15" y1="6" x2="15" y2="21" />
  </svg>
);

const BrainIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
  </svg>
);

const FEATURES = [
  {
    icon: <MicIcon />,
    title: 'AI Speech Recognition',
    desc: 'Fine-tuned model adapted to regional accents and native speaking patterns.',
    color: '#16a34a',
  },
  {
    icon: <GlobeIcon />,
    title: 'Multi-Language Support',
    desc: 'Accurate transcription in Kannada, Hindi, and English under real-world field conditions.',
    color: '#059669',
  },
  {
    icon: <FlowerIcon />,
    title: 'Floriculture Focused',
    desc: 'Purpose-built for flower cultivation, ornamental plants, and agro-processing operations.',
    color: '#16a34a',
  },
  {
    icon: <ShieldIcon />,
    title: 'Zero Data Loss',
    desc: 'Digitally capture and preserve every farmer interaction, eliminating manual record-keeping.',
    color: '#059669',
  },
  {
    icon: <MapIcon />,
    title: 'Field-Ready',
    desc: 'Designed for staff visiting multiple farms daily, working under challenging conditions.',
    color: '#16a34a',
  },
  {
    icon: <BrainIcon />,
    title: 'Structured Intelligence',
    desc: 'Transforms conversations into actionable insights and structured operational knowledge.',
    color: '#059669',
  },
];

const GALLERY = [
  {
    url: 'https://img-cdn.publive.online/filters:format(webp)/english-betterindia/media/post_attachments/uploads/2025/01/farm-1-1713964787-1-1737656276.jpg',
    alt: 'Floriculture farm aerial view',
  },
  {
    url: 'https://img-cdn.publive.online/filters:format(webp)/english-betterindia/media/post_attachments/uploads/2025/01/gurwinder-singh-3-1693544589-1737656618.jpg',
    alt: 'Farm worker tending flower crops',
  },
  {
    url: 'https://img-cdn.publive.online/filters:format(webp)/english-betterindia/media/post_attachments/uploads/2025/01/Abhinav-1-1645868822-3-1737656471.jpg',
    alt: 'Supervisor inspecting flower cultivation',
  },
];

// ── Navbar ────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="lp-nav">
      <div className="lp-nav-inner">
        <div className="lp-nav-brand">
          <div className="lp-nav-logo-mark">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M16 3C10.5 3 5 8 5 14c0 4 2 7.5 5.5 9.5L12 28h8l1.5-4.5C25 21.5 27 18 27 14c0-6-5.5-11-11-11z" fill="rgba(255,255,255,.95)" />
              <path d="M16 8v10M12.5 12l3.5-4 3.5 4" stroke="#14532d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="lp-nav-brand-text">AgriSense</span>
        </div>
        <Link to="/login" className="lp-nav-cta">Sign In</Link>
      </div>
    </nav>
  );
}

// ── LandingPage ───────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="lp-root">
      <Navbar />

      {/* ── Hero ──────────────────────────────────*/}
      <section className="lp-hero">
        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <span className="lp-hero-badge-dot" />
            AI-Powered Field Intelligence
          </div>
          <h1 className="lp-hero-title">AgriSense</h1>
          <p className="lp-hero-subtitle">
            Transforming Field Conversations into<br />Actionable Intelligence
          </p>
          <p className="lp-hero-desc">
            Capture, structure, and preserve knowledge from every farmer interaction.<br />
            Built for India's 25M+ floriculture workforce.
          </p>
          <Link to="/login" className="lp-hero-btn">Get Started</Link>
        </div>

        <div className="lp-hero-img-wrap">
          <img
            src="https://cdn.britannica.com/20/98420-050-5BAC8BA8/worker-ranunculus-field-flower-farm-Calif-Carlsbad-April-2006.jpg"
            alt="Floriculture farm workers tending to flowers"
            className="lp-hero-img"
          />
          <div className="lp-hero-img-overlay" />
        </div>
      </section>

      {/* ── Stats ───────────────────────────────────────────── */}
      <section className="lp-stats">
        <div className="lp-stats-inner">
          <div className="lp-stat">
            <div className="lp-stat-value">33%</div>
            <div className="lp-stat-label">of India's Agriculture GDP</div>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <div className="lp-stat-value">25M+</div>
            <div className="lp-stat-label">People Employed in Floriculture</div>
          </div>
          <div className="lp-stat-divider" />
          <div className="lp-stat">
            <div className="lp-stat-value">3</div>
            <div className="lp-stat-label">Languages Supported</div>
          </div>
        </div>
      </section>

      {/* ── Problem / Features ──────────────────────────────── */}
      <section className="lp-features">
        <div className="lp-section-inner">
          <h2 className="lp-section-title">The Problem We Solve</h2>
          <p className="lp-section-sub">
            Field operations remain manual. Data is lost. Knowledge disappears.<br />
            <span className="lp-accent">AgriSense changes everything.</span>
          </p>

          <div className="lp-feature-grid">
            {FEATURES.map((f, i) => (
              <div className="lp-feature-card" key={i}>
                <div className="lp-feature-icon" style={{ background: `${f.color}18`, border: `1px solid ${f.color}30` }}>
                  <span style={{ color: f.color }}>{f.icon}</span>
                </div>
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery ─────────────────────────────────────────── */}
      <section className="lp-gallery">
        <div className="lp-section-inner">
          <h2 className="lp-section-title">Empowering India's Floriculture Sector</h2>
          <div className="lp-gallery-grid">
            {GALLERY.map((img, i) => (
              <div className="lp-gallery-item" key={i}>
                <img src={img.url} alt={img.alt} loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Footer ──────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-inner">
          <h2 className="lp-cta-title">Ready to Transform Your Field<br />Operations?</h2>
          <p className="lp-cta-sub">
            Join the future of Floriculture Farm management with AI-powered conversation intelligence.
          </p>
          <Link to="/login" className="lp-cta-btn">Get Started Free</Link>
        </div>
      </section>
    </div>
  );
}
