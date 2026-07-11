"use client";

import Link from "next/link";
import { useState } from "react";

const QUESTIONS = [
  "Why did you build Recall?",
  "How do you delegate work to agents?",
  "What should every developer know about AI?",
  "How did Crispy evolve?",
];

const DISCORD_INVITE = "https://discord.gg/e2vw4bTPup";
const EMAIL = "sylvester@thesylvester.ca";

export default function AskPanel() {
  const [ask, setAsk] = useState("");
  const [asked, setAsked] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = ask.trim();
    if (!q) return;
    setAsked(q);
    setAsk("");
  }

  return (
    <div
      style={{
        position: "relative",
        zIndex: 3,
        margin: "26px auto 0",
        width: "min(1560px,calc(100% - 56px))",
        border: "1px solid #313a4e",
        borderRadius: 12,
        background: "rgba(23,27,39,.9)",
        backdropFilter: "blur(8px)",
        padding: "20px 24px 22px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ color: "#8cc265", fontSize: 13 }}>Ask me anything about how I build with AI.</div>
        <div
          style={{
            border: "1px solid #313a4e",
            borderRadius: 5,
            padding: "3px 9px",
            fontSize: 11,
            letterSpacing: ".12em",
            color: "#7d8698",
          }}
        >
          <span style={{ color: "#d97757" }}>●</span> MODEL OFFLINE
        </div>
      </div>
      <form onSubmit={handleSubmit} style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
        <div
          className="ask-input-wrap"
          style={{
            flex: 1,
            minWidth: 260,
            display: "flex",
            alignItems: "center",
            gap: 10,
            border: "1px solid #3a4152",
            borderRadius: 8,
            padding: "0 16px",
            background: "#161a26",
          }}
        >
          <span style={{ color: "#d97757" }}>❯</span>
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="How do you review agent-written code?"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#e6e9ee",
              fontFamily: "inherit",
              fontSize: "13.5px",
              padding: "14px 0",
            }}
          />
        </div>
        <button
          type="submit"
          className="hov-ask"
          style={{
            cursor: "pointer",
            fontFamily: "inherit",
            background: "transparent",
            border: "1px solid #d97757",
            borderRadius: 8,
            color: "#d97757",
            fontSize: 13,
            letterSpacing: ".14em",
            padding: "0 34px",
          }}
        >
          ASK
        </button>
        <div style={{ alignSelf: "center", color: "#5c6370", fontSize: "12.5px" }}>(↵ to submit)</div>
      </form>
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {QUESTIONS.map((label) => (
          <button key={label} type="button" className="ask-chip" onClick={() => setAsk(label)}>
            <span style={{ color: "#d97757" }}>❯</span>
            {label}
          </button>
        ))}
      </div>
      {asked !== null && (
        <div
          key={asked}
          className="out-divider"
          aria-live="polite"
          style={{ marginTop: 16, borderTop: "1px solid #232a3a", paddingTop: 14, fontSize: 13, lineHeight: 1.8 }}
        >
          <div className="out-line" style={{ ["--o" as string]: 0, color: "#7d8698" }}>
            <span style={{ color: "#d97757" }}>❯ </span>
            {asked}
          </div>
          <div className="out-line" style={{ ["--o" as string]: 1, color: "#8cc265" }}>
            {"> model offline — training data still being written at "}
            <Link href="/guide" className="hov-underline" style={{ color: "#d97757" }}>
              /guide
            </Link>
          </div>
          <div className="out-line" style={{ ["--o" as string]: 2, color: "#8cc265" }}>
            {"> ask me directly: "}
            <a
              href={DISCORD_INVITE}
              target="_blank"
              rel="noreferrer"
              className="hov-underline"
              style={{ color: "#d97757" }}
            >
              Discord
            </a>
            {" · "}
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent(asked)}`}
              className="hov-underline"
              style={{ color: "#d97757" }}
            >
              email
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
