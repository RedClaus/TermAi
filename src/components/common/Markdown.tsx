/**
 * Markdown Component
 * Simple markdown renderer for AI messages
 */
import React, { memo, useMemo } from "react";
import { CodeBlock, InlineCode } from "./CodeBlock";
import styles from "./Markdown.module.css";

interface MarkdownProps {
  content: string;
  onCodeRun?: (code: string) => void;
}

interface ParsedBlock {
  type: "text" | "code" | "heading" | "list" | "blockquote";
  content: string;
  language?: string;
  level?: number;
}

/**
 * Parse markdown into blocks
 */
function parseMarkdown(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    const codeMatch = line.match(/^```(\w*)?$/);
    if (codeMatch) {
      const language = codeMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "code",
        content: codeLines.join("\n"),
        language,
      });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [line.substring(2)];
      i++;
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].substring(2));
        i++;
      }
      blocks.push({
        type: "blockquote",
        content: quoteLines.join("\n"),
      });
      continue;
    }

    // Lists
    const listMatch = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (listMatch) {
      const listItems: string[] = [listMatch[2]];
      i++;
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\s*)[-*]\s+(.+)$/);
        if (itemMatch) {
          listItems.push(itemMatch[2]);
          i++;
        } else {
          break;
        }
      }
      blocks.push({
        type: "list",
        content: listItems.join("\n"),
      });
      continue;
    }

    // Regular text (collect consecutive lines)
    if (line.trim()) {
      const textLines: string[] = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].match(/^```/) &&
        !lines[i].match(/^#{1,6}\s/) &&
        !lines[i].startsWith("> ") &&
        !lines[i].match(/^\s*[-*]\s/)
      ) {
        textLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: "text",
        content: textLines.join("\n"),
      });
      continue;
    }

    // Empty lines
    i++;
  }

  return blocks;
}

/**
 * Parse inline markdown (bold, italic, code, links)
 */
function parseInline(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold **text**
    const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
    if (boldMatch) {
      result.push(<strong key={key++}>{parseInline(boldMatch[1])}</strong>);
      remaining = remaining.substring(boldMatch[0].length);
      continue;
    }

    // Italic *text*
    const italicMatch = remaining.match(/^\*(.+?)\*/);
    if (italicMatch) {
      result.push(<em key={key++}>{parseInline(italicMatch[1])}</em>);
      remaining = remaining.substring(italicMatch[0].length);
      continue;
    }

    // Inline code `code`
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      result.push(<InlineCode key={key++}>{codeMatch[1]}</InlineCode>);
      remaining = remaining.substring(codeMatch[0].length);
      continue;
    }

    // Links [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      result.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
        >
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.substring(linkMatch[0].length);
      continue;
    }

    // Regular text (take until next special character)
    const textMatch = remaining.match(/^[^*`\[]+/);
    if (textMatch) {
      result.push(textMatch[0]);
      remaining = remaining.substring(textMatch[0].length);
      continue;
    }

    // Fallback: take one character
    result.push(remaining[0]);
    remaining = remaining.substring(1);
  }

  return result;
}

/**
 * Render a parsed block
 */
const MarkdownBlock = memo<{
  block: ParsedBlock;
  onCodeRun?: (code: string) => void;
}>(({ block, onCodeRun }) => {
  switch (block.type) {
    case "code":
      return (
        <CodeBlock
          code={block.content}
          language={block.language}
          showCopy
          showRun={!!onCodeRun}
          onRun={onCodeRun}
        />
      );

    case "heading": {
      const Tag = `h${block.level}` as keyof JSX.IntrinsicElements;
      return (
        <Tag className={styles[`h${block.level}`]}>
          {parseInline(block.content)}
        </Tag>
      );
    }

    case "blockquote":
      return (
        <blockquote className={styles.blockquote}>
          {parseInline(block.content)}
        </blockquote>
      );

    case "list":
      return (
        <ul className={styles.list}>
          {block.content.split("\n").map((item, i) => (
            <li key={i}>{parseInline(item)}</li>
          ))}
        </ul>
      );

    case "text":
    default:
      return <p className={styles.paragraph}>{parseInline(block.content)}</p>;
  }
});

MarkdownBlock.displayName = "MarkdownBlock";

/**
 * Markdown Component
 */
export const Markdown = memo<MarkdownProps>(({ content, onCodeRun }) => {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className={styles.markdown}>
      {blocks.map((block, i) => (
        <MarkdownBlock key={i} block={block} onCodeRun={onCodeRun} />
      ))}
    </div>
  );
});

Markdown.displayName = "Markdown";
