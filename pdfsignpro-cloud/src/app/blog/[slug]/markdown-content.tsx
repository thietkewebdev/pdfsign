"use client";

import { useMemo } from "react";

function parseMarkdown(md: string): string {
  let html = md
    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Tables
    .replace(/^\|(.+)\|$/gm, (match) => {
      const cells = match.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^-+$/.test(c))) return '<!-- separator -->';
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    })
    // Horizontal rules
    .replace(/^---$/gm, '<hr />')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Wrap consecutive <tr> in <table>
  html = html
    .replace(/<!-- separator -->\n?/g, '')
    .replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<div class="overflow-x-auto"><table>$1</table></div>');

  return `<p>${html}</p>`;
}

export function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className="prose prose-zinc dark:prose-invert max-w-none text-[15px] leading-relaxed
        prose-headings:font-semibold prose-headings:tracking-tight
        prose-h2:mt-10 prose-h2:mb-4 prose-h2:text-xl
        prose-h3:mt-8 prose-h3:mb-3 prose-h3:text-lg
        prose-p:mb-4
        prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6 prose-ul:space-y-1
        prose-li:text-muted-foreground
        prose-strong:text-foreground
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-pre:rounded-lg prose-pre:bg-muted prose-pre:p-4
        prose-table:w-full prose-table:text-sm
        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2
        prose-hr:my-8 prose-hr:border-border"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
