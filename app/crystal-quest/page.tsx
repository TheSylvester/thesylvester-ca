import type { Metadata } from "next";
import Link from "next/link";
import CopyEmail from "@/components/copy-email";
import CrystalQuestGame from "@/components/crystal-quest-game";

export const metadata: Metadata = {
  title: "Crystal Quest — Sylvester Wong",
  description:
    "Patrick Buckland's 1987 Macintosh classic, recreated on canvas with physics constants lifted from a disassembly of the original 68K binary.",
};

const cardStyle = { border: "1px solid #313a4e", borderRadius: 12, background: "#171b27", overflow: "hidden" } as const;
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

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        border: "1px solid #3a4152",
        borderRadius: 5,
        padding: "1px 7px",
        color: "#c8ccd4",
        minWidth: 62,
        textAlign: "center",
      }}
    >
      {children}
    </span>
  );
}

export default function CrystalQuest() {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#12151f",
        color: "#c8ccd4",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: "clamp(28px,4vh,56px) clamp(28px,4vw,72px)",
      }}
    >
      <div style={{ maxWidth: 760, width: "100%", margin: "0 auto", flex: 1 }}>
        <Link href="/" className="hov-footer" style={{ color: "#9aa3b2", fontSize: 13 }}>
          ← thesylvester.ca
        </Link>

        <div style={{ marginTop: 48, fontSize: 12, letterSpacing: ".3em", color: "#d97757" }}>CRYSTAL QUEST</div>
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
          The 1987 Mac classic, in terminal colors.
        </h1>
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
          Patrick Buckland&apos;s mouse-and-inertia arcade game — the first color game on the Macintosh. Collect every
          crystal, dodge the nasties pouring out of the side portals, and escape through the gate at the bottom. The
          mouse changes your <em style={{ color: "#e6e9ee", fontStyle: "normal" }}>velocity</em>, not your position;
          stopping is the hard part. Needs a mouse.
        </p>

        <div style={{ marginTop: 32, ...cardStyle }}>
          <div style={cardHeadStyle}>
            <span style={{ color: "#d97757" }}>◈</span>
            <span>crystal-quest</span>
            <span style={{ marginLeft: "auto", color: "#7d8698" }}>after Casady &amp; Greene · 1987</span>
          </div>
          <CrystalQuestGame />
        </div>

        <div style={{ marginTop: 32, ...cardStyle }}>
          <div style={cardHeadStyle}>
            <span style={{ color: "#d97757" }}>❯</span>
            <span>man crystal-quest</span>
          </div>
          <div style={{ padding: "18px 18px 20px", fontSize: "12.5px", lineHeight: 2.05, overflowX: "auto" }}>
            <div style={{ whiteSpace: "nowrap" }}>
              <Key>mouse</Key> <span style={{ color: "#7d8698" }}>sets your velocity — there is no friction and no brake</span>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <Key>click · a–z</Key> <span style={{ color: "#7d8698" }}>fire, always in the direction of motion · five bullets at a time</span>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <Key>space</Key> <span style={{ color: "#7d8698" }}>smart bomb — kills everything on screen, but not mines</span>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <Key>tab</Key> <span style={{ color: "#7d8698" }}>pause · any key or the mouse button continues</span>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <Key>0–9</Key> <span style={{ color: "#7d8698" }}>volume · 0 is silent, 9 is painfully LOUD</span>
            </div>
            <div style={{ marginTop: 10, whiteSpace: "nowrap" }}>
              <span style={{ color: "#8cc265" }}>&gt; catch the big drifting crystal for 10,000–50,000 — shoot it and you lose it</span>
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <span style={{ color: "#8cc265" }}>&gt; nasties only spawn while you collect — loitering is safe, and worthless</span>
            </div>
          </div>
        </div>

        <p style={{ margin: "24px 0 0", fontSize: "11.5px", lineHeight: 1.8, color: "#5c6370", maxWidth: 640 }}>
          Physics constants lifted from a disassembly of the original 68K binary: ship velocity = (mouse offset from
          neutral) ÷ 10, clamped to ±9 px per update at 30 updates a second on a 512×342 field; bullets fly at 4× ship
          velocity; 3 ships, 3 bombs; bonus ships every 15,000 points to wave 11, 40,000 to wave 26, 75,000 after. The
          walls never kill you. The gate posts always do.
        </p>

        <div
          style={{
            marginTop: 56,
            paddingTop: 26,
            borderTop: "1px solid #262c3d",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px 28px",
            fontSize: "12.5px",
          }}
        >
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
