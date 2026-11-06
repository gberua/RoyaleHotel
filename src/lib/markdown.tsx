import { Fragment, type ReactNode } from "react";

/** Minimal, safe markdown for admin-edited text: ## / ### headings, - lists, **bold**, paragraphs. No HTML. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function Markdown({ text, className = "prose-hotel" }: { text: string; className?: string }) {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter(Boolean);
        if (!lines.length) return null;
        if (lines.every((l) => l.startsWith("- "))) return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>;
        return (
          <Fragment key={i}>
            {lines.map((l, j) =>
              l.startsWith("### ") ? <h3 key={j}>{inline(l.slice(4))}</h3>
              : l.startsWith("## ") ? <h2 key={j}>{inline(l.slice(3))}</h2>
              : l.startsWith("- ") ? <ul key={j}><li>{inline(l.slice(2))}</li></ul>
              : <p key={j}>{inline(l)}</p>,
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
