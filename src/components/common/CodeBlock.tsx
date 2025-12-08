/**
 * CodeBlock Component
 * Displays code with copy button and optional syntax highlighting
 */
import React, { memo, useCallback } from "react";
import { Play } from "lucide-react";
import styles from "./CodeBlock.module.css";
import { CopyButton } from "./CopyButton";

export interface CodeBlockProps {
  code: string;
  language?: string | undefined;
  showLineNumbers?: boolean | undefined;
  showCopy?: boolean | undefined;
  showRun?: boolean | undefined;
  onRun?: ((code: string) => void) | undefined;
  maxHeight?: number | undefined;
}

/**
 * Simple syntax highlighting for common languages
 */
function highlightSyntax(code: string, language?: string): React.ReactNode {
  if (!language) return code;

  const keywords: Record<string, string[]> = {
    javascript: [
      "const",
      "let",
      "var",
      "function",
      "return",
      "if",
      "else",
      "for",
      "while",
      "class",
      "import",
      "export",
      "from",
      "async",
      "await",
      "try",
      "catch",
      "throw",
      "new",
      "this",
      "null",
      "undefined",
      "true",
      "false",
    ],
    typescript: [
      "const",
      "let",
      "var",
      "function",
      "return",
      "if",
      "else",
      "for",
      "while",
      "class",
      "import",
      "export",
      "from",
      "async",
      "await",
      "try",
      "catch",
      "throw",
      "new",
      "this",
      "null",
      "undefined",
      "true",
      "false",
      "interface",
      "type",
      "extends",
      "implements",
    ],
    python: [
      "def",
      "class",
      "if",
      "else",
      "elif",
      "for",
      "while",
      "return",
      "import",
      "from",
      "as",
      "try",
      "except",
      "finally",
      "raise",
      "with",
      "lambda",
      "None",
      "True",
      "False",
      "and",
      "or",
      "not",
      "in",
      "is",
    ],
    bash: [
      "if",
      "then",
      "else",
      "fi",
      "for",
      "while",
      "do",
      "done",
      "case",
      "esac",
      "function",
      "return",
      "exit",
      "echo",
      "export",
      "source",
      "cd",
      "ls",
      "rm",
      "cp",
      "mv",
      "mkdir",
      "cat",
      "grep",
      "awk",
      "sed",
    ],
    sh: [
      "if",
      "then",
      "else",
      "fi",
      "for",
      "while",
      "do",
      "done",
      "case",
      "esac",
      "function",
      "return",
      "exit",
      "echo",
      "export",
      "source",
      "cd",
      "ls",
      "rm",
      "cp",
      "mv",
      "mkdir",
      "cat",
      "grep",
      "awk",
      "sed",
    ],
  };

  const langKeywords = keywords[language.toLowerCase()] || [];
  if (langKeywords.length === 0) return code;

  // Split into tokens and highlight
  const tokens = code.split(/(\s+|[{}()[\];,.])/);

  return tokens.map((token, i) => {
    // Keywords
    if (langKeywords.includes(token)) {
      return (
        <span key={i} className={styles.keyword}>
          {token}
        </span>
      );
    }
    // Strings
    if (/^["'`].*["'`]$/.test(token)) {
      return (
        <span key={i} className={styles.string}>
          {token}
        </span>
      );
    }
    // Numbers
    if (/^\d+(\.\d+)?$/.test(token)) {
      return (
        <span key={i} className={styles.number}>
          {token}
        </span>
      );
    }
    // Comments
    if (token.startsWith("//") || token.startsWith("#")) {
      return (
        <span key={i} className={styles.comment}>
          {token}
        </span>
      );
    }
    return token;
  });
}

/**
 * CodeBlock Component
 */
export const CodeBlock = memo<CodeBlockProps>(
  ({
    code,
    language,
    showLineNumbers = false,
    showCopy = true,
    showRun = false,
    onRun,
    maxHeight,
  }) => {
    const handleRun = useCallback(() => {
      onRun?.(code);
    }, [code, onRun]);

    const lines = code.split("\n");
    const highlightedCode = highlightSyntax(code, language);

    return (
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          {language && <span className={styles.language}>{language}</span>}
          <div className={styles.actions}>
            {showRun && onRun && (
              <button
                className={styles.actionBtn}
                onClick={handleRun}
                title="Run code"
                type="button"
              >
                <Play size={14} />
                <span>Run</span>
              </button>
            )}
            {showCopy && (
              <CopyButton text={code} className={styles.actionBtn} title="Copy to clipboard" />
            )}
          </div>
        </div>

        {/* Code */}
        <div
          className={styles.codeWrapper}
          style={maxHeight ? { maxHeight, overflow: "auto" } : undefined}
        >
          {showLineNumbers ? (
            <table className={styles.codeTable}>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className={styles.lineNumber}>{i + 1}</td>
                    <td className={styles.codeLine}>
                      <code>{highlightSyntax(line, language)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre className={styles.code}>
              <code>{highlightedCode}</code>
            </pre>
          )}
        </div>
      </div>
    );
  },
);

CodeBlock.displayName = "CodeBlock";

/**
 * Inline code component
 */
export const InlineCode = memo<{ children: React.ReactNode }>(
  ({ children }) => <code className={styles.inlineCode}>{children}</code>,
);

InlineCode.displayName = "InlineCode";
