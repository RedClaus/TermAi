# TermAI User Manual

Welcome to **TermAI**, your AI-powered terminal assistant. This manual provides a comprehensive guide to installing, configuring, and mastering TermAI to supercharge your command-line workflow.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Installation & Getting Started](#2-installation--getting-started)
3. [Interface Overview](#3-interface-overview)
4. [Core Features](#4-core-features)
   - [AI Chat & Command Generation](#ai-chat--command-generation)
   - [The Terminal](#the-terminal)
   - [Auto-Run Mode](#auto-run-mode)
   - [Local Agent](#local-agent)
   - [Knowledge Engine (RAG)](#knowledge-engine-rag)
   - [Conversation Import](#conversation-import)
   - [Flow Editor](#flow-editor)
5. [Performance & Reliability](#5-performance--reliability)
6. [Configuration](#6-configuration)
7. [Keyboard Shortcuts](#7-keyboard-shortcuts)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Introduction

TermAI bridges the gap between natural language and the command line. Instead of remembering complex flags and syntax, you simply describe what you want to do, and TermAI generates the appropriate shell commands. It features a modern, split-pane interface with a real terminal emulator (Ghostty-based) and a powerful AI assistant.

**Key Capabilities:**
*   **Multi-Model Support:** Use Gemini, OpenAI, Claude, or local Ollama models.
*   **Context Aware:** Knows your current directory, git branch, and project structure.
*   **Interactive Terminal:** Run SSH, Vim, Nano, and other interactive tools directly.
*   **Automation:** "Auto-Run" mode allows the AI to autonomously execute a sequence of commands to complete a task.
*   **Skill Learning:** The AI learns from successful actions to handle future tasks better.

---

## 2. Installation & Getting Started

### Prerequisites
*   **Node.js**: Version 18 or higher.
*   **npm** or **yarn**.

### Quick Start (Recommended)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/RedClaus/TermAi.git
    cd TermAi
    ```

2.  **Run the enhanced startup script:**
    ```bash
    chmod +x startup.sh
    ./startup.sh
    ```
    This script will install dependencies, check your environment, and start both the frontend and backend servers.

3.  **Open in Browser:**
    Navigate to `http://localhost:5173` to access the TermAI interface.

### Global CLI Launcher
To run TermAI from any project directory on your machine:

1.  Create a wrapper script (update `TERMAI_DIR` to your install location):
    ```bash
    mkdir -p ~/.local/bin
    cat > ~/.local/bin/termai << 'EOF'
    #!/bin/bash
    TERMAI_DIR="$HOME/github/TermAi"
    exec node "$TERMAI_DIR/bin/termai.cjs" "$@"
    EOF
    chmod +x ~/.local/bin/termai
    ```
2.  Now you can type `termai` in any folder to launch the interface with that folder as the working directory.

### Docker
For a containerized setup:
```bash
docker-compose up -d
```

---

## 3. Interface Overview

TermAI's interface is divided into key sections:

*   **Top Navigation:**
    *   **Sidebar Toggle:** Show/hide the left sidebar.
    *   **Theme Toggle:** Switch between Light and Dark modes.
*   **Left Sidebar:**
    *   **Navigation:** Switch between Terminal, Flows, and other views.
    *   **Sessions:** Manage multiple terminal tabs.
    *   **Background Terminals:** Monitor long-running processes spawned by the AI.
    *   **Tools:** Access Settings, Logs, Skills, and Knowledge Engine.
*   **Center Panel (Split View):**
    *   **Terminal (Top):** Displays command output in distinct "blocks". Supports direct input.
    *   **AI Panel (Bottom):** Chat interface to instruct the AI. Includes model selector and auto-run controls.
*   **Right Sidebar:**
    *   **System Context:** Shows current working directory, git branch, and session info.
    *   **Recent Commands:** Quick access to rerun previous commands.

---

## 4. Core Features

### AI Chat & Command Generation
At the bottom of the screen is the AI input area.
1.  **Type a request:** e.g., "Find all large files in src/ and list them by size."
2.  **Select a Model:** Use the dropdown to choose between Gemini, GPT-4, Claude, or local Ollama models.
3.  **Execute:** The AI will generate a command block. You can review it and click **Run** to execute it in the terminal above.

### The Terminal
TermAI uses **Ghostty-web** for its terminal emulation, providing a high-performance, xterm-compatible experience.
*   **Block-Based Output:** Each command and its output are grouped into a card for better readability.
*   **Interactive Mode:** Commands like `ssh`, `vim`, or `python` REPLs open fully interactive sessions where you can type directly.
*   **Multiple Tabs:** Create separate workspace tabs for different tasks using the `+` icon in the sidebar.

### Auto-Run Mode
For complex tasks requiring multiple steps (e.g., "Scaffold a React app and install Tailwind"), toggle **Auto-Run** (Ctrl+Shift+A).
*   **Autonomous Execution:** The AI will generate a command, execute it, analyze the output, and generate the next necessary command.
*   **Safety Checks:** Dangerous commands (like `rm -rf`) will pause execution and ask for your confirmation.
*   **Stop/Pause:** You can stop the sequence at any time.

### Local Agent
The **Local Agent** is a background service that runs on your machine to give the web interface deeper system access.
*   **Capabilities:** Allows TermAI to browse your file system, list drives, and execute commands securely.
*   **Setup:** If prompted, run `node bin/local-agent.cjs --install` to set it up as a system service.

### Knowledge Engine (RAG)
TermAI can index your codebase to provide context-aware answers.
1.  Open **Knowledge Engine** from the left sidebar.
2.  Click **Index Current Directory**.
3.  The system will generate embeddings for your files.
4.  **Semantic Search:** You can now ask questions about your code (e.g., "How is authentication handled?"), and the AI will retrieve relevant code snippets to answer accurately.

### Conversation Import
Import knowledge from your conversations with other AI tools (Claude, ChatGPT, Cursor, Warp) to build your skill library.

**How to Import:**
1.  Open **Settings** (gear icon).
2.  In the **Knowledge Engine** section, click **Import Conversations**.
3.  The **Import Wizard** will open with four steps:

**Step 1 - Upload:**
*   Drag and drop conversation export files or click to browse.
*   **Supported formats:**
    *   Claude (.json) - Export from claude.ai
    *   ChatGPT (.json) - Export from chat.openai.com
    *   Cursor IDE (.json) - Chat and Composer sessions
    *   Warp Terminal (.json, .yaml, .txt) - Sessions and workflows
    *   Markdown/Text (.md, .txt) - Generic conversation transcripts

**Step 2 - Processing:**
*   The system parses your files and uses AI to extract problem-solution patterns.
*   A progress indicator shows the current phase (parsing, extracting, analyzing).
*   Processing typically takes a few seconds per file.

**Step 3 - Review:**
*   Review extracted knowledge patterns before adding them to your skill library.
*   Each pattern shows:
    *   **Problem description** - What issue was being solved
    *   **Solution steps** - Commands or actions that solved it
    *   **Confidence score** - How confident the AI is in the extraction (0-100%)
    *   **Context** - OS, shell, tools, language detected
*   Use the confidence filter slider to show only high-quality extractions.
*   **Bulk Actions:** Select multiple patterns and approve/reject them at once.
*   Click a pattern card to expand it and see full details.

**Step 4 - Result:**
*   A summary shows:
    *   Total patterns found
    *   Patterns added to your knowledge base
    *   Patterns rejected or skipped
*   Any errors encountered during import are listed.
*   Click **Done** to close the wizard.

**Tips for Better Results:**
*   Export conversations that include successful problem-solving sessions.
*   The AI works best with conversations that have clear problem statements and working solutions.
*   Higher confidence patterns (80%+) are typically more accurate.
*   You can import the same file multiple times - duplicates are handled automatically.

### Flow Editor
Click **Flows** in the sidebar to access the Visual Flow Editor.
*   **Visual Programming:** Drag and drop nodes to create automated workflows.
*   **Nodes:** Combine "Command" nodes, "AI Decision" nodes, and "File Operation" nodes.
*   **Execution:** Run flows directly to automate repetitive tasks.

---

## 5. Performance & Reliability

TermAI is built with performance and reliability in mind, implementing industry-standard patterns for a smooth experience.

### Error Recovery

If something goes wrong in the Terminal or AI Panel, TermAI will:
*   **Catch the error gracefully** instead of crashing the entire application
*   **Display a friendly error message** explaining what happened
*   **Provide a "Reload" button** to recover without refreshing the page
*   **Preserve your session data** so you don't lose your work

### Virtualized Terminal Output

For long terminal sessions with many commands:
*   **Automatic virtualization** kicks in when you have more than 20 command blocks
*   **Only visible blocks are rendered** in the DOM, keeping memory usage low
*   **Smooth scrolling** even with hundreds of commands in history
*   **No performance degradation** over extended usage sessions

### Responsive Resizing

The split-panel layout features:
*   **Debounced resize operations** (60fps) for smooth dragging
*   **Automatic terminal adjustment** when panels are resized
*   **Persistent layout preferences** saved to localStorage

### Storage Management

TermAI handles browser storage limits gracefully:
*   **Progressive pruning** of chat history when storage is full
*   **Automatic cleanup** of old sessions to make room for new ones
*   **Quota-safe operations** that won't crash on Safari's smaller storage limits

---

## 6. Configuration

Access the **Settings** menu from the left sidebar.

*   **AI Providers:**
    *   **Gemini/OpenAI/Claude:** Enter your API keys here. Keys are stored locally or securely proxied; they are never shared with third parties.
    *   **Ollama:** Set your local endpoint (default: `http://localhost:11434`) to use offline models.
*   **System Prompts:** Customize the base instructions given to the AI.
*   **Appearance:** Adjust terminal font size, theme, and transparency.

---

## 7. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl + Enter` | Send message / Run command |
| `Ctrl + Shift + A` | Toggle Auto-Run mode |
| `Ctrl + K` | Open Command Palette (quick actions) |
| `Ctrl + L` | Clear terminal output |
| `Escape` | Cancel current operation or close modal |

---

## 8. Troubleshooting

*   **"Unable to connect to server":**
    *   Ensure the backend is running (`npm run dev:server` or `./startup.sh`).
    *   Check if port 3001 is available.
*   **AI not responding:**
    *   Verify your API key in Settings.
    *   If using Ollama, ensure the Ollama service is running (`ollama serve`).
*   **Interactive commands hanging:**
    *   Ensure you are using the correct Node.js version (v18+).
    *   Refresh the page to reset the WebSocket connection.

---
*Generated for TermAI v1.0*
