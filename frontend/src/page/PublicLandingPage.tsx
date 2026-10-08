import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Building2, Check, ChevronDown, ClipboardCheck, Factory,
  FileCheck2, LockKeyhole, Menu, Moon, PackageCheck, Route, ShieldCheck, ShoppingCart,
  Sun, Truck, UserCheck, Warehouse, X, MapPin, Navigation,
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../lib/api';

const platformFlow = [
  { label: 'Procurement', icon: ShoppingCart },
  { label: 'Receiving', icon: PackageCheck },
  { label: 'Quality Assurance', icon: ClipboardCheck },
  { label: 'Inventory', icon: Warehouse },
  { label: 'Shipment', icon: Truck },
];

const operations = [
  { title: 'Warehousing', description: 'Monitor inventory movement, receiving, stock-in, and stock-out operations.', icon: Warehouse },
  { title: 'Procurement', description: 'Coordinate purchase orders, suppliers, and sourcing activities.', icon: ShoppingCart },
  { title: 'Quality Assurance', description: 'Inspect received products and maintain quality assurance records.', icon: ClipboardCheck },
  { title: 'Supply Chain Visibility', description: 'Track operational progress from receiving through shipment preparation.', icon: Route },
];

const onboardingSteps = [
  { title: 'Submit Application', description: 'Submit company details and required business documents.', icon: FileCheck2 },
  { title: 'Admin Review', description: 'Authorized staff review the application and submitted documents.', icon: UserCheck },
  { title: 'Qualified for Meeting', description: 'Qualified applicants receive available meeting schedules.', icon: ClipboardCheck },
  { title: 'Meeting & Evaluation', description: 'The applicant selects a schedule and completes the supplier evaluation meeting.', icon: Building2 },
  { title: 'Final Decision', description: 'After evaluation, the application is either approved as a supplier or rejected.', icon: ShieldCheck },
];

interface PublicCompanyLocation {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  map_embed_url: string | null;
  directions_url: string | null;
}

const focusClasses = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-sky-400 dark:focus-visible:ring-offset-[#06101d]';

const ThemeToggleButton: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors duration-200 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:text-slate-200 dark:hover:border-sky-400/40 dark:hover:bg-sky-400/10 dark:hover:text-sky-300 ${focusClasses}`}
    >
      {theme === 'dark' ? <Moon className="h-5 w-5" aria-hidden="true" /> : <Sun className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
};

const PublicLandingPage: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, setLocation] = useState<PublicCompanyLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient.get<{ data: PublicCompanyLocation | null }>('/public/company-location')
      .then(({ data }) => { if (active) setLocation(data.data); })
      .catch(() => { if (active) setLocation(null); })
      .finally(() => { if (active) setLocationLoading(false); });
    return () => { active = false; };
  }, []);

  const scrollToPlatform = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const platformSection = document.getElementById('platform');
    if (!platformSection) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    platformSection.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    window.history.pushState(null, '', '#platform');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-slate-50 font-sans text-slate-950 dark:bg-[#030812] dark:text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-[#050d18]/95">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/" aria-label="SmartChain home" onClick={() => setMobileMenuOpen(false)} className={`inline-flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-lg ${focusClasses}`}>
            <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-1.5 dark:border-slate-700">
              <img src={logo} alt="Archon Nell Incorporated" className="h-auto max-h-8 w-full object-contain" />
            </span>
            <span className="min-w-0">
              <span className="block text-base font-bold leading-5 tracking-tight text-slate-950 dark:text-white">SmartChain</span>
              <span className="hidden truncate text-[11px] leading-4 text-slate-600 dark:text-slate-400 sm:block">Archon Nell Inc. · Warehousing &amp; Supply Chain</span>
            </span>
          </Link>

          <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
            <ThemeToggleButton />
            <a href="#platform" onClick={scrollToPlatform} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white ${focusClasses}`}>About SmartChain</a>
            <Link to="/supplier-application" className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white ${focusClasses}`}>Supplier Application</Link>
            <Link to="/login" className={`ml-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-sky-800 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 ${focusClasses}`}>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" /> Staff Sign In
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-2 md:hidden">
            <ThemeToggleButton />
            <button type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen((open) => !open)} className={`inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition-colors duration-200 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5 ${focusClasses}`}>
              {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#050d18] md:hidden">
            <div className="mx-auto grid max-w-7xl gap-2">
              <a href="#platform" onClick={scrollToPlatform} className={`inline-flex min-h-11 cursor-pointer items-center justify-between rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5 ${focusClasses}`}>About SmartChain <ChevronDown className="h-4 w-4" aria-hidden="true" /></a>
              <Link to="/supplier-application" onClick={() => setMobileMenuOpen(false)} className={`inline-flex min-h-11 cursor-pointer items-center justify-between rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors duration-200 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5 ${focusClasses}`}>Supplier Application <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-sky-800 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 ${focusClasses}`}><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Staff Sign In</Link>
            </div>
          </nav>
        )}
      </header>

      <main>
      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#030812]" aria-labelledby="hero-heading">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 opacity-60 [background-image:linear-gradient(rgba(14,116,144,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.07)_1px,transparent_1px)] [background-size:56px_56px] dark:opacity-50 dark:[background-image:linear-gradient(rgba(56,189,248,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.055)_1px,transparent_1px)]" />
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 -z-10 h-80 w-80 -translate-x-1/2 rounded-full bg-sky-400/10 blur-3xl dark:bg-sky-500/10" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(440px,0.98fr)] lg:items-center lg:gap-14 lg:px-8 lg:py-24">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/70 bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-sky-800 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Secure SmartChain Platform</div>
            <h1 id="hero-heading" className="mt-6 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-[-0.035em] text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">Smarter warehousing.<span className="mt-1 block text-sky-700 dark:text-sky-400">Stronger supply chains.</span></h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-700 dark:text-slate-300 sm:text-lg sm:leading-8">SmartChain is Archon Nell Incorporated&apos;s integrated platform for warehouse operations, procurement, supplier coordination, quality assurance, inventory movement, and shipment preparation.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login" className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors duration-200 hover:bg-sky-800 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 ${focusClasses}`}><LockKeyhole className="h-4 w-4" aria-hidden="true" /> Staff Sign In <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <Link to="/supplier-application" className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/80 px-5 py-3 font-semibold text-slate-900 transition-colors duration-200 hover:border-sky-400 hover:bg-sky-50 dark:border-slate-700 dark:bg-white/[0.03] dark:text-white dark:hover:border-sky-400/60 dark:hover:bg-sky-400/10 ${focusClasses}`}>Apply as Supplier <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Secure staff access · Structured supplier onboarding</p>
          </div>

          <div className="relative min-w-0 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-2xl shadow-slate-950/10 backdrop-blur-sm dark:border-white/10 dark:bg-[#081322]/95 dark:shadow-black/30 sm:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-white/10">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Connected workflow</p><h2 className="mt-2 text-xl font-bold tracking-tight text-slate-950 dark:text-white">SmartChain Platform</h2><p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-400">Connected warehouse and supply chain operations</p></div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300"><Route className="h-5 w-5" aria-hidden="true" /></span>
            </div>
            <ol className="mt-5" aria-label="Supply chain workflow">
              {platformFlow.map(({ label, icon: Icon }, index) => (
                <li key={label} className="relative flex items-center gap-4 pb-5 last:pb-0">
                  {index < platformFlow.length - 1 && <span aria-hidden="true" className="absolute left-[21px] top-10 h-[calc(100%-24px)] w-px bg-sky-200 dark:bg-sky-400/20" />}
                  <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sky-700 dark:border-slate-700 dark:bg-[#0c1a2c] dark:text-sky-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.025]"><span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{label}</span></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 dark:bg-[#06101d] sm:py-16 lg:py-20" aria-labelledby="access-heading">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Access paths</p><h2 id="access-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Choose how you want to access SmartChain</h2><p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">Staff members and prospective suppliers follow separate secure workflows.</p></div>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:gap-6">
            <article className="flex min-w-0 flex-col rounded-3xl border border-slate-200 bg-white p-5 transition-colors duration-200 hover:border-slate-300 dark:border-white/10 dark:bg-[#0a1524] dark:hover:border-white/20 sm:p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white dark:bg-white/10 dark:text-sky-300"><LockKeyhole className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Internal access</p><h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">SmartChain Staff</h3><p className="mt-3 text-base leading-7 text-slate-600 dark:text-slate-300">Access your authorized SmartChain workspace using your assigned staff credentials.</p>
              <ul className="mt-6 grid gap-3 text-sm text-slate-700 dark:text-slate-300">{['Role-based access', 'Secure authentication', 'Operational workspace'].map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />{item}</li>)}</ul>
              <Link to="/login" className={`mt-8 inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-lg font-semibold text-sky-700 transition-colors duration-200 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300 ${focusClasses}`}>Continue to Staff Sign In <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            </article>
            <article className="flex min-w-0 flex-col rounded-3xl border border-sky-300 bg-sky-50/60 p-5 transition-colors duration-200 hover:border-sky-500 dark:border-sky-400/35 dark:bg-[linear-gradient(180deg,rgba(14,116,144,0.13),rgba(10,21,36,0.98))] dark:hover:border-sky-400/60 sm:p-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-700 text-white dark:bg-sky-400 dark:text-slate-950"><Factory className="h-6 w-6" aria-hidden="true" /></span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-sky-800 dark:text-sky-300">Supplier onboarding</p><h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Become an Archon Nell Supplier</h3><p className="mt-3 text-base leading-7 text-slate-700 dark:text-slate-300">Submit your company information for evaluation by Archon Nell Incorporated.</p>
              <ul className="mt-6 grid gap-3 text-sm text-slate-700 dark:text-slate-300">{['Company application', 'Admin evaluation', 'Supplier qualification'].map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" />{item}</li>)}</ul>
              <Link to="/supplier-application" className={`mt-8 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 self-stretch rounded-xl bg-sky-700 px-5 py-3 font-semibold text-white transition-colors duration-200 hover:bg-sky-800 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 sm:self-start ${focusClasses}`}>Start Supplier Application <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-400">Submitting an application does not create a SmartChain account.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="platform" className="scroll-mt-20 border-y border-slate-200 bg-white py-12 dark:border-white/10 dark:bg-[#030812] sm:py-16 lg:py-20" aria-labelledby="platform-heading">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center"><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Platform capabilities</p><h2 id="platform-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Connected supply chain operations</h2><p className="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg">One integrated platform supports the essential workflows behind warehouse and supply chain operations.</p></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {operations.map(({ title, description, icon: Icon }) => (
              <article key={title} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-colors duration-200 hover:border-sky-300 hover:bg-white dark:border-white/10 dark:bg-[#0a1524] dark:hover:border-sky-400/35 dark:hover:bg-[#0c192a]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300"><Icon className="h-5 w-5" aria-hidden="true" /></span><h3 className="mt-5 text-sm font-bold uppercase tracking-[0.12em] text-slate-950 dark:text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 dark:bg-[#06101d] sm:py-16 lg:py-20" aria-labelledby="onboarding-heading">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Supplier process</p><h2 id="onboarding-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">How supplier onboarding works</h2></div>
          <ol className="mt-10 grid gap-0 lg:grid-cols-5" aria-label="Supplier onboarding steps">
            {onboardingSteps.map(({ title, description, icon: Icon }, index) => (
              <li key={title} className="relative flex min-w-0 gap-4 pb-7 last:pb-0 lg:block lg:pb-0 lg:pr-6">
                {index < onboardingSteps.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[23px] top-12 w-px bg-slate-300 dark:bg-slate-700 lg:bottom-auto lg:left-12 lg:right-0 lg:top-6 lg:h-px lg:w-auto" />}
                <span className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-300 bg-white text-sky-700 dark:border-sky-400/35 dark:bg-[#0a1524] dark:text-sky-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 pt-1 lg:pt-5"><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Step {String(index + 1).padStart(2, '0')}</p><h3 className="mt-2 text-base font-semibold leading-6 text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p></div>
              </li>
            ))}
          </ol>
          <p className="mt-10 max-w-3xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">Only applications that pass the final evaluation are created as official supplier records in SmartChain.</p>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-12 dark:border-white/10 dark:bg-[#030812] sm:py-16 lg:py-20" aria-labelledby="location-heading">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-[#081322] lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="flex min-h-64 flex-col justify-center p-6 sm:p-8 lg:p-10">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-400">Archon Nell location</p>
              <h2 id="location-heading" className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">Visit Archon Nell</h2>
              {locationLoading ? <p className="mt-5 text-sm text-slate-600 dark:text-slate-400" role="status">Loading public location&hellip;</p> : location ? <div className="mt-6">
                <p className="text-lg font-semibold text-slate-950 dark:text-white">Archon Nell Incorporated</p>
                {location.name !== 'Archon Nell Incorporated' && <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-400">{location.name}</p>}
                <address className="mt-4 flex max-w-md items-start gap-3 not-italic text-base leading-7 text-slate-700 dark:text-slate-300"><MapPin className="mt-1 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-400" aria-hidden="true" /><span>{location.address}</span></address>
                {location.directions_url && <a href={location.directions_url} target="_blank" rel="noopener noreferrer" className={`mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 self-start rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-sky-800 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 ${focusClasses}`}><Navigation className="h-4 w-4" aria-hidden="true" /> Get Directions</a>}
              </div> : <p className="mt-5 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">Public location details are not currently available.</p>}
            </div>
            <div className="min-h-72 border-t border-slate-200 bg-slate-200 dark:border-white/10 dark:bg-[#050d18] lg:min-h-96 lg:border-l lg:border-t-0">
              {location?.map_embed_url ? <iframe src={location.map_embed_url} className="h-full min-h-72 w-full lg:min-h-96" style={{ border: 0 }} allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" title="Archon Nell public business location on Google Maps" /> : <div className="flex h-full min-h-72 items-center justify-center p-6 text-center text-sm text-slate-600 dark:text-slate-400 lg:min-h-96"><MapPin className="mr-2 h-5 w-5" aria-hidden="true" /> Map unavailable</div>}
            </div>
          </div>
        </div>
      </section>
      </main>

      <footer className="border-t border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-[#030812] dark:text-slate-300">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="border-b border-slate-200 pb-7 dark:border-white/10">
            <div className="max-w-md">
              <div className="flex items-center gap-3"><span className="flex h-10 w-14 items-center justify-center rounded-lg border border-slate-200 bg-white px-1.5 dark:border-slate-700"><img src={logo} alt="Archon Nell Incorporated" className="h-auto max-h-8 w-full object-contain" /></span><div><p className="font-bold text-slate-950 dark:text-white">SmartChain</p><p className="text-xs text-slate-600 dark:text-slate-400">Archon Nell Inc. · Warehousing &amp; Supply Chain</p></div></div>
              <p className="mt-5 text-sm leading-6 text-slate-600 dark:text-slate-400">Integrated Smart Warehousing and Supply Chain Management System</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-6 text-xs leading-5 text-slate-600 dark:text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>&copy; 2026 Archon Nell Incorporated. All rights reserved.</p><p>Authorized staff access only for internal SmartChain workspaces.</p></div>
        </div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
