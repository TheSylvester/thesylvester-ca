import type { Metadata } from "next";
import Link from "next/link";
import CopyEmail from "@/components/copy-email";

export const metadata: Metadata = {
  title: "The Playbook — Sylvester Wong",
};

export default function Playbook() {
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
      <div style={{ maxWidth: 760, width: "100%", margin: "0 auto", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Link href="/" className="hov-footer" style={{ color: "#9aa3b2", fontSize: 13 }}>
          ← thesylvester.ca
        </Link>

        <div style={{ marginTop: 48, fontSize: 12, letterSpacing: ".3em", color: "#d97757" }}>THE PLAYBOOK</div>
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
          How I actually use AI to build software.
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
          The working method behind the site — context-isolated task handoffs, self-testing sub-agents, automated
          review validation. Notes are being written — coming soon.
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

        <div
          style={{
            marginTop: 48,
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
