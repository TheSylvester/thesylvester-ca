"use client";

import { useState } from "react";

const QUESTIONS = [
  "Why did you build Recall?",
  "How do you delegate work to agents?",
  "What should every developer know about AI?",
  "How did Crispy evolve?",
];

export default function AskPanel() {
  const [ask, setAsk] = useState("");

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
      <div style={{ color: "#8cc265", fontSize: 13 }}>Ask me anything about how I build with AI.</div>
      <div style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
        <div
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
          type="button"
          title="Coming soon"
          aria-disabled="true"
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
      </div>
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {QUESTIONS.map((label) => (
          <button key={label} type="button" className="ask-chip" onClick={() => setAsk(label)}>
            <span style={{ color: "#d97757" }}>❯</span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
