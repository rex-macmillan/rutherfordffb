import { GetStaticProps } from "next";
import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect, useMemo, useState } from "react";
import { SlideUpDemo } from "../components/SlideUpDemo";
import { RulesChat } from "../components/RulesChat";
import { cn } from "../lib/cn";

interface RulesPageProps {
  content: string;
  sections: { id: string; title: string }[];
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const getStaticProps: GetStaticProps<RulesPageProps> = async () => {
  const filePath = path.join(process.cwd(), "keeper_league_rulebook.md");
  const content = fs.readFileSync(filePath, "utf-8");
  // Build a TOC from H2 headings.
  const sections: { id: string; title: string }[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      const title = match[1].trim();
      sections.push({ id: slugify(title), title });
    }
  }
  return { props: { content, sections } };
};

export default function RulesPage({ content, sections }: RulesPageProps) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  // Highlight the TOC entry whose section is currently in view.
  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [sections]);

  const markdownComponents = useMemo(
    () => ({
      h2: ({ children, ...rest }: any) => {
        const text = String(children);
        return (
          <h2 id={slugify(text)} {...rest}>
            {children}
          </h2>
        );
      },
    }),
    [],
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[200px_1fr]">
      <aside className="hidden lg:sticky lg:top-24 lg:block lg:h-fit">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          On this page
        </div>
        <nav className="space-y-1 text-sm">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={cn(
                "block rounded px-2 py-1 transition-colors",
                activeId === s.id
                  ? "bg-brand-50 text-brand-800 font-medium"
                  : "text-ink-600 hover:bg-ink-100",
              )}
            >
              {s.title}
            </a>
          ))}
          <a
            href="#ask"
            className={cn(
              "block rounded px-2 py-1 transition-colors",
              activeId === "ask"
                ? "bg-brand-50 text-brand-800 font-medium"
                : "text-ink-600 hover:bg-ink-100",
            )}
          >
            Ask the rulebook
          </a>
          <a
            href="#try-it"
            className={cn(
              "block rounded px-2 py-1 transition-colors",
              activeId === "try-it"
                ? "bg-brand-50 text-brand-800 font-medium"
                : "text-ink-600 hover:bg-ink-100",
            )}
          >
            Try it: slide-up demo
          </a>
        </nav>
      </aside>

      <article className="prose prose-slate max-w-none prose-h1:text-3xl prose-h2:mt-10 prose-h2:scroll-mt-24 prose-table:text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>

        <h2 id="ask">Ask the rulebook</h2>
        <RulesChat />

        <h2 id="try-it">Try it: slide-up demo</h2>
        <SlideUpDemo />
      </article>
    </div>
  );
}
