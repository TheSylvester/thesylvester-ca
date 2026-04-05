"use client";

import Image from "next/image";
import DotGridBackground from "@/components/dot-grid-background";
import { FlipBanner } from "@/components/flip-banner";

const NAV_ITEMS = ["About", "Projects", "Contact"];

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
        {/* Profile image with circle */}
        <div className="relative mb-4 group" style={{ width: 300, height: 400 }}>
          {/* Glow */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-72 h-72 z-[1] pointer-events-none">
            <div className="absolute -inset-4 rounded-full bg-gradient-to-t from-[#F97316]/15 via-[#D4A574]/20 to-transparent blur-xl" />
          </div>

          {/* Circle ring — behind image (temporarily hidden) */}
          {/* <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full border-2 border-[#D4A574]/30 z-[5] pointer-events-none" /> */}

          {/* Image with gradient fade at bottom */}
          <div className="absolute bottom-6 left-1/2 -translate-x-[52%] w-[560px] z-10 pointer-events-none" style={{ maskImage: "linear-gradient(to bottom, black 60%, transparent 90%)", WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 90%)" }}>
            <Image
              src="/images/sylvester-suit-800w-bw-clean.png"
              alt="Sylvester Wong"
              width={800}
              height={800}
              className="w-full h-auto"
              style={{ filter: "sepia(0.3) brightness(0.85) hue-rotate(5deg) saturate(0.7)" }}
              priority
            />
          </div>
        </div>

        {/* Name + Tagline group */}
        <div className="flex flex-col items-center gap-0 mb-8">
          <h1 className="font-[family-name:var(--font-bebas)] text-6xl md:text-8xl tracking-wide bg-gradient-to-r from-[#D4A574] to-[#F97316] bg-clip-text text-transparent" style={{ lineHeight: "89%" }}>
            SYLVESTER WONG
          </h1>
          <div className="text-center max-w-xl h-10 md:h-12 flex items-center justify-center">
            <FlipBanner
              phrases={[
                "Agentic AI Leader",
                "Agentic Harness Engineer",
                "Full Stack Developer",
                "AI Solutions Architect",
              ]}
            />
          </div>
        </div>

        {/* Subtitle */}
        <p className="text-stone-500 text-sm md:text-base mb-10 tracking-wide">
          Supercharging dev teams with autonomous coding tools
        </p>

        {/* CTA buttons */}
        <div className="flex gap-4">
          <a
            href="#projects"
            className="group relative px-7 py-3 rounded-full bg-gradient-to-r from-[#D4A574] to-[#F97316] text-[#1C1917] font-semibold text-sm overflow-hidden transition-all duration-300 hover:shadow-[0_0_24px_rgba(249,115,22,0.3)]"
          >
            View Projects
          </a>
          <a
            href="#contact"
            className="px-7 py-3 rounded-full border border-[#D4A574]/30 text-[#D4A574] text-sm font-medium hover:bg-[#D4A574]/10 hover:border-[#D4A574]/50 transition-all duration-300"
          >
            Get in Touch
          </a>
        </div>
      </main>

      {/* Crispy Section */}
      <section id="projects" className="relative z-10 py-32 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#D4A574]/20 bg-[#D4A574]/5 text-[#D4A574] text-xs font-medium tracking-wide uppercase mb-6">
              Featured Project
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
              <a
                href="https://github.com/TheSylvester/crispy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-100 hover:text-[#D4A574] transition-colors duration-200"
              >
                Crispy
              </a>
            </h2>
            <p className="text-lg text-stone-400 max-w-2xl mx-auto mb-10">
              A power-user&apos;s workbench for multiple Claude Code and Codex instances at a time
              — run it in VS Code, in your browser, or from Discord on your phone.
            </p>

            {/* Hero GIF */}
            <a
              href="https://github.com/TheSylvester/crispy"
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-2xl mx-auto rounded-xl overflow-hidden border border-stone-800/60 hover:border-[#D4A574]/40 transition-colors duration-300"
            >
              <Image
                src="/images/crispy-hero.gif"
                alt="Crispy — multi-vendor agent harness"
                width={900}
                height={471}
                className="w-full h-auto"
                unoptimized
              />
            </a>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Main feature — spans 2 cols */}
            <div className="md:col-span-2 rounded-2xl border border-stone-800/60 bg-stone-900/40 backdrop-blur-sm p-10 flex flex-col justify-center min-h-[220px]">
              <div className="text-xs font-medium text-[#F97316] uppercase tracking-widest mb-3">Claude Code &amp; Codex deserve a better UI</div>
              <p className="text-base text-stone-500 leading-relaxed mb-4 max-w-lg">
                No way to fork conversations side by side. No semantic search for previous sessions.
                No way to orchestrate agents from different models. Discord bots that couldn&apos;t resume past conversations.
              </p>
              <p className="text-2xl md:text-3xl font-bold tracking-tight text-stone-100 leading-snug">
                So I built one GUI to control<br />
                <span className="bg-gradient-to-r from-[#D4A574] to-[#F97316] bg-clip-text text-transparent">all my agents.</span>
              </p>
            </div>

            {/* Download links card */}
            <div className="rounded-2xl border border-stone-800/60 bg-stone-900/40 backdrop-blur-sm p-8 flex flex-col justify-center">
              <div className="text-xs font-medium text-[#D4A574] uppercase tracking-wide mb-4">Get Crispy</div>
              <div className="space-y-3">
                <a href="https://www.npmjs.com/package/crispy-code" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-stone-400 hover:text-stone-100 transition-colors group">
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 flex items-center justify-center text-[10px] font-bold text-[#CB3837] group-hover:bg-stone-700/80">npm</span>
                  <div>
                    <div className="text-stone-300 group-hover:text-stone-100">npm i -g crispy-code</div>
                    <div className="text-xs text-stone-600">Standalone browser &amp; CLI</div>
                  </div>
                </a>
                <a href="https://open-vsx.org/extension/the-sylvester/crispy" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-stone-400 hover:text-stone-100 transition-colors group">
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 flex items-center justify-center group-hover:bg-stone-700/80">
                    <svg className="w-4 h-4 text-[#007ACC]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.15 2.587L18.21.21a1.494 1.494 0 00-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 00-1.276.057L.327 7.261A1 1 0 00.326 8.74L3.899 12 .326 15.26a1 1 0 00.001 1.479L1.65 17.94a.999.999 0 001.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 001.704.29l4.942-2.377A1.5 1.5 0 0024 20.06V3.939a1.5 1.5 0 00-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>
                  </span>
                  <div>
                    <div className="text-stone-300 group-hover:text-stone-100">VS Code / Cursor</div>
                    <div className="text-xs text-stone-600">OpenVSX extension</div>
                  </div>
                </a>
                <a href="https://github.com/TheSylvester/crispy/releases/latest" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-stone-400 hover:text-stone-100 transition-colors group">
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 flex items-center justify-center group-hover:bg-stone-700/80">
                    <svg className="w-4 h-4 text-stone-400" viewBox="0 0 24 24" fill="currentColor"><path d="M5.79 21.61l-1.58-1.22 8.6-11.11C13.48 8.42 14.67 8 16 8c2.76 0 5 2.24 5 5 0 1.33-.42 2.52-1.28 3.19L8.61 27.3l8.6-11.11C17.88 15.52 18 14.78 18 14c0-1.1-.9-2-2-2-.78 0-1.52.12-2.19.79L5.79 21.61zM16 20c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" /><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                  </span>
                  <div>
                    <div className="text-stone-300 group-hover:text-stone-100">Windows Desktop</div>
                    <div className="text-xs text-stone-600">Tauri app — GitHub Releases</div>
                  </div>
                </a>
                <a href="https://github.com/TheSylvester/crispy" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-sm text-stone-400 hover:text-stone-100 transition-colors group">
                  <span className="w-7 h-7 rounded-md bg-stone-800/80 flex items-center justify-center group-hover:bg-stone-700/80">
                    <svg className="w-4 h-4 text-stone-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  </span>
                  <div>
                    <div className="text-stone-300 group-hover:text-stone-100">Source Code</div>
                    <div className="text-xs text-stone-600">MIT licensed</div>
                  </div>
                </a>
              </div>
            </div>

            {/* Feature cards with hoverable screenshots */}
            {[
              { title: "Discord Remote", desc: "Control your agents from your phone — and pick up any past conversation where you left off.", img: "/images/discord.png", color: "#D4A574" },
              { title: "Agent Recall", desc: "Full-text and semantic search across every session. Your agent remembers past work.", img: "/images/agent-memory-recall.png", color: "#F97316" },
              { title: "Multi-Agent Orchestration", desc: "Pit Claude and Codex against each other to catch bugs a single model misses.", img: "/images/models.gif", color: "#D4A574" },
              { title: "Fork & Rewind", desc: "Fork from any message to explore a different approach. Side-by-side session view.", img: "/images/fork.gif", color: "#F97316" },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-stone-800/60 bg-stone-900/40 backdrop-blur-sm p-6 group relative overflow-hidden">
                <h3 className="text-base font-semibold text-stone-100 mb-2">{feature.title}</h3>
                <p className="text-sm text-stone-400 leading-relaxed mb-3">{feature.desc}</p>
                <div className="rounded-lg overflow-hidden border border-stone-800/40 group-hover:border-stone-700/60 transition-colors">
                  <Image
                    src={feature.img}
                    alt={feature.title}
                    width={400}
                    height={220}
                    className="w-full h-auto opacity-70 group-hover:opacity-100 transition-opacity duration-300"
                    unoptimized
                  />
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center mt-12">
            <a
              href="https://github.com/TheSylvester/crispy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#D4A574] text-[#1C1917] font-medium text-sm hover:bg-[#E8C4A0] transition-colors duration-200"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>
      {/* Contact Section */}
      <section id="contact" className="relative z-10 py-24 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-stone-100">
            Get in Touch
          </h2>
          <p className="text-stone-400 mb-10 leading-relaxed">
            Open to opportunities. Remote preferred.
          </p>
          <button
            onClick={() => {
              navigator.clipboard.writeText("sylvester@thesylvester.ca");
              const el = document.getElementById("copy-tooltip");
              if (el) { el.textContent = "Copied!"; setTimeout(() => { el.textContent = "click to copy email"; }, 2000); }
            }}
            className="group inline-flex flex-col items-center gap-1 px-8 py-4 rounded-2xl border border-stone-800/60 bg-stone-900/40 hover:border-[#D4A574]/40 transition-colors duration-200 cursor-pointer"
          >
            <span className="text-lg text-stone-200 font-medium">sylvester@thesylvester.ca</span>
            <span id="copy-tooltip" className="text-xs text-stone-500 group-hover:text-[#D4A574] transition-colors">click to copy email</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-stone-800/40 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <span className="text-sm text-stone-600">
            &copy; {new Date().getFullYear()} Sylvester Wong
          </span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/TheSylvester"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-500 hover:text-stone-200 transition-colors"
              aria-label="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            </a>
            <a
              href="https://linkedin.com/in/thesylvester"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-500 hover:text-stone-200 transition-colors"
              aria-label="LinkedIn"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
