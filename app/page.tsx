import Link from "next/link";
import AskPanel from "@/components/ask-panel";
import CodeRain from "@/components/code-rain";
import CopyEmail from "@/components/copy-email";
import HomeAnchor from "@/components/home-anchor";
import StatusBar from "@/components/status-bar";

export default function Home() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#12151f",
        color: "#c8ccd4",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* live code rain background (mouse-reactive) — spans hero and fades into the work section */}
      <CodeRain />

      {/* ============ TOP BAR ============ */}
      <header
        data-topbar=""
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "14px 24px",
          background: "rgba(18,21,31,.92)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid #262c3d",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 6 }}>
          <HomeAnchor />
          <CopyEmail className="hov-nav" style={{ color: "#c8ccd4", fontSize: 14, letterSpacing: ".02em" }}>
            sylvester@thesylvester.ca <span style={{ color: "#5c6370" }}>~</span>
          </CopyEmail>
        </div>
        <nav
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "clamp(14px,2.4vw,34px)",
            fontSize: 13,
            letterSpacing: ".14em",
          }}
        >
          <a href="#work" className="hov-nav" style={{ color: "#c8ccd4" }}>
            WORK
          </a>
          <Link href="/guide" className="hov-nav" style={{ color: "#c8ccd4" }}>
            CLAUDE CODE GUIDE
          </Link>
          <a href="#about" className="hov-nav" style={{ color: "#c8ccd4" }}>
            ABOUT
          </a>
          <CopyEmail className="hov-nav" style={{ color: "#c8ccd4" }}>
            CONTACT
          </CopyEmail>
        </nav>
        <a
          href="https://github.com/TheSylvester"
          aria-label="GitHub — TheSylvester"
          className="hov-gh"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 30,
            border: "1px solid #3a4152",
            borderRadius: 7,
            color: "#c8ccd4",
            fontSize: 13,
          }}
        >
          &gt;_
        </a>
      </header>

      {/* ============ SCREEN 1 · HERO ============ */}
      <section
        data-screen="1"
        data-screen-label="Hero"
        style={{
          position: "relative",
          zIndex: 2,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxSizing: "border-box",
          minHeight: "calc(100vh - 59px)",
          paddingBottom: 76,
          background: "transparent",
        }}
      >
        <div
          data-hero-grid=""
          style={{
            position: "relative",
            zIndex: 2,
            flex: 1,
            display: "grid",
            gridTemplateColumns: "minmax(0,1.15fr) minmax(260px,.85fr) minmax(280px,340px)",
            gap: "clamp(20px,3vw,44px)",
            alignItems: "center",
            padding: "clamp(28px,4vh,56px) clamp(28px,4vw,72px) 0",
            maxWidth: 1720,
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {/* left copy */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "clamp(14px,1.2vw,17px)", color: "#9aa3b2" }}>
              Hi, I’m Sylvester Wong
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: ".55em",
                  height: "1em",
                  background: "#d97757",
                  marginLeft: 6,
                  verticalAlign: "-.15em",
                  animation: "blink 1.1s steps(1) infinite",
                }}
              ></span>
            </div>
            <h1
              style={{
                margin: "22px 0 0",
                fontWeight: 700,
                fontSize: "clamp(34px,3.6vw,62px)",
                lineHeight: 1.16,
                letterSpacing: "-.02em",
                color: "#f2f3f5",
                textWrap: "balance",
              }}
            >
              I turn AI into a software engineering <span style={{ color: "#d97757" }}>superpower</span>.
            </h1>
            <p
              style={{
                margin: "26px 0 0",
                maxWidth: 560,
                fontSize: "clamp(14px,1.15vw,16px)",
                lineHeight: 1.85,
                color: "#9aa3b2",
                textWrap: "pretty",
              }}
            >
              I build production AI systems, developer tools, and practical methods that help teams use coding agents
              with better context, memory, workflows, testing, and review.
            </p>

            <div style={{ marginTop: 34, display: "flex", flexWrap: "wrap", gap: 16 }}>
              <a
                href="#work"
                className="hov-cta"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "15px 24px",
                  border: "1px solid #d97757",
                  borderRadius: 8,
                  color: "#d97757",
                  fontSize: 14,
                  letterSpacing: ".1em",
                  background: "rgba(217,119,87,.06)",
                }}
              >
                <span>&gt;_</span> EXPLORE MY WORK
              </a>
              <Link
                href="/guide"
                className="hov-ghost"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "15px 24px",
                  border: "1px solid #3a4152",
                  borderRadius: 8,
                  color: "#c8ccd4",
                  fontSize: 14,
                  letterSpacing: ".1em",
                }}
              >
                <span style={{ color: "#5c6370" }}>&gt;_</span> READ THE GUIDE
              </Link>
            </div>

            <div
              style={{
                marginTop: 44,
                paddingTop: 26,
                borderTop: "1px solid #262c3d",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
                gap: 20,
                maxWidth: 760,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ color: "#d97757", fontSize: 14, lineHeight: 1.5 }}>
                  ◇
                </span>
                <div>
                  <div style={{ fontSize: "12.5px", color: "#e6e9ee", fontWeight: 500 }}>Production AI Systems</div>
                  <div style={{ marginTop: 5, fontSize: "11.5px", lineHeight: 1.55, color: "#7d8698" }}>
                    Built and shipped in real environments
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ color: "#d97757", fontSize: 14, lineHeight: 1.5 }}>
                  ▤
                </span>
                <div>
                  <div style={{ fontSize: "12.5px", color: "#e6e9ee", fontWeight: 500 }}>Open Source Builder</div>
                  <div style={{ marginTop: 5, fontSize: "11.5px", lineHeight: 1.55, color: "#7d8698" }}>
                    Recall (active) · Crispy (archived)
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ color: "#d97757", fontSize: 14, lineHeight: 1.5 }}>
                  ⚡
                </span>
                <div>
                  <div style={{ fontSize: "12.5px", color: "#e6e9ee", fontWeight: 500 }}>Engineering Impact</div>
                  <div style={{ marginTop: 5, fontSize: "11.5px", lineHeight: 1.55, color: "#7d8698" }}>
                    LLM accuracy 70 → 95% · review time -50%
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span aria-hidden="true" style={{ color: "#d97757", fontSize: 14, lineHeight: 1.5 }}>
                  ◎
                </span>
                <div>
                  <div style={{ fontSize: "12.5px", color: "#e6e9ee", fontWeight: 500 }}>Based in Toronto</div>
                  <div style={{ marginTop: 5, fontSize: "11.5px", lineHeight: 1.55, color: "#7d8698" }}>
                    Available for Senior / Lead opportunities
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* portrait */}
          <div
            data-hero-portrait=""
            style={{
              position: "relative",
              alignSelf: "stretch",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-end",
              minWidth: 0,
              marginBottom: -26,
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                bottom: "-18%",
                left: "50%",
                transform: "translateX(-50%)",
                width: "150%",
                minWidth: 520,
                height: "calc(112% + clamp(60px,10vh,130px))",
                background:
                  "radial-gradient(ellipse 46% 48% at 50% 46%,rgba(217,119,87,.42) 0%,rgba(217,119,87,.2) 38%,rgba(217,119,87,.07) 60%,transparent 76%)",
                animation: "floatGlow 7s ease-in-out infinite",
                pointerEvents: "none",
              }}
            ></div>
            {/* eslint-disable-next-line @next/next/no-img-element -- static export serves unoptimized images */}
            <img
              src="/images/sylvester-portrait-1200w.webp"
              alt="Sylvester Wong"
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                display: "block",
                height: "calc(100% + clamp(20px,4vh,52px))",
                width: "auto",
                maxWidth: "none",
                filter: "drop-shadow(0 24px 60px rgba(0,0,0,.6))",
              }}
            />
          </div>

          {/* sidebar card */}
          <aside
            data-hero-card=""
            data-screen-label="Hero profile card"
            style={{
              alignSelf: "center",
              border: "1px solid #313a4e",
              borderRadius: 12,
              background: "rgba(23,27,39,.88)",
              backdropFilter: "blur(6px)",
              padding: "24px 24px 26px",
              fontSize: 13,
              lineHeight: 1.6,
              boxShadow: "0 30px 70px -30px rgba(0,0,0,.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ color: "#d97757", fontWeight: 700, letterSpacing: ".06em", fontSize: 14 }}>
                SYLVESTER.WONG
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#8cc265", fontSize: 12 }}>
                <span
                  style={{ width: 7, height: 7, borderRadius: "50%", background: "#8cc265", display: "inline-block" }}
                ></span>
                online
              </div>
            </div>
            <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
              <div>
                <div style={{ display: "flex", gap: 8, color: "#d97757", fontSize: 12, letterSpacing: ".08em" }}>
                  <span aria-hidden="true">▣</span>ROLE
                </div>
                <div style={{ marginTop: 3, color: "#c8ccd4" }}>Senior / Lead Software Engineer</div>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, color: "#d97757", fontSize: 12, letterSpacing: ".08em" }}>
                  <span aria-hidden="true">◈</span>FOCUS
                </div>
                <div style={{ marginTop: 3, color: "#c8ccd4" }}>
                  AI-native development
                  <br />
                  Agent systems · Retrieval
                  <br />
                  Developer tools · Full-stack
                </div>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, color: "#d97757", fontSize: 12, letterSpacing: ".08em" }}>
                  <span aria-hidden="true">▤</span>BUILDING
                </div>
                <div style={{ marginTop: 3, color: "#c8ccd4" }}>
                  <a
                    href="https://github.com/TheSylvester/crispy-recall"
                    className="hov-card-link"
                    style={{ color: "#c8ccd4" }}
                  >
                    Recall
                  </a>
                  <br />
                  <span style={{ color: "#8a93a3" }}>Local memory for Claude Code and Codex</span>
                </div>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, color: "#d97757", fontSize: 12, letterSpacing: ".08em" }}>
                  <span aria-hidden="true">▦</span>STACK
                </div>
                <div style={{ marginTop: 3, color: "#c8ccd4" }}>
                  Claude Code · Codex · Agent SDK
                  <br />
                  MCP · llama.cpp · Supabase
                  <br />
                  TypeScript · Python · Node
                  <br />
                  React · Next.js · Vite
                  <br />
                  Postgres · SQLite · Docker
                  <br />
                  Stripe · Playwright · GitHub Actions
                </div>
              </div>
              <div>
                <div style={{ display: "flex", gap: 8, color: "#d97757", fontSize: 12, letterSpacing: ".08em" }}>
                  <span aria-hidden="true">❝</span>PHILOSOPHY
                </div>
                <div style={{ marginTop: 3, color: "#c8ccd4" }}>
                  AI can write code.
                  <br />
                  Engineering makes it valuable.
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ask panel */}
        <AskPanel />
      </section>

      {/* ============ SCREEN 2 · WORK ============ */}
      <section
        id="work"
        data-screen="2"
        data-screen-label="Current work"
        style={{
          position: "relative",
          zIndex: 2,
          background: "transparent",
          padding: "clamp(80px,10vh,130px) clamp(28px,4vw,72px) 0",
        }}
      >
        <div style={{ maxWidth: 1560, margin: "0 auto" }}>
          <div style={{ fontSize: 12, letterSpacing: ".3em", color: "#8a93a3" }}>CURRENT WORK</div>
          <div
            style={{
              marginTop: 20,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: "18px 40px",
              justifyContent: "space-between",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "clamp(30px,3vw,50px)",
                lineHeight: 1.12,
                letterSpacing: "-.02em",
                color: "#f2f3f5",
                maxWidth: 720,
                textWrap: "balance",
              }}
            >
              Systems that shipped. Methods that stuck.
            </h2>
            <div style={{ color: "#5c6370", fontSize: 13 }}>
              <span style={{ color: "#d97757" }}>$</span> git log --author=&quot;Sylvester Wong&quot;
            </div>
          </div>

          <div
            style={{
              marginTop: 52,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
              gap: 20,
              alignItems: "stretch",
            }}
          >
            {/* Recall */}
            <article
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #313a4e",
                borderRadius: 12,
                background: "#171b27",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  background: "#1b2030",
                  borderBottom: "1px solid #262c3d",
                  fontSize: 12,
                  color: "#8a93a3",
                }}
              >
                <span style={{ color: "#d97757" }}>▤</span> TheSylvester/crispy-recall
                <span
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#8cc265",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#8cc265",
                      display: "inline-block",
                    }}
                  ></span>
                  active
                </span>
              </div>
              <div style={{ padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f2f3f5" }}>Recall</h3>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.7, color: "#9aa3b2", flex: 1 }}>
                  Local memory for Claude Code and Codex. Every session saved verbatim and indexed — SQLite FTS5
                  keyword search fused with local semantic embeddings, so agents can search, read, and continue any
                  past conversation. No cloud, no LLM calls.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: "11.5px", color: "#7d8698" }}>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>TypeScript</span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>
                    SQLite · FTS5
                  </span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>llama.cpp</span>
                </div>
                <a
                  href="https://github.com/TheSylvester/crispy-recall"
                  className="hov-underline"
                  style={{ fontSize: 13 }}
                >
                  github.com/TheSylvester/crispy-recall →
                </a>
              </div>
            </article>

            {/* Crispy */}
            <article
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #313a4e",
                borderRadius: 12,
                background: "#171b27",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  background: "#1b2030",
                  borderBottom: "1px solid #262c3d",
                  fontSize: 12,
                  color: "#8a93a3",
                }}
              >
                <span style={{ color: "#d97757" }}>▤</span>{" "}
                <a href="https://github.com/TheSylvester/crispy" style={{ color: "#8a93a3" }}>
                  TheSylvester/crispy
                </a>
                <span style={{ marginLeft: "auto", color: "#7d8698" }}>archived</span>
              </div>
              <div style={{ padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f2f3f5" }}>Crispy</h3>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.7, color: "#9aa3b2", flex: 1 }}>
                  Multi-vendor agent harness orchestrating Claude Code and Codex through one adapter contract, across
                  five surfaces — VS Code, browser, CLI, desktop, and a Discord bot with remote agent control. Resume,
                  fork, and cross-vendor fork any session mid-conversation.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: "11.5px", color: "#7d8698" }}>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>Agent SDK</span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>MCP</span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>Tauri</span>
                </div>
                <a href="https://crispy.thesylvester.ca" className="hov-underline" style={{ fontSize: 13 }}>
                  crispy.thesylvester.ca →
                </a>
              </div>
            </article>

            {/* Fusionthink */}
            <article
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #313a4e",
                borderRadius: 12,
                background: "#171b27",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 18px",
                  background: "#1b2030",
                  borderBottom: "1px solid #262c3d",
                  fontSize: 12,
                  color: "#8a93a3",
                }}
              >
                <span style={{ color: "#d97757" }}>◈</span> fusionthink
                <span style={{ marginLeft: "auto", color: "#7d8698" }}>in daily use</span>
              </div>
              <div style={{ padding: "22px 22px 24px", display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f2f3f5" }}>Fusionthink</h3>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.7, color: "#9aa3b2", flex: 1 }}>
                  Multi-vendor adversarial review for coding agents. A Claude reviewer and a Codex reviewer take the
                  same brief, every claim is verified against the real code, weak findings get pushed back, and
                  disagreements are settled across vendors. Distilled from a review loop run 186+ times in my own
                  sessions.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: "11.5px", color: "#7d8698" }}>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>Claude Code</span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>Codex CLI</span>
                  <span style={{ border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px" }}>Agent Skills</span>
                </div>
                <span style={{ fontSize: 13, color: "#7d8698" }}>Claude Code skill · release in planning</span>
              </div>
            </article>
          </div>

          {/* guide band */}
          <div
            id="about"
            style={{
              marginTop: 26,
              border: "1px solid rgba(217,119,87,.35)",
              borderRadius: 12,
              background: "linear-gradient(120deg,rgba(217,119,87,.09),rgba(217,119,87,.02) 55%)",
              padding: "clamp(26px,3vw,42px)",
              display: "grid",
              gridTemplateColumns: "minmax(300px,1.3fr) auto",
              gap: 28,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 12, letterSpacing: ".3em", color: "#d97757" }}>MY CLAUDE CODE GUIDE</div>
              <h3
                style={{
                  margin: "16px 0 0",
                  fontSize: "clamp(22px,2.1vw,32px)",
                  fontWeight: 700,
                  color: "#f2f3f5",
                  lineHeight: 1.2,
                  textWrap: "balance",
                }}
              >
                How I actually use AI to build software.
              </h3>
              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "13.5px",
                  lineHeight: 1.75,
                  color: "#9aa3b2",
                  maxWidth: 640,
                  textWrap: "pretty",
                }}
              >
                The working method behind everything above — context-isolated task handoffs, self-testing sub-agents,
                automated review validation. Adopted as a 5-person team’s default workflow; review resolution time cut
                by 50%. Written up as notes, tips, and tools you can use.
              </p>
              <div
                style={{
                  marginTop: 22,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0,
                  alignItems: "center",
                  fontSize: "12.5px",
                  color: "#c8ccd4",
                }}
              >
                <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px" }}>research</span>
                <span style={{ color: "#d97757", padding: "0 8px" }}>→</span>
                <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px" }}>plan</span>
                <span style={{ color: "#d97757", padding: "0 8px" }}>→</span>
                <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px" }}>delegate</span>
                <span style={{ color: "#d97757", padding: "0 8px" }}>→</span>
                <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px" }}>review</span>
                <span style={{ color: "#d97757", padding: "0 8px" }}>→</span>
                <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px" }}>retain</span>
              </div>
            </div>
            <Link
              href="/guide"
              className="hov-cta"
              style={{
                justifySelf: "end",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "16px 28px",
                border: "1px solid #d97757",
                borderRadius: 8,
                color: "#d97757",
                fontSize: 14,
                letterSpacing: ".1em",
                background: "rgba(217,119,87,.06)",
                whiteSpace: "nowrap",
              }}
            >
              <span>&gt;_</span> READ THE GUIDE
            </Link>
          </div>

          {/* track record strip */}
          <div
            style={{
              marginTop: 26,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
              gap: 20,
              border: "1px solid #262c3d",
              borderRadius: 12,
              background: "#171b27",
              padding: "24px 28px",
              fontSize: "12.5px",
              lineHeight: 1.65,
            }}
          >
            <div>
              <div style={{ color: "#e6e9ee" }}>
                Antidote Health <span style={{ color: "#5c6370" }}>· 2026–present</span>
              </div>
              <div style={{ color: "#7d8698" }}>
                Australian telehealth platform — patient booking, Stripe payments, EHR/FHIR integration
              </div>
            </div>
            <div>
              <div style={{ color: "#e6e9ee" }}>
                Claro Customs AI <span style={{ color: "#5c6370" }}>· 2024–25</span>
              </div>
              <div style={{ color: "#7d8698" }}>
                Conversational AI for a Canada/US customs platform — document ingestion accuracy 70% → 95%, e2e test
                cycles 15 → 5 min
              </div>
            </div>
            <div>
              <div style={{ color: "#e6e9ee" }}>
                PromptCore <span style={{ color: "#5c6370" }}>· 2024</span>
              </div>
              <div style={{ color: "#7d8698" }}>
                Human-in-the-loop LLM evaluation; workflow runner &gt;50% faster than Microsoft Prompt Flow
              </div>
            </div>
            <div>
              <div style={{ color: "#e6e9ee" }}>
                LighthouseAI <span style={{ color: "#5c6370" }}>· 2023–24</span>
              </div>
              <div style={{ color: "#7d8698" }}>
                Agentic workflows lifted GPT-3.5 to GPT-4-level classification (70% → 90%+)
              </div>
            </div>
            <div>
              <div style={{ color: "#e6e9ee" }}>
                VS Code <span style={{ color: "#5c6370" }}>· open source</span>
              </div>
              <div style={{ color: "#7d8698" }}>UX enhancement PR merged into the mainline release</div>
            </div>
          </div>

          {/* footer */}
          <footer
            style={{
              marginTop: "clamp(60px,8vh,100px)",
              borderTop: "1px solid #262c3d",
              padding: "26px 0 90px",
              display: "flex",
              flexWrap: "wrap",
              gap: "16px 32px",
              alignItems: "center",
              fontSize: "12.5px",
            }}
          >
            <span style={{ color: "#5c6370" }}>© 2026 Sylvester Wong · Toronto, ON</span>
            <div style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", gap: "16px 28px" }}>
              <a href="/Sylvester_Wong_Resume.pdf" className="hov-footer" style={{ color: "#9aa3b2" }}>
                resume.pdf ↓
              </a>
              <a
                href="https://github.com/TheSylvester/crispy-recall"
                className="hov-footer"
                style={{ color: "#9aa3b2" }}
              >
                github/crispy-recall
              </a>
              <a href="https://github.com/TheSylvester/crispy" className="hov-footer" style={{ color: "#9aa3b2" }}>
                github/crispy
              </a>
              <a
                href="https://www.linkedin.com/in/sylvester-wong-41552256"
                className="hov-footer"
                style={{ color: "#9aa3b2" }}
              >
                linkedin
              </a>
              <CopyEmail className="hov-footer" style={{ color: "#9aa3b2" }}>
                sylvester@thesylvester.ca
              </CopyEmail>
            </div>
          </footer>
        </div>
      </section>

      {/* status bar — fixed viewport overlay, above all content */}
      <StatusBar />
    </div>
  );
}
