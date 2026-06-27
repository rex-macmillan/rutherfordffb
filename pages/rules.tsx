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
      // Let wide rulebook tables scroll horizontally on phones instead of
      // overflowing the reading column.
      table: ({ children, ...rest }: any) => (
        <div className="relative scroll-x-fade">
          <div className="scroll-x no-scrollbar overflow-x-auto">
            <table {...rest}>{children}</table>
          </div>
        </div>
      ),
    }),
    [],
  );

  const tocItems = useMemo(
    () => [
      ...sections,
      { id: "ask", title: "Ask the rulebook" },
      { id: "try-it", title: "Try it: slide-up demo" },
    ],
    [sections],
  );

  const tocLink = (id: string, title: string) => (
    <a
      key={id}
      href={`#${id}`}
      className={cn(
        "block rounded px-2 py-1 transition-colors",
        activeId === id
          ? "bg-brand-50 text-brand-800 font-medium"
          : "text-ink-600 hover:bg-ink-100",
      )}
    >
      {title}
    </a>
  );

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[200px_1fr] lg:gap-8">
      {/* Mobile: collapsible TOC at the top */}
      <details className="rounded-lg border border-ink-200 bg-white lg:hidden">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          On this page
        </summary>
        <nav className="space-y-1 px-2 pb-2 text-sm">
          {tocItems.map((s) => tocLink(s.id, s.title))}
        </nav>
      </details>

      {/* Desktop: sticky sidebar */}
      <aside className="hidden lg:sticky lg:top-24 lg:block lg:h-fit">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
          On this page
        </div>
        <nav className="space-y-1 text-sm">
          {tocItems.map((s) => tocLink(s.id, s.title))}
        </nav>
      </aside>

      <article className="prose prose-slate min-w-0 max-w-none prose-h1:text-2xl prose-h2:mt-10 prose-h2:scroll-mt-24 prose-table:text-sm sm:prose-h1:text-3xl">
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
