import Link from "next/link";
import type { ReactNode } from "react";

type PublicationShellProps = {
  active?: "blog" | "guide";
  children: ReactNode;
};

export default function PublicationShell({ active, children }: PublicationShellProps) {
  return (
    <div className="publication-shell">
      <header className="publication-header">
        <Link href="/" className="publication-home" aria-label="Sylvester Wong home">
          <span aria-hidden="true" className="publication-prompt">
            &gt;_
          </span>
          <span>thesylvester.ca</span>
        </Link>
        <nav aria-label="Publication">
          <Link href="/guide" aria-current={active === "guide" ? "page" : undefined}>
            guide
          </Link>
          <Link href="/blog" aria-current={active === "blog" ? "page" : undefined}>
            blog
          </Link>
          <a href="/feed.xml">rss</a>
        </nav>
      </header>

      <main className="publication-main">{children}</main>

      <footer className="publication-footer">
        <span>Notes from an AI software engineer in Toronto.</span>
        <span>
          <a href="mailto:sylvester@thesylvester.ca">email</a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/TheSylvester">github</a>
        </span>
      </footer>
    </div>
  );
}
