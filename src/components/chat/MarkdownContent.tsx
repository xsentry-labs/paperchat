"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

interface MarkdownContentProps {
  content: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h3 className="text-sm font-semibold mt-5 mb-2 text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h4 className="text-sm font-medium mt-4 mb-1.5 text-foreground">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="text-xs font-medium mt-3 mb-1 text-foreground">{children}</h5>
  ),
  p: ({ children }) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 space-y-1.5 list-disc marker:text-muted-foreground/30">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 space-y-1.5 list-decimal marker:text-muted-foreground/30">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="pl-0.5 leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-medium text-foreground">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <pre className="my-3 overflow-x-auto max-w-full rounded-md bg-black/30 border border-border/40 p-3 text-[11px] leading-relaxed font-mono">
          <code>{children}</code>
        </pre>
      );
    }
    return (
      <code className="rounded bg-hover px-1 py-0.5 text-[11px] font-mono text-foreground/80">
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l border-border pl-3 my-3 text-muted-foreground italic text-[13px]">
      {children}
    </blockquote>
  ),
};

export function MarkdownContent({ content }: MarkdownContentProps) {
  // Replace [N] citation refs with small superscript-style markers
  const processed = content.replace(
    /\[(\d+)\]/g,
    '<sup class="citation-ref">[$1]</sup>'
  );

  return (
    <div className="text-[13px] text-foreground/85 break-words overflow-hidden [&_.citation-ref]:text-[10px] [&_.citation-ref]:text-muted-foreground [&_.citation-ref]:font-medium [&_.citation-ref]:ml-px">
      <ReactMarkdown components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
