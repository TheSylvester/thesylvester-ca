"use client";

import Image from "next/image";
import DotGridBackground from "@/components/dot-grid-background";

const NAV_ITEMS = ["About", "Projects", "Blog", "Contact"];

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#1C1917]">
      <DotGridBackground />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <span className="text-xl font-bold tracking-tight text-[#D4A574]">
          SW<span className="text-[#F97316]">.</span>
        </span>
        <div className="hidden md:flex items-center gap-8 text-sm text-stone-500">
          {NAV_ITEMS.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase()}`}
              className="hover:text-stone-200 transition-colors duration-200"
            >
              {item}
            </a>
          ))}
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-88px)] px-6">
        {/* Profile image with glow ring */}
        <div className="relative mb-8 group">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#D4A574] via-[#F97316] to-[#D4A574] opacity-50 blur-sm group-hover:opacity-70 transition-opacity duration-500" />
          <div className="relative w-40 h-40 rounded-full overflow-hidden border-2 border-[#D4A574]/40">
            <Image
              src="/images/sylvester-suit-800w-bw-clean.png"
              alt="Sylvester Wong"
              fill
              className="object-cover object-top"
              priority
            />
          </div>
        </div>

        {/* Name */}
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4 bg-gradient-to-r from-[#D4A574] to-[#F97316] bg-clip-text text-transparent">
          Sylvester Wong
        </h1>

        {/* Tagline */}
        <p className="text-lg md:text-xl text-stone-400 mb-6 text-center max-w-xl">
          Agentic Engineering Leader
        </p>

        {/* Subtitle pill */}
        <div className="px-5 py-2 rounded-full border border-[#D4A574]/25 bg-[#D4A574]/5 text-[#D4A574] text-sm md:text-base backdrop-blur-sm mb-12">
          Supercharging dev teams with autonomous coding tools
        </div>

        {/* CTA buttons */}
        <div className="flex gap-4">
          <a
            href="#projects"
            className="px-6 py-3 rounded-full bg-[#D4A574] text-[#1C1917] font-medium text-sm hover:bg-[#E8C4A0] transition-colors duration-200"
          >
            View Projects
          </a>
          <a
            href="#contact"
            className="px-6 py-3 rounded-full border border-stone-700 text-stone-400 text-sm hover:border-stone-500 hover:text-stone-200 transition-colors duration-200"
          >
            Get in Touch
          </a>
        </div>
      </main>
    </div>
  );
}
