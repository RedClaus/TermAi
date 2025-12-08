# WaveTerm vs TermAi Comparison & Feature Recommendations

## Overview
**WaveTerm** is a feature-rich, open-source terminal that integrates graphical tools (browser, file previews) and AI directly into the terminal interface. It uses a Go backend and React frontend.
**TermAi** is a web-based AI terminal assistant focused on autonomous task execution ("Auto-Run"), skill learning, and multi-provider support, running on Node.js/React.

## Feature Comparison

| Feature Category | WaveTerm | TermAi | Verdict / Recommendation |
| :--- | :--- | :--- | :--- |
| **CLI Integration** | **`wsh ai`**: Powerful piping support (e.g., `git diff \| wsh ai`). Sends context from CLI to AI. | **`termai`**: Launcher only. Starts the app but doesn't accept piped input or context. | **HIGH PRIORITY:** Implement `termai ask` or `termai pipe` to send stdin to the active session. |
| **Context Awareness** | **Visual & Text**: Can screenshot widgets, read terminal buffer, file system, and web pages. | **Text-Only**: Context limited to shell history and command outputs. | **MEDIUM PRIORITY:** Add a tool for the AI to "read terminal buffer" (get last N lines of history). |
| **Drag & Drop** | **Native**: Drag files/images directly into AI chat. | **Limited**: `Paperclip` button exists, but drag-and-drop support is not explicit in `AIPanel`. | **MEDIUM PRIORITY:** Add `onDrop` support to `AIPanel` for instant file context. |
| **Architecture** | **Local**: Electron-like (Go+React). | **Client-Server**: Node.js backend + Web frontend (can be remote). | TermAi's web-first approach is a unique strength. |
| **Auto-Run** | **Limited**: Mostly one-off command generation. | **Advanced**: Dedicated "Auto-Run" loop with error recovery and skill learning. | TermAi is ahead here. Keep refining the "Agent" aspect. |
| **Skill Learning** | **None**: Stateless sessions. | **Core Feature**: "Observer" learns reusable skills. | TermAi is ahead here. |

## Recommended Features for TermAi

Based on the analysis of WaveTerm (`/users/normanking/github/waveterm`), the following features should be ported or adapted for TermAi:

### 1. CLI Context Piping (`termai pipe`)
**Why:** Developers often want to ask AI about something they just outputted in their terminal without copying/pasting.
**How:**
- Create a new CLI command (e.g., `bin/ask.cjs` or flag in `termai`).
- It reads `stdin`.
- Sends the content to `POST /api/llm/context` (or similar) to be added to the active session.
- **Example Usage:** `cat logs.txt | termai ask "Find the error"`

### 2. Drag & Drop File Attachments
**Why:** Frictionless context adding.
**How:**
- Add `onDrop` event listeners to the `AIPanel` container.
- Handle file reading (Client-side `FileReader`) and upload to context.
- Support Images (for vision models) and Text files.

### 3. "Read Terminal Buffer" Tool
**Why:** Sometimes the AI needs to see what happened *before* the current command, or the output of a command that wasn't run by the auto-runner.
**How:**
- Expose the xterm.js buffer or session log history via an API.
- Add a `[READ_TERMINAL]` tool for the Agent.

### 4. Widget/Visual Context (Long Term)
**Why:** WaveTerm's ability to "see" the screen is powerful.
**How:**
- Since TermAi is web-based, we can use `html2canvas` or similar to take "screenshots" of the terminal interface if needed, though text-based buffer reading is likely more efficient for a terminal app.

## Summary
TermAi has a distinct advantage in **autonomy (Auto-Run)** and **learning (Skills)**. WaveTerm excels in **integration (CLI piping, UI widgets)**. Bridging the gap with CLI piping and easier context ingestion (Drag & Drop) will significantly improve TermAi's developer experience.
