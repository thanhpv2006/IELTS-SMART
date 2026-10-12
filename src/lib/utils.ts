import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Turn prompt HTML into plain text for previews, keeping block boundaries as
// line breaks (rendered with `whitespace-pre-line`) so lines don't run together.
export function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(li|p|div|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Loại bỏ wrapper <span data-answer-q="…"> (đánh dấu đáp án khi soạn bài)
// while keeping the inner content — used to store a clean `prompt` column, separate
// from the marked-up copy kept in `metadata.passage_html_marked`/`transcript`.
export function stripAnswerMarks(html: string): string {
  if (typeof window !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const spans = doc.body.querySelectorAll("span[data-answer-q]");
    spans.forEach((span) => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
    return doc.body.innerHTML;
  }

  // Server-side fallback: no DOM available, unwrap with regex. Loop to
  // handle nested/multiple spans since each pass only strips one layer.
  let out = html;
  let prev: string;
  const spanRe = /<span[^>]*\bdata-answer-q\b[^>]*>([\s\S]*?)<\/span>/gi;
  do {
    prev = out;
    out = out.replace(spanRe, "$1");
  } while (out !== prev);
  return out;
}
