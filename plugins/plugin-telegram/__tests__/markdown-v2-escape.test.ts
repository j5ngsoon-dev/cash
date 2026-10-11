import { describe, expect, it } from "vitest";
import { convertMarkdownToTelegram } from "../src/utils";

describe("convertMarkdownToTelegram mid-line '>'", () => {
  it("escapes '>' that follows code, bold, a link or an escaped star", () => {
    expect(convertMarkdownToTelegram("if `count`>5 stop")).toBe(
      "if `count`\\>5 stop",
    );
    expect(convertMarkdownToTelegram("**Step 1**>> next")).toBe(
      "*Step 1*\\>\\> next",
    );
    expect(convertMarkdownToTelegram("[docs](https://x.y)> more")).toBe(
      "[docs](https://x.y)\\> more",
    );
    expect(convertMarkdownToTelegram("a \\*>b")).toBe("a \\*\\>b");
  });

  it("keeps blockquote markers at the start of a line", () => {
    expect(convertMarkdownToTelegram("> quote **b** more")).toBe(
      "> quote *b* more",
    );
    expect(convertMarkdownToTelegram("**x**\n> q")).toBe("*x*\n> q");
    expect(convertMarkdownToTelegram("> a\n> **b**> c")).toBe(
      "> a\n> *b*\\> c",
    );
  });
});

describe("convertMarkdownToTelegram backslash escapes", () => {
  it("sends the escaped character without the Markdown backslash", () => {
    // CommonMark 2.4: a backslash before ASCII punctuation makes it literal.
    expect(convertMarkdownToTelegram("The fee is \\$5 for my\\_file.")).toBe(
      "The fee is $5 for my\\_file\\.",
    );
    expect(convertMarkdownToTelegram("1\\. not a list")).toBe(
      "1\\. not a list",
    );
    expect(convertMarkdownToTelegram("\\# not a heading")).toBe(
      "\\# not a heading",
    );
    expect(convertMarkdownToTelegram("\\_not italic\\_")).toBe(
      "\\_not italic\\_",
    );
    expect(convertMarkdownToTelegram("[my\\_file](https://x.y)")).toBe(
      "[my\\_file](https://x.y)",
    );
  });

  it("keeps a backslash that is not a Markdown escape", () => {
    expect(convertMarkdownToTelegram("C:\\Users\\name")).toBe(
      "C:\\\\Users\\\\name",
    );
    expect(convertMarkdownToTelegram("`a\\_b`")).toBe("`a\\\\_b`");
    expect(convertMarkdownToTelegram("path C:\\\\Users")).toBe(
      "path C:\\\\Users",
    );
  });
});
