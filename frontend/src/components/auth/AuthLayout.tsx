import React from 'react';
import {
  BarChart3,
  Boxes,
  Globe2,
  PackageCheck,
  ShoppingCart,
  Truck,
  Warehouse,
} from 'lucide-react';
import logo from '../../assets/logo.png';

interface AuthLayoutProps {
  children: React.ReactNode;
}

const highlights = [
  { icon: Warehouse, title: 'Smart Warehouse Management', description: 'Real-time inventory and warehouse operations' },
  { icon: BarChart3, title: 'AI-Based Demand Forecasting', description: 'Predict demand and optimize stock levels' },
  { icon: Truck, title: 'Shipment Tracking & Reports', description: 'Monitor shipments and generate detailed reports' },
  { icon: ShoppingCart, title: 'E-commerce Ready', description: 'Built for modern e-commerce businesses' },
];

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#020914] px-3 py-3 text-slate-100 sm:px-4 sm:py-4 md:flex md:items-center md:justify-center lg:px-5 xl:px-8 xl:py-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,116,255,0.16),transparent_32%),radial-gradient(circle_at_84%_52%,rgba(37,99,235,0.08),transparent_34%)]" />
      <div className="relative mx-auto grid w-full max-w-[1400px] overflow-hidden rounded-2xl border border-blue-400/15 bg-[#06101d]/95 shadow-[0_24px_80px_rgba(0,0,0,0.5)] md:grid-cols-[48%_52%]">
        <section className="relative overflow-hidden border-b border-blue-300/15 bg-[linear-gradient(145deg,#071c37_0%,#06162d_52%,#061326_100%)] p-4 sm:p-5 md:border-b-0 md:border-r md:p-4 lg:p-7 xl:p-10">
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(59,130,246,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.04)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative z-10 flex h-full min-w-0 flex-col">
            <img
              src={logo}
              alt="Archon Nell Incorporated"
              className="h-11 w-full max-w-[220px] shrink-0 object-contain object-left md:h-12 md:max-w-[230px] lg:h-14 lg:max-w-[270px] xl:h-16 xl:max-w-[300px]"
            />

            <div className="mt-4 min-w-0 md:mt-5 lg:mt-6 xl:mt-8">
              <div className="text-center">
                <p className="whitespace-nowrap text-xs font-semibold tracking-[0.18em] text-blue-400 md:text-[13px] lg:text-sm xl:text-[15px]">WELCOME TO</p>
                <h1 className="mt-1 whitespace-nowrap text-[1.75rem] font-extrabold leading-none tracking-tight text-white md:text-[clamp(2rem,3.4vw,2.25rem)] lg:mt-2 xl:text-[2.5rem]">
                  SMART<span className="text-blue-500">CHAIN</span>
                </h1>
              </div>
              <p className="mt-3 hidden max-w-[560px] text-xs leading-5 text-slate-300 md:block lg:mt-4 lg:text-sm lg:leading-6 xl:text-base xl:leading-7">
                An integrated smart warehousing and supply chain management system with AI-Based Demand
                Forecasting and shipment reports for E-commerce.
              </p>
            </div>

            <div className="mt-4 hidden w-full max-w-[560px] space-y-2.5 md:block lg:mt-5 lg:space-y-3.5 xl:mt-7">
              {highlights.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex min-w-0 items-center gap-2.5 lg:gap-3 xl:gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-400/15 bg-blue-500/10 text-blue-400 shadow-[0_0_24px_rgba(37,99,235,0.1)] lg:h-10 lg:w-10 xl:h-11 xl:w-11 xl:rounded-xl">
                    <Icon className="h-4 w-4 lg:h-[18px] lg:w-[18px] xl:h-5 xl:w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="whitespace-nowrap text-xs font-semibold text-slate-100 lg:text-sm">{title}</h2>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-400 lg:text-xs lg:leading-5 xl:text-sm">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative mt-3 hidden h-20 w-full overflow-hidden pt-3 md:block lg:mt-4 lg:h-28 lg:pt-4 xl:mt-5 xl:h-36 xl:pt-5">
              <div className="absolute bottom-[-72px] right-[-30px] h-56 w-56 rounded-full border border-blue-400/15 opacity-70" />
              <Globe2 className="absolute bottom-[-34px] right-4 h-48 w-48 text-blue-500/15" />
              <div className="absolute bottom-4 left-2 flex h-20 w-32 items-center justify-center rounded-t-xl border border-blue-400/25 bg-blue-950/80 text-blue-400 shadow-[0_0_32px_rgba(37,99,235,0.18)]">
                <Warehouse className="h-12 w-12" />
              </div>
              <Truck className="absolute bottom-3 left-36 h-14 w-14 text-blue-400/80" />
              <Boxes className="absolute bottom-2 left-24 h-9 w-9 text-amber-300/80" />
              <PackageCheck className="absolute bottom-16 left-36 h-7 w-7 text-cyan-300/70" />
              <div className="absolute bottom-8 left-40 right-24 h-px bg-gradient-to-r from-blue-400/60 via-cyan-300/30 to-transparent" />
              <span className="absolute bottom-[29px] right-20 h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_12px_#22d3ee]" />
            </div>
          </div>
        </section>

        <section className="flex min-w-0 items-center justify-center bg-[linear-gradient(145deg,#07111f_0%,#06101d_100%)] p-4 sm:p-5 md:p-3 lg:p-6 xl:p-10">
          <div className="w-full min-w-0 max-w-[500px] rounded-2xl border border-slate-700/60 bg-[#081526]/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.3)] backdrop-blur-sm md:p-5 lg:p-7">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
};

export default AuthLayout;
