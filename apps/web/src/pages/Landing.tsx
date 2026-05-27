import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AfricaGlobe } from '../components/AfricaGlobe';
import {
  Store,
  Coins,
  Mic,
  Landmark,
  Smartphone,
  QrCode,
  Zap,
  Bot,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  ArrowUpRight,
  TrendingUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

function SokoLogoMark({ className = "logo-svg", swapped = false }: { className?: string; swapped?: boolean }) {
  const topColor = swapped ? "#C4622D" : "#FAF7F2";
  const bottomColor = swapped ? "#FAF7F2" : "#C4622D";
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Top Curve (Forward C) */}
      <path
        d="M 75 24 H 48 C 34 24 24 34 24 48 H 40"
        stroke={topColor}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bottom Curve (Backward C) */}
      <path
        d="M 25 76 H 52 C 66 76 76 66 76 52 H 60"
        stroke={bottomColor}
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [activeCard, setActiveCard] = useState(0);

  const handleOpenApp = () => {
    const token = localStorage.getItem('sokopay_token');
    if (token) {
      navigate('/dashboard');
    } else {
      navigate('/onboarding');
    }
  };

  const steps = [
    {
      title: "Create and Setup",
      description: "Sign up in 60 seconds. Phone number, OTP, business name. Your AI agent wallet is live on Celo — no crypto knowledge needed.",
      icon: <Smartphone className="w-6 h-6" />,
      bgColor: "#F2EDE4" // Warm cream/beige
    },
    {
      title: "Share Your QR",
      description: "Print or share your business QR. Customers pay in local currencies (NGN/KES) seamlessly via bank transfer or mobile money.",
      icon: <QrCode className="w-6 h-6" />,
      bgColor: "#FCEAE2" // Soft brand peach
    },
    {
      title: "Receive cUSD Instantly",
      description: "Payments convert automatically to cUSD onchain. Protected from inflation and local currency devaluation.",
      icon: <Zap className="w-6 h-6" />,
      bgColor: "#E5EDDB" // Soft olive green
    },
    {
      title: "AI Agent Autopilot",
      description: "Your agent tracks sales, pays suppliers, and follows up on invoices in English, Swahili, or Pidgin.",
      icon: <Bot className="w-6 h-6" />,
      bgColor: "#EAE5DB" // Warm sandstone/beige
    }
  ];

  const nextCard = () => {
    setActiveCard((prev) => (prev + 1) % steps.length);
  };

  const prevCard = () => {
    setActiveCard((prev) => (prev - 1 + steps.length) % steps.length);
  };

  useEffect(() => {
    // Auto rotation for step cards
    const interval = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % steps.length);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Inject custom class on body to hide default cursor
    document.body.classList.add('landing-page-active');

    // Create cursor elements dynamically
    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.id = 'cursor';

    const ring = document.createElement('div');
    ring.className = 'custom-cursor-ring';
    ring.id = 'cursorRing';

    document.body.appendChild(cursor);
    document.body.appendChild(ring);

    let mouseX = 0, mouseY = 0;
    let ringX = 0, ringY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const gsap = (window as any).gsap;
      if (gsap && cursor) {
        gsap.to(cursor, { x: mouseX, y: mouseY, duration: 0.1 });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    let animationFrameId: number;
    const animateRing = () => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      if (ring) {
        ring.style.left = ringX + 'px';
        ring.style.top = ringY + 'px';
      }
      animationFrameId = requestAnimationFrame(animateRing);
    };
    animateRing();

    const addHoverClass = () => {
      cursor.classList.add('hover');
      ring.classList.add('hover');
    };

    const removeHoverClass = () => {
      cursor.classList.remove('hover');
      ring.classList.remove('hover');
    };

    const interactiveElements = document.querySelectorAll('a, button, input, select');
    interactiveElements.forEach(el => {
      el.addEventListener('mouseenter', addHoverClass);
      el.addEventListener('mouseleave', removeHoverClass);
    });

    // Scroll Navbar effect
    const handleScroll = () => {
      const nav = document.getElementById('nav');
      if (nav) {
        nav.classList.toggle('scrolled', window.scrollY > 60);
      }
    };
    window.addEventListener('scroll', handleScroll);

    // Initialize GSAP Animations
    const gsap = (window as any).gsap;
    const ScrollTrigger = (window as any).ScrollTrigger;

    if (gsap && ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);

      // Hero Timeline
      const tl = gsap.timeline({ delay: 0.2 });

      tl.to('.hero-tag', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' })
        .to('.hero-headline .line-inner', {
          y: 0,
          duration: 0.9,
          stagger: 0.12,
          ease: 'power4.out'
        }, '-=0.3')
        .to('.hero-sub', { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.4')
        .to('.hero-actions', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.4')
        .to('.card-ai-1', { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3')
        .to('.card-user', { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3')
        .to('.card-ai-2', { opacity: 1, x: 0, duration: 0.5, ease: 'power2.out' }, '-=0.3');

      // Scroll Fade Ups
      gsap.utils.toArray('.fade-up').forEach((el: any) => {
        gsap.to(el, {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            toggleActions: 'play none none none'
          }
        });
      });



      // Country Items Stagger
      gsap.from('.country-item', {
        y: 15,
        duration: 0.6,
        stagger: 0.06,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.countries',
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });

      // Globe enter animation
      gsap.from('.africa-globe', {
        scale: 0.8,
        duration: 1.2,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.countries',
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });

      // Stat numbers counter
      gsap.utils.toArray('[data-count]').forEach((el: any) => {
        const target = parseInt(el.getAttribute('data-count'));
        ScrollTrigger.create({
          trigger: el,
          start: 'top 80%',
          onEnter: () => {
            gsap.to({ val: 0 }, {
              val: target,
              duration: 2,
              ease: 'power2.out',
              onUpdate: function () {
                el.textContent = Math.round((this as any).targets()[0].val) + 'M';
              }
            });
          }
        });
      });

      // Quote Parallax
      gsap.to('.quote-mark', {
        y: -40,
        ease: 'none',
        scrollTrigger: {
          trigger: '.quote-section',
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1.5
        }
      });

      // Refresh ScrollTrigger after layout paint
      setTimeout(() => {
        ScrollTrigger.refresh();
      }, 1000);
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
      document.body.classList.remove('landing-page-active');
      if (document.body.contains(cursor)) document.body.removeChild(cursor);
      if (document.body.contains(ring)) document.body.removeChild(ring);
      if (ScrollTrigger) {
        ScrollTrigger.getAll().forEach((t: any) => t.kill());
      }
    };
  }, []);

  const getCardStyle = (index: number) => {
    const isMobile = window.innerWidth < 768;

    // Find the position relative to the active card in the loop
    const relIndex = (index - activeCard + steps.length) % steps.length;

    let left = '';
    let zIndex = 0;
    let scale = 1.0;
    let opacity = 1;

    if (relIndex === 0) {
      // Active card at the front (left/center of the stack)
      left = isMobile ? 'calc(50% - 130px)' : 'calc(50% - 220px)';
      zIndex = 100;
      scale = 1.0;
      opacity = 1;
    } else {
      // Stacked cards to the right
      const offset = isMobile ? 20 : 35;
      const baseLeft = isMobile ? 'calc(50% - 130px)' : 'calc(50% - 220px)';
      left = `calc(${baseLeft} + ${relIndex * offset}px)`;
      zIndex = 100 - relIndex;
      scale = 1.0 - (relIndex * 0.04);
      opacity = 1.0 - (relIndex * 0.15);
    }

    return {
      left,
      zIndex,
      transform: `scale(${scale})`,
      opacity
    };
  };

  return (
    <div className="landing-container">
      {/* Scope styles inside the landing component */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .landing-page-active {
          cursor: none !important;
        }
        .landing-page-active a, 
        .landing-page-active button, 
        .landing-page-active input, 
        .landing-page-active select {
          cursor: none !important;
        }
        
        .landing-container {
          background: #FAF7F2;
          color: #1A1208;
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          width: 100%;
          position: relative;
        }
        .nobr {
          white-space: nowrap;
        }

        /* CUSTOM CURSOR */
        .custom-cursor {
          width: 12px; height: 12px;
          background: #C4622D;
          border-radius: 50%;
          position: fixed;
          top: 0; left: 0;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          transition: transform 0.1s, width 0.3s, height 0.3s, background 0.3s;
        }
        .custom-cursor-ring {
          width: 40px; height: 40px;
          border: 1.5px solid #C4622D;
          border-radius: 50%;
          position: fixed;
          top: 0; left: 0;
          pointer-events: none;
          z-index: 9998;
          transform: translate(-50%, -50%);
          transition: transform 0.15s ease-out, width 0.3s, height 0.3s, opacity 0.3s;
          opacity: 0.6;
        }
        .custom-cursor.hover { width: 20px; height: 20px; background: #1A1208; }
        .custom-cursor-ring.hover { width: 60px; height: 60px; opacity: 0.3; }

        /* NAV */
        .landing-nav {
          position: fixed; top: 0; left: 0; right: 0;
          z-index: 1000;
          padding: 20px 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: transparent;
          transition: background 0.4s, backdrop-filter 0.4s;
        }
        .landing-nav.scrolled {
          background: rgba(26, 18, 8, 0.92) !important;
          backdrop-filter: blur(12px) !important;
          border-bottom: 1px solid rgba(221, 213, 197, 0.15) !important;
        }
        .nav-logo {
          font-family: 'Sora', sans-serif;
          font-size: 22px;
          font-weight: 800;
          color: #FAF7F2 !important;
          text-decoration: none;
          letter-spacing: -0.5px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .nav-logo span { color: #FAF7F2 !important; }
        .logo-svg {
          width: 34px;
          height: 34px;
          flex-shrink: 0;
        }
        .nav-links {
          display: flex; gap: 36px; list-style: none;
          align-items: center;
        }
        .nav-links a {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #DDD5C5 !important;
          text-decoration: none;
          transition: color 0.2s;
        }
        .nav-links a:hover { color: #FAF7F2 !important; }
        .nav-cta {
          background: #FAF7F2;
          color: #1A1208 !important;
          padding: 10px 24px;
          font-size: 14px !important;
          font-weight: 700 !important;
          text-decoration: none;
          border: none;
          transition: background 0.2s, box-shadow 0.2s !important;
          box-shadow: 3px 3px 0 #C4622D;
        }
        .nav-cta:hover {
          background: #C4622D !important;
          box-shadow: 3px 3px 0 #FAF7F2 !important;
          color: #FAF7F2 !important;
        }

        /* HERO LAYOUT */
        .hero {
          min-height: 70vh;
          display: grid;
          grid-template-columns: 1.25fr 1fr;
          align-items: center;
          justify-content: center;
          padding: 110px 48px 0px;
          position: relative;
          gap: 48px;
          overflow: hidden;
          background: #1A1208; /* Dark base fallback */
        }
        
        .hero-bg-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          z-index: 0;
          pointer-events: none;
        }
        
        .hero-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to right, 
            rgba(13, 8, 3, 0.96) 0%, 
            rgba(13, 8, 3, 0.85) 30%, 
            rgba(13, 8, 3, 0.6) 70%,
            rgba(13, 8, 3, 0.4) 100%
          );
          z-index: 1;
          pointer-events: none;
        }
        
        .hero-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          z-index: 5;
        }

        .hero-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #FAF7F2;
          background: rgba(196,98,45,0.2);
          border: 1px solid rgba(196,98,45,0.3);
          padding: 6px 16px;
          margin-bottom: 24px;
          opacity: 0;
          position: relative;
          z-index: 1;
        }

        .hero-headline {
          font-family: 'Sora', sans-serif;
          font-size: clamp(38px, 5.2vw, 72px);
          font-weight: 800;
          line-height: 1.0;
          letter-spacing: -2.5px;
          text-align: left;
          max-width: 600px;
          color: #FAF7F2;
          position: relative;
          z-index: 1;
          overflow: hidden;
        }

        .hero-headline .line {
          display: block;
          overflow: hidden;
        }

        .hero-headline .line-inner {
          display: block;
          transform: translateY(100%);
        }

        .hero-headline .accent { color: #C4622D; }

        .hero-sub {
          font-size: 17px;
          font-weight: 400;
          color: #DDD5C5;
          text-align: left;
          max-width: 540px;
          line-height: 1.6;
          margin-top: 24px;
          opacity: 0;
          position: relative;
          z-index: 1;
        }

        .hero-actions {
          display: flex;
          gap: 16px;
          margin-top: 36px;
          opacity: 0;
          position: relative;
          z-index: 1;
        }

        .btn-primary {
          background: #C4622D;
          color: #FAF7F2;
          font-family: 'Sora', sans-serif;
          font-size: 15px;
          font-weight: 700;
          padding: 16px 36px;
          text-decoration: none;
          border: none;
          box-shadow: 4px 4px 0 #1A1208;
          transition: transform 0.15s, box-shadow 0.15s, background 0.2s;
          letter-spacing: -0.3px;
        }
        .btn-primary:hover {
          transform: translate(-2px, -2px);
          box-shadow: 6px 6px 0 #1A1208;
          background: #A8501F;
        }
        .btn-primary:active {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 #1A1208;
        }

        .btn-secondary {
          background: transparent;
          color: #FAF7F2;
          font-family: 'Sora', sans-serif;
          font-size: 15px;
          font-weight: 600;
          padding: 16px 36px;
          text-decoration: none;
          border: 1.5px solid #FAF7F2;
          transition: background 0.2s, color 0.2s;
          letter-spacing: -0.3px;
        }
        .btn-secondary:hover {
          background: #FAF7F2;
          color: #1A1208;
        }

        /* HERO VISUAL COLUMN (Right Floating Overlays) */
        .hero-visual-right {
          position: relative;
          width: 100%;
          height: 380px;
          z-index: 5;
        }

        /* Chat Overlays */
        .chat-overlay {
          position: absolute;
          background: #FAF7F2;
          border: 2px solid #1A1208;
          border-radius: 14px;
          padding: 12px 16px;
          box-shadow: 5px 5px 0px #1A1208;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          max-width: 250px;
          opacity: 0;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .chat-overlay:hover {
          transform: translate(-2px, -2px);
          box-shadow: 7px 7px 0px #C4622D;
        }
        .chat-avatar {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #C4622D;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #FAF7F2;
          border: 1.5px solid #1A1208;
          flex-shrink: 0;
        }
        .chat-sender {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          font-weight: 700;
          color: #C4622D;
          margin-bottom: 2px;
        }
        .chat-text {
          font-family: 'DM Sans', sans-serif;
          font-size: 12px;
          color: #1A1208;
          line-height: 1.4;
        }
        .chat-link {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #5C6B3A;
          text-decoration: none;
          font-weight: 700;
          display: inline-block;
          margin-top: 6px;
        }
        .chat-icon {
          width: 14px;
          height: 14px;
        }
        
        /* Specific Placements inside right column */
        .card-ai-1 {
          top: 8%;
          left: 10%;
          background: #1A1208;
          color: #FAF7F2;
          border-color: #FAF7F2;
          box-shadow: 5px 5px 0px rgba(196,98,45,0.7);
          transform: translateX(30px);
        }
        .card-ai-1 .chat-text { color: #FAF7F2; }
        .card-ai-1 .chat-sender { color: #FAF7F2; }
        
        .card-user {
          top: 38%;
          right: 8%;
          background: #D8E6C9; 
          border-color: #1A1208;
          border-radius: 14px 14px 0px 14px;
          box-shadow: 5px 5px 0px #1A1208;
          max-width: 220px;
          transform: translateX(-30px);
          padding: 10px 14px;
        }
        
        .card-ai-2 {
          bottom: 8%;
          left: 15%;
          background: #FAF7F2;
          border-color: #1A1208;
          box-shadow: 5px 5px 0px #1A1208;
          max-width: 240px;
          transform: translateX(30px);
        }

        /* HERO FEATURES BAR (ABSOLUTE BOTTOM) */
        .hero-features-bar-absolute {
          grid-column: 1 / -1;
          background: rgba(26, 18, 8, 0.55);
          backdrop-filter: blur(12px);
          border-top: 1.5px solid rgba(221, 213, 197, 0.15);
          border-bottom: none;
          border-left: none;
          border-right: none;
          border-radius: 0;
          padding: 16px 48px;
          z-index: 10;
          margin-top: 10px;
          margin-left: -48px;
          margin-right: -48px;
          width: auto;
          margin-bottom: 0px;
        }
        .flex-bar {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .hf-item {
          display: flex;
          align-items: center;
          gap: 14px;
          color: #FAF7F2;
        }
        .hf-icon {
          color: #FAF7F2;
          background: none !important;
          background-color: transparent !important;
          border: 1.5px solid #C4622D;
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 2px 2px 0px #C4622D;
        }
        .hf-text {
          display: flex;
          flex-direction: column;
          text-align: left;
        }
        .hf-text strong {
          font-family: 'Sora', sans-serif;
          font-size: 13px;
          font-weight: 700;
          color: #FAF7F2;
          letter-spacing: -0.2px;
        }
        .hf-text span {
          font-size: 12px;
          color: #7A6B55;
        }

        /* TICKER BELOW HERO */
        .ticker-wrap {
          background: #1A1208;
          padding: 14px 0;
          overflow: hidden;
          position: relative;
          z-index: 2;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .ticker {
          display: flex;
          white-space: nowrap;
          animation: ticker 30s linear infinite;
        }
        .ticker-item {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          padding: 0 40px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 1px;
          color: rgba(250,247,242,0.5);
          text-transform: uppercase;
        }
        .ticker-item .dot {
          width: 4px; height: 4px;
          background: #C4622D;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .ticker-item strong { color: #FAF7F2; }
        
        @keyframes ticker {
          0% {
            transform: translate3d(0, 0, 0);
          }
          100% {
            transform: translate3d(-50%, 0, 0);
          }
        }

        /* SECTION BASE */
        section { padding: 120px 48px; }
        .section-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #C4622D;
          margin-bottom: 16px;
          display: block;
        }
        .section-title {
          font-family: 'Sora', sans-serif;
          font-size: clamp(36px, 4vw, 56px);
          font-weight: 800;
          letter-spacing: -2px;
          line-height: 1.05;
          max-width: 640px;
        }

        /* HOW IT WORKS (SHUFFLING CAROUSEL STACK) */
        .how {
          background: #1A1208;
          color: #FAF7F2;
          overflow: hidden;
        }
        .how-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 48px;
          max-width: 1200px;
          margin-left: auto;
          margin-right: auto;
          text-align: left;
        }
        .how-nav-buttons {
          display: flex;
          gap: 12px;
          z-index: 10;
        }
        .how-nav-btn {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid #FAF7F2;
          background: #1A1208;
          color: #FAF7F2;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 2px 2px 0px #C4622D;
          transition: transform 0.15s, box-shadow 0.15s, background 0.2s;
        }
        .how-nav-btn:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px #FAF7F2;
          background: #FAF7F2;
          color: #1A1208;
        }
        .how-nav-btn:active {
          transform: translate(1px, 1px);
          box-shadow: 1px 1px 0px #FAF7F2;
        }
        .how-stack-container {
          position: relative;
          height: 300px;
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          overflow: visible;
        }
        .how-card {
          position: absolute;
          width: 380px;
          height: 240px;
          border-radius: 20px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-shadow: 6px 6px 0px rgba(250, 247, 242, 0.12);
          cursor: pointer;
        }
        .how-card-num {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 2px solid #1A1208;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          font-size: 13px;
          color: #1A1208;
        }
        .how-card-icon-wrap {
          color: #1A1208;
        }
        .how-card-content {
          margin-top: 16px;
          text-align: left;
        }
        .how-card-content h3 {
          font-family: 'Sora', sans-serif;
          font-size: 18px;
          font-weight: 700;
          color: #1A1208;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }
        .how-card-content p {
          font-size: 13px;
          color: rgba(26, 18, 8, 0.75);
          line-height: 1.4;
        }

        /* FEATURES */
        .features { 
          background: #FAF7F2; 
          padding-bottom: 40px;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2px;
          margin-top: 64px;
        }

        .feature-card {
          background: #F2EDE4;
          border: 1px solid #DDD5C5;
          padding: 40px;
          position: relative;
          overflow: hidden;
          box-shadow: 3px 3px 0 #DDD5C5;
          transition: box-shadow 0.2s, transform 0.2s;
        }
        .feature-card:hover {
          box-shadow: 6px 6px 0 #C4622D;
          transform: translate(-2px, -2px);
        }
        .feature-card .card-icon-box {
          width: 48px; height: 48px;
          background: transparent;
          display: flex; align-items: center; justify-content: center;
          color: #1A1208;
          margin-bottom: 24px;
          border: 2px solid #C4622D;
          box-shadow: 3px 3px 0px #C4622D;
        }
        .feature-card h3 {
          font-family: 'Sora', sans-serif;
          font-size: 20px;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin-bottom: 12px;
        }
        .feature-card p {
          font-size: 14px;
          color: #7A6B55;
          line-height: 1.7;
        }
        .feature-card .card-tag {
          position: absolute;
          top: 16px; right: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 9px;
          letter-spacing: 2px;
          text-transform: uppercase;
          background: #C4622D;
          color: #FAF7F2;
          padding: 3px 8px;
        }

        /* STATS */
        .stats {
          background: #C4622D;
          padding: 80px 48px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .stat {
          padding: 48px 40px;
          border-right: 1px solid rgba(255,255,255,0.2);
          position: relative;
        }
        .stat:last-child { border-right: none; }
        .stat-num {
          font-family: 'Sora', sans-serif;
          font-size: clamp(36px, 4vw, 56px);
          font-weight: 800;
          color: #FAF7F2;
          letter-spacing: -2px;
          display: block;
          line-height: 1;
          margin-bottom: 8px;
        }
        .stat-label {
          font-size: 13px;
          color: rgba(255,255,255,0.65);
          font-weight: 400;
          letter-spacing: 0.3px;
        }

        /* TESTIMONIAL / QUOTE */
        .quote-section {
          padding: 40px 48px 80px;
          background: #FAF7F2;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .quote-inner {
          max-width: 900px;
          text-align: center;
        }
        .quote-mark {
          font-family: 'Sora', sans-serif;
          font-size: 120px;
          color: #C4622D;
          line-height: 0.8;
          display: block;
          margin-bottom: 16px;
          opacity: 0.3;
        }
        .quote-text {
          font-family: 'Sora', sans-serif;
          font-size: clamp(24px, 3vw, 40px);
          font-weight: 700;
          letter-spacing: -1.5px;
          line-height: 1.2;
          color: #1A1208;
          margin-bottom: 32px;
        }
        .quote-attr {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #7A6B55;
        }

        /* COUNTRIES SECTION (UPDATED PREMIUM MAP LAYOUT) */
        .countries {
          background: #130D06; /* Maintain dark base */
          padding: 100px 48px;
          border-top: 1px solid rgba(255,255,255,0.03);
          border-bottom: 1px solid rgba(255,255,255,0.03);
          overflow: hidden;
          position: relative;
        }
        .countries-inner {
          display: grid;
          grid-template-columns: 1.4fr 1.2fr 1.1fr;
          align-items: center;
          gap: 64px;
          max-width: 1400px;
          width: 100%;
          margin: 0 auto;
        }
        .countries-left {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
        }
        .countries-left-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #C4622D;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 16px;
        }
        .countries-left h2 {
          font-family: 'Sora', sans-serif;
          font-size: clamp(32px, 3.5vw, 48px);
          font-weight: 800;
          color: #FAF7F2;
          line-height: 1.2;
          letter-spacing: -1.5px;
          margin: 0 0 24px 0;
        }
        .countries-left h2 span {
          color: #C4622D;
          text-shadow: 0 0 20px rgba(196,98,45,0.25);
        }
        .countries-desc {
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          line-height: 1.6;
          color: #DDD5C5;
          margin: 0;
          opacity: 0.85;
        }
        
        /* Map Globe styling */
        .countries-map {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }
        .globe-wrapper {
          width: 100%;
          max-width: 420px;
          aspect-ratio: 1;
          position: relative;
          filter: drop-shadow(0px 0px 40px rgba(196,98,45,0.08));
        }
        .africa-globe {
          width: 100%;
          height: 100%;
        }
        .globe-bg {
          fill: #140E07;
          stroke: rgba(250, 247, 242, 0.15);
          stroke-width: 1.5;
        }
        .globe-path {
          stroke: rgba(250, 247, 242, 0.2);
          stroke-width: 0.8;
          transition: fill 0.3s, stroke 0.3s;
        }
        .other-country {
          fill: rgba(250, 247, 242, 0.05);
        }
        .africa-country {
          fill: rgba(250, 247, 242, 0.15);
          stroke: rgba(250, 247, 242, 0.35);
          stroke-width: 0.8;
        }
        .special-active {
          fill: rgba(196, 98, 45, 0.3);
          stroke: #C4622D;
          stroke-width: 1.5;
        }
        .globe-path.ng.special-active {
          fill: rgba(196, 98, 45, 0.35) !important;
          stroke: #C4622D !important;
          stroke-width: 1.8px !important;
        }
        .globe-path.ke.special-active {
          fill: rgba(92, 107, 58, 0.35) !important;
          stroke: #8CA35C !important;
          stroke-width: 1.8px !important;
        }
        
        /* Glow animations */
        .marker-group {
          pointer-events: none;
        }
        .pulse-dot {
          fill: #C4622D;
          filter: drop-shadow(0 0 8px #C4622D);
        }
        .pulse-ring {
          fill: none;
          stroke: #C4622D;
          stroke-width: 1.5;
          transform-origin: center;
          animation: pulseGlow 2.5s infinite ease-out;
        }
        .ke-marker .pulse-dot, .ke-marker .pulse-ring {
          fill: #5C6B3A; /* Active Green for Kenya */
          stroke: #5C6B3A;
          filter: drop-shadow(0 0 8px #5C6B3A);
        }
        .ng-marker .pulse-dot, .ng-marker .pulse-ring {
          fill: #C4622D; /* Active Orange for Nigeria */
          stroke: #C4622D;
          filter: drop-shadow(0 0 8px #C4622D);
        }
        
        @keyframes pulseGlow {
          0% {
            transform: scale(0.6);
            opacity: 1;
            stroke-width: 3;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
            stroke-width: 0.5;
          }
        }
        
        /* Right Column Countries list */
        .countries-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 24px;
          position: relative;
        }
        .countries-list-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          text-align: right;
          width: 180px;
        }
        .country-item {
          font-family: 'Sora', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: rgba(250, 247, 242, 0.35);
          transition: color 0.25s, font-weight 0.25s, transform 0.25s;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          cursor: default;
          opacity: 0.35; /* Progressive enhancement: show faint by default */
        }
        .country-item.active {
          color: #FAF7F2;
          font-weight: 700;
          font-size: 18px;
          transform: translateX(-4px);
          opacity: 1; /* Fully opaque active state */
        }
        .country-item.active.ng-item {
          color: #C4622D;
        }
        .country-item.active.ke-item {
          color: #D8E6C9; /* brand green secondary */
        }
        .country-item .soon-tag {
          font-family: 'JetBrains Mono', monospace;
          font-size: 8px;
          letter-spacing: 0.5px;
          color: rgba(250, 247, 242, 0.15);
          text-transform: uppercase;
        }
        
        /* Ticks/scale axis */
        .scale-axis {
          height: 240px;
          width: 12px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: center;
          position: relative;
        }
        .scale-axis-line {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1.5px;
          background: rgba(250, 247, 242, 0.08);
          left: 50%;
          transform: translateX(-50%);
          z-index: 1;
        }
        .scale-tick {
          width: 6px;
          height: 1.5px;
          background: rgba(250, 247, 242, 0.2);
          z-index: 2;
          transition: width 0.25s, background 0.25s;
        }
        .scale-tick.active {
          width: 12px;
          height: 2px;
          background: #FAF7F2;
        }
        .scale-tick.active.ng-tick {
          background: #C4622D;
        }
        .scale-tick.active.ke-tick {
          background: #D8E6C9;
        }

        /* CTA SECTION */
        .cta-section {
          padding: 120px 48px 60px;
          background: #FAF7F2;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .cta-bg {
          position: absolute;
          bottom: -100px; left: 50%; transform: translateX(-50%);
          width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(196,98,45,0.06) 0%, transparent 70%);
          pointer-events: none;
        }
        .cta-section h2 {
          font-family: 'Sora', sans-serif;
          font-size: clamp(48px, 6vw, 80px);
          font-weight: 800;
          letter-spacing: -3px;
          line-height: 0.95;
          max-width: 720px;
          margin: 0 auto 40px;
          position: relative;
          z-index: 1;
        }
        .cta-section h2 span { color: #C4622D; }
        .cta-section p {
          font-size: 18px;
          color: #7A6B55;
          max-width: 440px;
          margin: 0 auto 48px;
          line-height: 1.6;
          position: relative;
          z-index: 1;
        }
        .cta-actions {
          display: flex; gap: 16px;
          justify-content: center;
          position: relative; z-index: 1;
        }
        .cta-section .btn-secondary {
          color: #1A1208;
          border-color: #1A1208;
        }
        .cta-section .btn-secondary:hover {
          background: #1A1208;
          color: #FAF7F2;
        }

        /* FOOTER */
        .landing-footer {
          background: rgba(26, 18, 8, 0.92);
          backdrop-filter: blur(12px);
          padding: 80px 64px 40px;
          border-radius: 64px 64px 0 0;
          position: relative;
          color: #FAF7F2;
          display: grid;
          grid-template-columns: 1fr 1.5fr 1fr;
          gap: 40px;
          margin-top: 64px;
          border-top: none;
        }

        .footer-logo-wrap {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(26, 18, 8, 0.75);
          backdrop-filter: blur(8px);
          border-radius: 50%;
          padding: 0;
          border: 1.5px solid rgba(250, 247, 242, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 120px;
          height: 120px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
          z-index: 10;
        }

        .footer-logo-large {
          width: 80px;
          height: 80px;
          flex-shrink: 0;
        }
        
        .footer-center-content {
          grid-column: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          margin-top: 24px;
        }
        
        .footer-title {
          font-family: 'Sora', sans-serif;
          font-size: 38px;
          font-weight: 800;
          letter-spacing: -1.5px;
          color: #FAF7F2;
          margin-bottom: 8px;
        }
        
        .footer-tagline {
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-style: italic;
          color: #7A6B55;
          margin-bottom: 32px;
          font-weight: 400;
        }
        
        .footer-actions-centered {
          display: flex;
          gap: 16px;
          justify-content: center;
        }
        
        .footer-actions-centered .btn-pill-primary {
          background: #C4622D;
          color: #FAF7F2;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 700;
          padding: 12px 28px;
          border-radius: 30px;
          border: none;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s;
        }
        .footer-actions-centered .btn-pill-primary:hover {
          transform: translateY(-2px);
          background: #A8501F;
        }
        
        .footer-actions-centered .btn-pill-secondary {
          background: transparent;
          color: #FAF7F2;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 600;
          padding: 12px 28px;
          border-radius: 30px;
          border: 1.5px solid #FAF7F2;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s, color 0.2s;
          text-decoration: none;
          display: inline-block;
        }
        .footer-actions-centered .btn-pill-secondary:hover {
          transform: translateY(-2px);
          background: #FAF7F2;
          color: #1A1208;
        }

        .footer-left-col {
          grid-column: 1;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          text-align: left;
          justify-content: flex-end;
        }
        
        .footer-col-title {
          font-family: 'Sora', sans-serif;
          font-size: 16px;
          font-weight: 700;
          color: #FAF7F2;
          margin-bottom: 12px;
        }
        
        .footer-contact-details {
          font-size: 13px;
          color: #7A6B55;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        
        .footer-contact-details a {
          color: #FAF7F2;
          text-decoration: underline;
        }

        .footer-social-links {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .footer-social-links a {
          font-size: 13px;
          color: rgba(250, 247, 242, 0.65);
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: color 0.2s;
        }
        .footer-social-links a:hover {
          color: #C4622D;
        }
        .footer-social-links a span {
          font-size: 10px;
          color: #C4622D;
        }

        .footer-right-col {
          grid-column: 3;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          text-align: right;
          justify-content: flex-end;
        }
        
        .footer-nav-links {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 40px;
        }
        .footer-nav-links a {
          font-size: 13px;
          color: rgba(250, 247, 242, 0.65);
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-nav-links a:hover {
          color: #FAF7F2;
        }

        /* Bottom Capsule info */
        .footer-capsule {
          background: #FAF7F2;
          border-radius: 30px;
          padding: 8px 18px;
          display: inline-flex;
          align-items: center;
          gap: 14px;
          color: #1A1208;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2px;
        }
        .footer-capsule a {
          color: #1A1208;
          text-decoration: none;
          transition: opacity 0.2s;
        }
        .footer-capsule a:hover {
          opacity: 0.7;
        }
        .footer-capsule .divider {
          color: rgba(26, 18, 8, 0.2);
        }

        @media (max-width: 991px) {
          .hero {
            grid-template-columns: 1fr;
            padding-top: 120px;
            padding-bottom: 0px;
            gap: 40px;
            text-align: center;
          }
          .hero-content {
            align-items: center;
          }
          .hero-headline {
            text-align: center;
          }
          .hero-sub {
            text-align: center;
            margin-left: auto;
            margin-right: auto;
          }
          .hero-actions {
            justify-content: center;
          }
          .hero-features-bar-absolute {
            margin-top: 10px;
            padding: 12px 48px;
            border-top: 1.5px solid rgba(221, 213, 197, 0.15);
            border-bottom: none;
            border-left: none;
            border-right: none;
            border-radius: 0;
            margin-left: -48px;
            margin-right: -48px;
            background: rgba(26, 18, 8, 0.85);
          }
          .flex-bar {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          
          .how-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 20px;
          }
          .how-stack-container {
            height: 280px;
            display: flex;
            justify-content: center;
          }
          .how-card {
            width: 280px;
            height: 200px;
          }
          
          /* Countries Responsive Rules */
          .countries-inner {
            grid-template-columns: 1fr;
            gap: 48px;
            text-align: center;
          }
          .countries-left {
            align-items: center;
            text-align: center;
          }
          .countries-right {
            justify-content: center;
          }
          .countries-list-container {
            text-align: center;
            align-items: center;
          }
          .country-item {
            justify-content: center;
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .landing-nav { padding: 16px 24px; }
          .nav-links { display: none; }
          section { padding: 80px 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .stats-grid { grid-template-columns: 1fr 1fr; }
          .countries-inner { grid-template-columns: 1fr !important; }
          .landing-footer {
            grid-template-columns: 1fr;
            gap: 48px;
            padding: 80px 24px 40px;
            border-radius: 40px 40px 0 0;
            text-align: center;
          }
          .footer-center-content {
            grid-column: 1;
            margin-top: 16px;
          }
          .footer-left-col {
            grid-column: 1;
            align-items: center;
            text-align: center;
          }
          .footer-right-col {
            grid-column: 1;
            align-items: center;
            text-align: center;
          }
          .footer-nav-links {
            margin-bottom: 24px;
            align-items: center;
          }
          .hero-actions, .cta-actions { flex-direction: column; align-items: center; }
          .hero-features-bar-absolute {
            padding: 16px 24px;
            margin-left: -24px;
            margin-right: -24px;
          }
          .flex-bar {
            grid-template-columns: 1fr;
            gap: 12px;
          }
        }
        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr; }
        }

        /* GSAP INIT STATES */
        .fade-up { opacity: 0; transform: translateY(40px); }
        .fade-in { opacity: 0; }
      ` }} />

      {/* NAV */}
      <nav id="nav" className="landing-nav">
        <a href="#" className="nav-logo">
          <SokoLogoMark />
          <span>SokoPay</span>
        </a>
        <ul className="nav-links">
          <li><a href="#how">How it works</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="#countries">Countries</a></li>
          <li><button onClick={handleOpenApp} className="nav-cta">Open App →</button></li>
        </ul>
      </nav>

      {/* HERO */}
      <section className="hero" id="hero">
        {/* Full-width Hardware Accelerated Crisp Image Tag */}
        <img src="/Hero_bg.png?v=4" alt="SokoPay Merchants" className="hero-bg-img" />

        <div className="hero-overlay"></div>

        <div className="hero-content">
          <div className="hero-tag fade-in">Built on Celo · Powered by AI · Made for Africa</div>

          <h1 className="hero-headline">
            <span className="line"><span className="line-inner">Your market.</span></span>
            <span className="line"><span className="line-inner accent">Your money.</span></span>
            <span className="line"><span className="line-inner">Your agent.</span></span>
          </h1>

          <p className="hero-sub">
            SokoPay is the AI financial back-office for informal merchants.
            Accept Naira or Shillings. Receive cUSD onchain. Let your agent
            handle everything else.
          </p>

          <div className="hero-actions">
            <button onClick={handleOpenApp} className="btn-primary">Start Selling →</button>
            <a href="#how" className="btn-secondary">See How It Works</a>
          </div>
        </div>

        {/* HERO VISUAL (Right Column Overlay Cards) */}
        <div className="hero-visual-right">
          {/* Interactive Chat Overlay Bubbles */}
          <div className="chat-overlay card-ai-1">
            <div className="chat-avatar">
              <Bot className="chat-icon" />
            </div>
            <div className="chat-bubble-content">
              <div className="chat-sender">Soko AI</div>
              <p className="chat-text">How can I help your business today?</p>
            </div>
          </div>

          <div className="chat-overlay card-user">
            <p className="chat-text">How much did I make today?</p>
          </div>

          <div className="chat-overlay card-ai-2">
            <div className="chat-avatar">
              <Bot className="chat-icon" />
            </div>
            <div className="chat-bubble-content">
              <div className="chat-sender">Soko AI</div>
              <p className="chat-text">You made <strong>₦245,600</strong> today across 37 sales.</p>
              <a href="#how" className="chat-link">View summary →</a>
            </div>
          </div>
        </div>

        {/* ABSOLUTE BOTTOM FEATURES BAR (LUCIDE ICONS ONLY) */}
        <div className="hero-features-bar-absolute">
          <div className="flex-bar">
            <div className="hf-item">
              <div className="hf-icon" style={{ background: 'none', backgroundColor: 'transparent', color: '#FAF7F2' }}>
                <Store className="w-5 h-5" />
              </div>
              <div className="hf-text">
                <strong>Accept payments</strong>
                <span>in NGN/KES</span>
              </div>
            </div>
            <div className="hf-item">
              <div className="hf-icon" style={{ background: 'none', backgroundColor: 'transparent', color: '#FAF7F2' }}>
                <Coins className="w-5 h-5" />
              </div>
              <div className="hf-text">
                <strong>Receive cUSD</strong>
                <span>automatically</span>
              </div>
            </div>
            <div className="hf-item">
              <div className="hf-icon" style={{ background: 'none', backgroundColor: 'transparent', color: '#FAF7F2' }}>
                <Mic className="w-5 h-5" />
              </div>
              <div className="hf-text">
                <strong>Manage with</strong>
                <span>natural language</span>
              </div>
            </div>
            <div className="hf-item">
              <div className="hf-icon" style={{ background: 'none', backgroundColor: 'transparent', color: '#FAF7F2' }}>
                <Landmark className="w-5 h-5" />
              </div>
              <div className="hf-text">
                <strong>Withdraw to bank</strong>
                <span>or mobile money</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER DIRECTLY BELOW HERO */}
      <div className="ticker-wrap">
        <div className="ticker">
          <span className="ticker-item"><span className="dot"></span>Nigeria <strong>Live</strong></span>
          <span className="ticker-item"><span className="dot"></span>Kenya <strong>Live</strong></span>
          <span className="ticker-item"><span className="dot"></span>Built on <strong>Celo L2</strong></span>
          <span className="ticker-item"><span className="dot"></span>ERC-8004 <strong>Agent Wallets</strong></span>
          <span className="ticker-item"><span className="dot"></span>Live <strong>FX Rates</strong></span>
          <span className="ticker-item"><span className="dot"></span>x402 <strong>Instant Payments</strong></span>
          <span className="ticker-item"><span className="dot"></span>Pidgin + <strong>Swahili AI</strong></span>
          <span className="ticker-item"><span className="dot"></span>Zero <strong>Crypto Knowledge Needed</strong></span>
          <span className="ticker-item"><span className="dot"></span>Nigeria <strong>Live</strong></span>
          <span className="ticker-item"><span className="dot"></span>Kenya <strong>Live</strong></span>
          <span className="ticker-item"><span className="dot"></span>Built on <strong>Celo L2</strong></span>
          <span className="ticker-item"><span className="dot"></span>ERC-8004 <strong>Agent Wallets</strong></span>
          <span className="ticker-item"><span className="dot"></span>Live <strong>FX Rates</strong></span>
          <span className="ticker-item"><span className="dot"></span>x402 <strong>Instant Payments</strong></span>
          <span className="ticker-item"><span className="dot"></span>Pidgin + <strong>Swahili AI</strong></span>
          <span className="ticker-item"><span className="dot"></span>Zero <strong>Crypto Knowledge Needed</strong></span>
        </div>
      </div>

      {/* HOW IT WORKS (STACKED DECK INTERACTIVE SHUFFLE CAROUSEL) */}
      <section className="how" id="how">
        <div className="how-header">
          <div>
            <span className="section-label">Discover How It Works</span>
            <h2 className="section-title">
              Your Guide to AI Back-Office
            </h2>
          </div>
          <div className="how-nav-buttons">
            <button onClick={prevCard} className="how-nav-btn" aria-label="Previous step">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={nextCard} className="how-nav-btn" aria-label="Next step">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="how-stack-container">
          {steps.map((s, i) => {
            const cardStyle = getCardStyle(i);
            return (
              <div
                key={i}
                className="how-card"
                style={{
                  ...cardStyle,
                  backgroundColor: s.bgColor,
                  border: '2.5px solid #1A1208'
                }}
                onClick={() => setActiveCard(i)}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="how-card-num">0{i + 1}</span>
                  <div className="how-card-icon-wrap">{s.icon}</div>
                </div>
                <div className="how-card-content">
                  <h3>{s.title}</h3>
                  <p>{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* STATS */}
      <div className="stats">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="stats-grid">
            <div className="stat fade-up">
              <span className="stat-num" data-count="150">0</span>
              <span className="stat-label">Million merchants with no financial infrastructure</span>
            </div>
            <div className="stat fade-up">
              <span className="stat-num">₦0</span>
              <span className="stat-label">Fees between SokoPay merchants</span>
            </div>
            <div className="stat fade-up">
              <span className="stat-num">&lt;10s</span>
              <span className="stat-label">From customer pays to cUSD confirmed onchain</span>
            </div>
            <div className="stat fade-up">
              <span className="stat-num">2</span>
              <span className="stat-label">Countries live. Every other is one bridge away.</span>
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section className="features" id="features">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <span className="section-label fade-up">Everything You Need</span>
          <h2 className="section-title fade-up">
            Your entire<br />financial back-office.
          </h2>
          <div className="features-grid">
            <div className="feature-card fade-up">
              <div className="card-tag">Live</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <CreditCard className="w-5 h-5" />
              </div>
              <h3>Accept Any Payment</h3>
              <p>Bank transfer, Opay, M-Pesa — customers pay how they always have. SokoPay handles the rest.</p>
            </div>
            <div className="feature-card fade-up">
              <div className="card-tag">Live</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3>Your Wallet, Forever</h3>
              <p>ERC-8004 agent wallet on Celo mainnet. Non-custodial. Yours permanently — even if SokoPay shuts down.</p>
            </div>
            <div className="feature-card fade-up">
              <div className="card-tag">Live</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <Bot className="w-5 h-5" />
              </div>
              <h3>AI Agent in Your Language</h3>
              <p>"How I dey do today?" — your agent speaks Pidgin, Swahili, and English. Voice notes supported.</p>
            </div>
            <div className="feature-card fade-up">
              <div className="card-tag">Live</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <CheckCircle className="w-5 h-5" />
              </div>
              <h3>Verified Exchange Rates</h3>
              <p>Every NGN/KES → cUSD conversion uses a live FX rate from CoinGecko. Tamper-proof. On every transaction.</p>
            </div>
            <div className="feature-card fade-up">
              <div className="card-tag">Live</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <h3>Withdraw Anytime</h3>
              <p>cUSD → Naira or Shillings in minutes. To your bank, Opay, or M-Pesa. Your money, on demand.</p>
            </div>
            <div className="feature-card fade-up">
              <div className="card-tag">Soon</div>
              <div className="card-icon-box" style={{ background: 'none', backgroundColor: 'transparent', color: '#1A1208' }}>
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3>Credit Score Building</h3>
              <p>90 days of sales history builds a decentralized credit score. Unlock business loans with no bank.</p>
            </div>
          </div>
        </div>
      </section>

      {/* QUOTE */}
      <div className="quote-section">
        <div className="quote-inner fade-up">
          <span className="quote-mark">"</span>
          <p className="quote-text">
            We didn't build a crypto app.<br />
            We built a merchant app<br />that settles onchain.
          </p>
          <span className="quote-attr">SokoPay — Built for the Celo Onchain Agents Hackathon 2026</span>
        </div>
      </div>

      {/* COUNTRIES */}
      <div className="countries" id="countries">
        <div className="countries-inner">
          <div className="countries-left slide-left">
            <span className="countries-left-label">Network Expansion</span>
            <h2>
              <span className="nobr">Nigeria + Kenya <span>live.</span></span><br />
              Every other country<br />is one bridge away.
            </h2>
            <p className="countries-desc">
              SokoPay agent wallets and verified rates allow seamless cross-border settlement for informal merchants. Accept local payment methods and settle instantly.
            </p>
          </div>
          
          <div className="countries-map">
            <AfricaGlobe />
          </div>
          
          <div className="countries-right slide-right">
            <div className="countries-list-container">
              <div className="country-item active ng-item">
                <span>Nigeria</span>
                <span className="badge-dot" style={{ background: '#C4622D', boxShadow: '0 0 8px #C4622D' }}></span>
              </div>
              <div className="country-item active ke-item">
                <span>Kenya</span>
                <span className="badge-dot" style={{ background: '#5C6B3A', boxShadow: '0 0 8px #5C6B3A' }}></span>
              </div>
              <div className="country-item">
                <span>Ghana</span>
                <span className="soon-tag">Soon</span>
              </div>
              <div className="country-item">
                <span>South Africa</span>
                <span className="soon-tag">Soon</span>
              </div>
              <div className="country-item">
                <span>Tanzania</span>
                <span className="soon-tag">Soon</span>
              </div>
              <div className="country-item">
                <span>Uganda</span>
                <span className="soon-tag">Soon</span>
              </div>
              <div className="country-item">
                <span>Colombia</span>
                <span className="soon-tag">Soon</span>
              </div>
              <div className="country-item">
                <span>Philippines</span>
                <span className="soon-tag">Soon</span>
              </div>
            </div>
            
            <div className="scale-axis">
              <div className="scale-axis-line"></div>
              <div className="scale-tick active ng-tick"></div>
              <div className="scale-tick active ke-tick"></div>
              <div className="scale-tick"></div>
              <div className="scale-tick"></div>
              <div className="scale-tick"></div>
              <div className="scale-tick"></div>
              <div className="scale-tick"></div>
              <div className="scale-tick"></div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <section className="cta-section">
        <div className="cta-bg"></div>
        <h2 className="fade-up">
          The infrastructure<br /><span>150M merchants</span><br />never had.
        </h2>
        <p className="fade-up">
          Start in 60 seconds. No crypto knowledge needed.
          Your agent is waiting.
        </p>
        <div className="cta-actions fade-up">
          <button onClick={handleOpenApp} className="btn-primary">Create Your Account →</button>
          <button onClick={handleOpenApp} className="btn-secondary">View Demo</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-footer">
        <div className="footer-logo-wrap">
          <SokoLogoMark swapped={true} className="footer-logo-large" />
        </div>

        <div className="footer-left-col">
          <div className="footer-col-title">Contact</div>
          <div className="footer-contact-details">
            Lagos, Nigeria & Nairobi, Kenya<br />
            <a href="mailto:hello@sokopay.com">hello@sokopay.com</a>
          </div>
          <div className="footer-social-links">
            <a href="https://x.com/sokopay" target="_blank" rel="noreferrer">Twitter <span>↗</span></a>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub <span>↗</span></a>
            <a href="https://discord.gg" target="_blank" rel="noreferrer">Discord <span>↗</span></a>
          </div>
        </div>

        <div className="footer-center-content">
          <div className="footer-title">SokoPay</div>
          <div className="footer-tagline">AI financial back-office for informal merchants</div>
          <div className="footer-actions-centered">
            <button onClick={handleOpenApp} className="btn-pill-primary">Start Selling →</button>
            <a href="#how" className="btn-pill-secondary">See How It Works</a>
          </div>
        </div>

        <div className="footer-right-col">
          <div className="footer-col-title">Quick Links</div>
          <ul className="footer-nav-links">
            <li><a href="#how">How it works</a></li>
            <li><a href="#features">Features</a></li>
            <li><a href="#countries">Countries</a></li>
            <li><button onClick={handleOpenApp} style={{ background: 'none', border: 'none', color: 'rgba(250,247,242,0.65)', fontSize: '13px', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>Open App</button></li>
          </ul>
          <div className="footer-capsule">
            <a href="#privacy">Privacy policy</a>
            <span className="divider">·</span>
            <a href="#cookies">Cookies policy</a>
            <span className="divider">·</span>
            <span>© 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
