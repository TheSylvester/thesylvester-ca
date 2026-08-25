import { ImageResponse } from "next/og";

export const alt = "Sylvester Wong — Coding Agent Field Notes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 84px",
        color: "#c8ccd4",
        background: "#12151f",
        fontFamily: "monospace",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, letterSpacing: 2 }}>
        <span style={{ color: "#d97757" }}>&gt;_ thesylvester.ca</span>
        <span style={{ color: "#687186" }}>BLOG / LIVING GUIDE</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 960 }}>
        <div style={{ color: "#d97757", fontSize: 24, letterSpacing: 5 }}>CODING AGENT FIELD NOTES</div>
        <div style={{ marginTop: 28, color: "#f2f3f5", fontSize: 64, lineHeight: 1.14, fontWeight: 700 }}>
          How I actually use AI to build software.
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, color: "#858ea0", fontSize: 23 }}>
        <span>context</span>
        <span style={{ color: "#d97757" }}>→</span>
        <span>handoffs</span>
        <span style={{ color: "#d97757" }}>→</span>
        <span>verification</span>
      </div>
    </div>,
    size,
  );
}
