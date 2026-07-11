import type { Metadata } from "next";
import Link from "next/link";
import CopyEmail from "@/components/copy-email";

export const metadata: Metadata = {
  title: "Fusionthink — Sylvester Wong",
  description:
    "Multi-vendor adversarial review for coding agents. A Claude reviewer and a Codex reviewer take the identical brief; every claim verified, weak findings pushed back, disputes settled cross-vendor.",
};

const cardStyle = {
  border: "1px solid #313a4e",
  borderRadius: 12,
  background: "#171b27",
  overflow: "hidden",
} as const;

const cardHeadStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "12px 18px",
  background: "#1b2030",
  borderBottom: "1px solid #262c3d",
  fontSize: 12,
  color: "#8a93a3",
} as const;

const kickerStyle = {
  fontSize: 12,
  letterSpacing: ".3em",
  color: "#d97757",
} as const;

function Chip({ children }: { children: React.ReactNode }) {
  return <span style={{ border: "1px solid #3a4152", borderRadius: 6, padding: "7px 12px", whiteSpace: "nowrap" }}>{children}</span>;
}

function Arrow() {
  return <span style={{ color: "#d97757", padding: "0 8px" }}>→</span>;
}

export default function Fusionthink() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#12151f",
        color: "#c8ccd4",
        boxSizing: "border-box",
        padding: "clamp(28px,4vh,56px) clamp(28px,4vw,72px)",
      }}
    >
      <div style={{ maxWidth: 760, width: "100%", margin: "0 auto" }}>
        <Link href="/" className="hov-footer" style={{ color: "#9aa3b2", fontSize: 13 }}>
          ← thesylvester.ca
        </Link>

        <div style={{ ...kickerStyle, marginTop: 48 }}>FUSIONTHINK · MULTI-VENDOR ADVERSARIAL REVIEW</div>
        <h1
          style={{
            margin: "16px 0 0",
            fontSize: "clamp(22px,2.1vw,32px)",
            fontWeight: 700,
            color: "#f2f3f5",
            lineHeight: 1.2,
            textWrap: "balance",
          }}
        >
          A review loop that trusts neither reviewer.
          <span
            aria-hidden="true"
            className="cursor-blink"
            style={{
              display: "inline-block",
              width: ".55em",
              height: "1.05em",
              marginLeft: 8,
              background: "#d97757",
              verticalAlign: "text-bottom",
            }}
          />
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: "13.5px", lineHeight: 1.75, color: "#9aa3b2", maxWidth: 640, textWrap: "pretty" }}>
          A Claude reviewer and a Codex reviewer take the <span style={{ color: "#c8ccd4", fontWeight: 500 }}>identical brief</span>,
          in parallel. Every claim is verified against the real code before it reaches you. Weak findings get pushed
          back to the reviewer that made them. Live disputes are settled by the other vendor. Distilled from a review
          loop run 186+ times in my own sessions.
        </p>

        <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: "8px 0", alignItems: "center", fontSize: "12.5px", color: "#c8ccd4" }}>
          <Chip>dispatch</Chip>
          <Arrow />
          <Chip>verify</Chip>
          <Arrow />
          <Chip>push back</Chip>
          <Arrow />
          <Chip>settle</Chip>
          <Arrow />
          <Chip>converge</Chip>
        </div>

        {/* one round, as it actually reads */}
        <div style={{ ...cardStyle, marginTop: 28 }}>
          <div style={cardHeadStyle}>
            <span style={{ color: "#d97757" }}>◈</span> fusionthink — converge mode
            <span style={{ marginLeft: "auto", color: "#7d8698" }}>round 2 of 5</span>
          </div>
          <div style={{ padding: "18px 18px 20px", overflowX: "auto", fontSize: "12.5px", lineHeight: 2.05, whiteSpace: "nowrap" }}>
            <div>
              <span style={{ color: "#d97757" }}>❯</span> <span style={{ color: "#7d8698" }}>dispatch</span>{" "}
              identical brief → claude + codex, in parallel
            </div>
            <div>
              <span style={{ color: "#d97757" }}>❯</span> <span style={{ color: "#7d8698" }}>claude</span>{" "}
              <span style={{ color: "#e6e9ee" }}>&quot;race in session cleanup&quot;</span>{" "}
              <span style={{ color: "#7d8698" }}>· reproduced at session-manager.ts:142 —</span>{" "}
              <span style={{ color: "#d97757" }}>CONFIRMED</span>
            </div>
            <div>
              <span style={{ color: "#d97757" }}>❯</span> <span style={{ color: "#7d8698" }}>codex</span>{" "}
              <span style={{ color: "#e6e9ee" }}>&quot;unbounded retry loop&quot;</span>{" "}
              <span style={{ color: "#7d8698" }}>· retries capped at 3 —</span>{" "}
              <span style={{ color: "#e6e9ee" }}>PUSHED BACK</span>
            </div>
            <div>
              <span style={{ color: "#d97757" }}>❯</span>{" "}
              <span style={{ color: "#7d8698" }}>codex defends · dispute settled by claude —</span> cap unreachable on
              error path <span style={{ color: "#d97757" }}>CONFIRMED</span>
            </div>
            <div>
              <span style={{ color: "#d97757" }}>❯</span>{" "}
              <span style={{ color: "#7d8698" }}>round 2 · fixes applied · re-dispatch —</span>{" "}
              <span style={{ color: "#8cc265" }}>VERDICT: READY</span> <span style={{ color: "#7d8698" }}>·</span>{" "}
              <span style={{ color: "#8cc265" }}>VERDICT: READY</span>
            </div>
          </div>
        </div>

        {/* two modes */}
        <div style={{ marginTop: 52 }}>
          <div style={kickerStyle}>TWO MODES</div>
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
            <div style={{ border: "1px solid #313a4e", borderRadius: 12, background: "#171b27", padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f2f3f5" }}>
                <span style={{ color: "#d97757", marginRight: 8 }}>◇</span>review
              </h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#9aa3b2" }}>
                Both reviewers report; nothing is taken on faith. You get four buckets — confirmed issues,
                disputed-and-settled (who said what, who won, why), rejected false positives, and genuinely open
                questions. You decide what to fix.
              </p>
            </div>
            <div style={{ border: "1px solid #313a4e", borderRadius: 12, background: "#171b27", padding: "20px 20px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#f2f3f5" }}>
                <span style={{ color: "#d97757", marginRight: 8 }}>◆</span>converge
              </h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: "#9aa3b2" }}>
                The loop closes. Confirmed issues get fixed, both reviewers re-examine in their original sessions, and
                rounds continue until both return <span style={{ color: "#8cc265" }}>VERDICT: READY</span>. Reviewers
                stay read-only throughout. Hard cap of five rounds.
              </p>
            </div>
          </div>
        </div>

        {/* install */}
        <div style={{ marginTop: 52 }}>
          <div style={kickerStyle}>INSTALL</div>
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={cardHeadStyle}>
              <span style={{ color: "#d97757" }}>❯</span> claude
              <span style={{ marginLeft: "auto", color: "#7d8698" }}>~60 seconds</span>
            </div>
            <div style={{ padding: "18px 18px 20px", overflowX: "auto", fontSize: "12.5px", lineHeight: 2.05, whiteSpace: "nowrap", color: "#e6e9ee" }}>
              <div>
                <span style={{ color: "#d97757" }}>❯</span> /plugin marketplace add TheSylvester/fusionthink
              </div>
              <div>
                <span style={{ color: "#d97757" }}>❯</span> /plugin install fusionthink@thesylvester
              </div>
            </div>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: "12.5px", lineHeight: 1.8, color: "#7d8698" }}>
            no plugin system? copy <code style={{ color: "#9aa3b2" }}>skills/fusionthink</code> out of the repo into{" "}
            <code style={{ color: "#9aa3b2" }}>~/.claude/skills</code> — the folder is self-contained.
            <br />
            Codex CLI support — same repo, <code style={{ color: "#9aa3b2" }}>~/.codex/skills</code> — coming next.
          </p>
          <a href="https://github.com/TheSylvester/fusionthink" className="hov-underline" style={{ display: "inline-block", marginTop: 18, fontSize: 13 }}>
            github.com/TheSylvester/fusionthink →
          </a>
        </div>

        {/* requirements */}
        <div style={{ marginTop: 52 }}>
          <div style={kickerStyle}>REQUIREMENTS</div>
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
              <span style={{ flex: "none", border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px", fontSize: "11.5px", color: "#c8ccd4", whiteSpace: "nowrap" }}>
                claude
              </span>
              <span style={{ fontSize: 13, color: "#9aa3b2", lineHeight: 1.7 }}>
                Claude Code CLI, authenticated. The orchestrating agent runs the loop; a second Claude session acts as
                one of the two reviewers.
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
              <span style={{ flex: "none", border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px", fontSize: "11.5px", color: "#c8ccd4", whiteSpace: "nowrap" }}>
                codex
              </span>
              <span style={{ fontSize: 13, color: "#9aa3b2", lineHeight: 1.7 }}>
                OpenAI Codex CLI ≥ 0.80 with a ChatGPT account or API key. Yes, the Codex half needs its own
                subscription — that&apos;s the honest cost of a second vendor.
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline" }}>
              <span style={{ flex: "none", border: "1px solid #313a4e", borderRadius: 5, padding: "4px 9px", fontSize: "11.5px", color: "#c8ccd4", whiteSpace: "nowrap" }}>
                safety
              </span>
              <span style={{ fontSize: 13, color: "#9aa3b2", lineHeight: 1.7 }}>
                The wrapper scripts run both CLIs with approval prompts bypassed. Reviewers are instructed read-only,
                but read the safety notes in the README before installing.
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 56, paddingTop: 26, borderTop: "1px solid #262c3d", display: "flex", flexWrap: "wrap", gap: "16px 28px", fontSize: "12.5px" }}>
          <CopyEmail className="hov-footer" style={{ color: "#9aa3b2" }}>
            sylvester@thesylvester.ca
          </CopyEmail>
          <a href="https://github.com/TheSylvester" className="hov-footer" style={{ color: "#9aa3b2" }}>
            github.com/TheSylvester
          </a>
        </div>
      </div>
    </div>
  );
}
