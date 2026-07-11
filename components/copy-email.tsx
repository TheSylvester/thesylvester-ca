"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const EMAIL = "sylvester@thesylvester.ca";

export default function CopyEmail({
  style,
  className,
  children,
  copiedLabel = "copied ✓",
}: {
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
  copiedLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onClick = () => {
    navigator.clipboard.writeText(EMAIL);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={className}
      title={`Copy ${EMAIL}`}
      style={{
        position: "relative",
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        letterSpacing: "inherit",
        textAlign: "inherit",
        cursor: "pointer",
        ...style,
      }}
    >
      <span style={copied ? { visibility: "hidden" } : undefined}>{children}</span>
      {copied && (
        <span
          aria-live="polite"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            whiteSpace: "nowrap",
            color: "#8cc265",
          }}
        >
          {copiedLabel}
        </span>
      )}
    </button>
  );
}
