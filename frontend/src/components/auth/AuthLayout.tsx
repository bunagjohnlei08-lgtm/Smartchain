import React from 'react';
import { BarChart3, ShoppingCart, Truck, Warehouse } from 'lucide-react';
import logo from '../../assets/logo.png';

interface AuthLayoutProps {
  children: React.ReactNode;
  appearance?: 'dark' | 'light';
}

const highlights = [
  { icon: Warehouse, title: 'Smart Warehouse Management', description: 'Real-time inventory and warehouse operations' },
  { icon: BarChart3, title: 'AI-Based Demand Forecasting', description: 'Predict demand and optimize stock levels' },
  { icon: Truck, title: 'Shipment Tracking & Reports', description: 'Monitor shipments and generate detailed reports' },
  { icon: ShoppingCart, title: 'E-commerce Ready', description: 'Built for modern e-commerce businesses' },
];

// Extra spacing is applied only on taller viewports (min-height: 860px) so the card
// fits without scrolling on common laptop heights such as 1366x768.
const AuthLayout: React.FC<AuthLayoutProps> = ({ children, appearance = 'dark' }) => {
  const isLight = appearance === 'light';

  return (
    <main style={{ colorScheme: isLight ? 'light' : 'dark' }} className={`auth-surface relative flex min-h-dvh items-center justify-center overflow-x-hidden px-3 py-3 sm:px-6 sm:py-5 lg:py-4 ${isLight ? 'bg-white text-slate-900' : 'bg-[#030b17] text-slate-100'}`}>
      {!isLight && <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(96,165,250,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(96,165,250,0.035)_1px,transparent_1px)] [background-size:48px_48px]" />}

      <div className={`relative grid w-full max-w-[1300px] overflow-hidden rounded-2xl border sm:rounded-[24px] lg:w-[82vw] lg:grid-cols-2 ${isLight ? 'border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.16)]' : 'border-slate-700/40 bg-[#07111f] shadow-[0_20px_60px_rgba(0,0,0,0.35)]'}`}>
        {/* Marketing panel */}
        <section className="relative flex min-w-0 flex-col border-b border-slate-700/40 bg-[linear-gradient(180deg,#0a1d38_0%,#081629_55%,#07111f_100%)] px-4 pb-3.5 pt-3 sm:p-7 lg:border-b-0 lg:border-r lg:px-10 lg:py-7 xl:px-12 [@media(min-height:860px)]:xl:py-8">
          <div className="inline-flex w-fit items-center justify-center self-start rounded-lg bg-cyan-400/10 px-2 py-0.5 shadow-[0_4px_18px_rgba(34,211,238,0.10)] ring-1 ring-cyan-300/20 backdrop-blur-sm sm:rounded-xl sm:px-3 sm:py-2">
            <img src={logo} alt="Archon Nell Incorporated" className="h-auto w-[82px] object-contain sm:w-[100px] lg:w-[110px]" />
          </div>

          <div className="flex flex-1 flex-col justify-center">
            <div className="mt-1.5 text-center sm:mt-4 sm:text-left [@media(min-height:860px)]:lg:mt-5">
              <p className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300/80 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" aria-hidden="true" />
                Enterprise Warehouse Platform
              </p>
              <h1 className="text-lg font-extrabold uppercase leading-[1.1] tracking-tight text-white sm:mt-2 sm:text-[30px] sm:leading-[1.08] 2xl:text-[32px]">
                Welcome to
                <span className="block text-sky-400">SmartChain</span>
              </h1>
              <p className="mt-2.5 hidden max-w-[460px] text-[13px] leading-5 text-slate-400 sm:block">
                An integrated smart warehousing and supply chain management system with AI-Based Demand
                Forecasting and shipment reports for E-commerce.
              </p>
            </div>

            <ul className="mt-4 hidden gap-2.5 sm:grid sm:grid-cols-2 [@media(min-height:860px)]:lg:mt-5">
              {highlights.map(({ icon: Icon, title, description }) => (
                <li
                  key={title}
                  className="rounded-xl border border-slate-700/50 bg-white/[0.03] p-3 transition-colors duration-200 hover:border-sky-400/25"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-sky-400/15 bg-sky-500/10 text-sky-400">
                    <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
                  </div>
                  <h2 className="mt-2 text-[13px] font-semibold leading-5 text-slate-100">{title}</h2>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{description}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Form panel */}
        <section className={`flex min-w-0 items-center justify-center px-4 py-4 sm:px-10 sm:py-7 lg:px-12 lg:py-7 ${isLight ? 'bg-white' : 'bg-[#060f1c]'}`}>
          <div className="w-full min-w-0 max-w-[420px]">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthLayout;
