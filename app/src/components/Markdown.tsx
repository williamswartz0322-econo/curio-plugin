"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// remark-math only treats $$...$$ as *display* math when the delimiters sit on
// their own lines. A single-line $$x$$ becomes inline math, where KaTeX rejects
// \tag (which the book's numbered equations rely on). Expand those to the
// multi-line form before parsing.
function expandDisplayMath(md: string): string {
  return md.replace(/^([ \t]*)\$\$(.+?)\$\$[ \t]*$/gms, (_m, indent: string, body: string) =>
    `${indent}$$\n${body.trim()}\n${indent}$$`
  );
}

export default function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
      {expandDisplayMath(children)}
    </ReactMarkdown>
  );
}
