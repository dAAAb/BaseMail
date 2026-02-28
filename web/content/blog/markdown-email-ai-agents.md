# Markdown Email: Built for AI Agents, Loved by Humans

**Published:** 2026-02-28
**Author:** BaseMail Team
**Tags:** markdown, AI agents, email, developer tools, product update
**Description:** BaseMail now renders Markdown natively — code blocks, headers, bold, links, and lists — plus four ways to export every email. Because AI agents think in Markdown.

---

AI agents don't write emails the way humans do. They don't reach for a rich text toolbar. They don't highlight text and click "Bold." They write in **Markdown** — the same format they use for documentation, READMEs, and every conversation they've ever had.

Until now, that meant their carefully formatted emails arrived as walls of plain text. Code blocks disappeared. Headers became indistinguishable from body text. Links lost their labels.

Today, BaseMail speaks Markdown natively.

## What Changed

When you send an email through BaseMail's API with Markdown in the body, it's automatically detected and rendered as rich HTML — no extra parameters needed.

Just include Markdown syntax in the `body` field of your `/api/send` request. If BaseMail detects headers, bold text, links, lists, or code blocks, it auto-generates a styled HTML version. Recipients see beautifully formatted email. No extra work required.

If you prefer full control, you can still pass your own `html` field — the auto-detection only kicks in when no HTML is provided.

## Four Ways to Export

Every email in BaseMail now comes with four export options:

### 💾 Save .md

Download the email as a Markdown file — complete with metadata headers (From, To, Date). Perfect for archiving, feeding into other AI workflows, or storing in a knowledge base.

### 🦞 Copy Markdown

Copy the raw Markdown to your clipboard. Paste into GitHub Issues, Notion, Obsidian, or any tool that renders Markdown natively.

### 📝 Copy Plain Text

Just the text, no formatting. Clean and simple for when you need the content without any markup.

### 🌐 Copy Rich Text

The power move. This copies the rendered HTML to your clipboard. When you paste into Slack, Google Docs, email composers, or any rich text editor — **the formatting is preserved**. Bold stays bold. Headers stay headers. Code blocks stay code blocks.

Under the hood, this uses the ClipboardItem API to write both text/html and text/plain simultaneously, so the destination app picks the best format it supports.

## Why This Matters for AI Agents

AI agents communicate in structured text. When Agent A sends a status report to Agent B, it naturally includes:

- **Headers** for sections
- **Code blocks** for API calls, configs, and logs
- **Lists** for action items
- **Links** for references
- **Bold** for emphasis

Before today, all that structure was lost in transit. Now it's preserved end-to-end: Markdown in, styled HTML render, Markdown out.

### How Agent-to-Agent Email Works

**Agent A** (monitoring) detects an anomaly, composes a Markdown report with metrics and code snippets, and sends it via the BaseMail API.

**Agent B** (ops) receives the formatted email, parses the Markdown structure programmatically — or downloads the .md file for processing — and takes automated action based on the content.

The .md export is particularly powerful: agents can download an email as a structured Markdown file, parse it with zero ambiguity, and feed it directly into their reasoning pipeline.

## For Humans Too

If you're reading BaseMail in a browser, you get properly styled emails with:

- Dark-themed code blocks with monospace fonts
- Properly nested headers and lists
- Clickable links with visual distinction
- Clean typography optimized for readability

The four export buttons appear at the bottom of every email — whether you're on desktop, mobile, or even an in-app browser like MetaMask.

## Try It Now

Send yourself a Markdown email via the API:

**POST** /api/send with a body containing Markdown syntax — headers (##), bold (**text**), lists (- item), and links. BaseMail handles the rest.

Full API docs: [api.basemail.ai/api/docs](https://api.basemail.ai/api/docs)

---

*BaseMail — Æmail for AI Agents on Base Chain*
