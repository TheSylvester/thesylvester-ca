"use client";

import { useEffect, useRef, useCallback } from "react";

const LETTERS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ-&";
const LINE_HEIGHT = 1.2;
const TRANSITION_DURATION_S = 1;
const DELAY_PER_LETTER_S = 0.2;
const SPACER_SWAP_DELAY_MS = 500;
const WIDTH_CHANGE_MS = 2000;
const INTERVAL_MS = 4500;

interface FlipBannerProps {
  phrases: string[];
  className?: string;
  hotColor?: string;
  coldColor?: string;
}

export function FlipBanner({
  phrases,
  className = "",
  hotColor = "#FFFFFF",
  warmColor = "#F97316", // orange
  coldColor = "#78716c", // stone-500
}: FlipBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clamp = (min: number, mid: number, max: number) =>
    Math.floor(Math.min(Math.max(mid, min), max));

  const wrap = (num: number, min: number, max: number) =>
    ((((num - min) % (max - min)) + (max - min)) % (max - min)) + min;

  const setup = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous
    container.innerHTML = "";
    if (intervalRef.current) clearInterval(intervalRef.current);

    const maxLength = Math.max(...phrases.map((p) => p.length));
    const paddedStrings = phrases.map((p) => {
      const upper = p.toUpperCase();
      const totalPad = maxLength - upper.length;
      const leftPad = Math.floor(totalPad / 2);
      const rightPad = totalPad - leftPad;
      return " ".repeat(leftPad) + upper + " ".repeat(rightPad);
    });

    const vw = Math.floor(window.innerWidth / 100);
    const fontSizeMidVw = window.innerWidth > 799 ? 2 : 4;
    const fontSize = clamp(14, fontSizeMidVw * vw, 32);

    container.style.setProperty("--fs", fontSize + "px");

    // Build character columns
    for (let i = 0; i < maxLength; i++) {
      const charDiv = document.createElement("div");
      charDiv.className = "fb-char";

      const spacer = document.createElement("div");
      spacer.className = "fb-spacer";
      charDiv.appendChild(spacer);

      const pillar = document.createElement("div");
      pillar.className = "fb-pillar";
      for (const letter of LETTERS) {
        const letterDiv = document.createElement("div");
        letterDiv.className = "fb-letter";
        letterDiv.innerHTML = letter === " " ? "&nbsp;" : letter;
        pillar.appendChild(letterDiv);
      }
      charDiv.appendChild(pillar);
      container.appendChild(charDiv);
    }

    const changeLetter = (pillar: HTMLElement, char: string, index: number) => {
      const top = fontSize * -LETTERS.indexOf(char) * LINE_HEIGHT;
      // Stagger from center outward
      const center = (maxLength - 1) / 2;
      const distFromCenter = Math.abs(index - center) / center; // 0 at center, 1 at edges
      pillar.style.transitionDelay =
        distFromCenter * TRANSITION_DURATION_S + DELAY_PER_LETTER_S + "s";
      pillar.style.top = top + "px";

      const spacer = pillar.parentElement?.querySelector(".fb-spacer");
      if (spacer) {
        setTimeout(() => {
          spacer.textContent = char;
        }, SPACER_SWAP_DELAY_MS);
      }
    };

    const changeWord = (word: string) => {
      container.querySelectorAll(".fb-pillar").forEach((el, i) => {
        changeLetter(el as HTMLElement, word[i], i);
      });
    };

    const changeColor = (color: string) => {
      container.querySelectorAll(".fb-pillar").forEach((el) => {
        (el as HTMLElement).style.color = color;
      });
    };

    const changeWidth = (width: number) => {
      container.querySelectorAll(".fb-char").forEach((el) => {
        (el as HTMLElement).style.minWidth = `${width}px`;
      });
    };

    let wordIndex = 0;

    // Initial word
    setTimeout(() => {
      changeColor(hotColor);
      changeWord(paddedStrings[wordIndex]);
      setTimeout(() => changeColor(warmColor), 1000);
      setTimeout(() => changeColor(coldColor), WIDTH_CHANGE_MS + 2000);
    }, 100);

    intervalRef.current = setInterval(() => {
      changeColor(hotColor);
      changeWidth(fontSize * 0.8);
      wordIndex = wrap(wordIndex + 1, 0, paddedStrings.length);
      changeWord(paddedStrings[wordIndex]);
      setTimeout(() => changeColor(warmColor), 1000);
      setTimeout(() => {
        changeColor(coldColor);
        changeWidth(Math.floor(fontSize / 5));
      }, WIDTH_CHANGE_MS);
    }, INTERVAL_MS);
  }, [phrases, hotColor, warmColor, coldColor]);

  useEffect(() => {
    setup();
    const handleResize = () => setup();
    window.addEventListener("resize", handleResize);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [setup]);

  return (
    <div className={`fb-anchor ${className}`}>
      <div className="fb-wrapper">
        <div ref={containerRef} className="fb-container" />
      </div>
    </div>
  );
}
