# TermAI 🤖🚀

**TermAI** is a next-generation, AI-powered terminal assistant designed to revolutionize how you interact with your shell. It bridges the gap between natural language and complex command-line operations, wrapping a powerful terminal emulator in a modern, "Warp-like" interface.

![TermAI Screenshot](https://via.placeholder.com/800x450?text=TermAI+Interface+Preview)
*(Note: Replace with actual screenshot)*

## ✨ Key Features

*   **🧠 AI-Powered Command Generation**: Just describe what you want to do (e.g., "Find all large files in this directory"), and TermAI generates the correct shell commands for you.
*   **🔄 Multi-Model Support**: Choose your brain! Seamlessly switch between **Google Gemini**, **OpenAI GPT-4**, and **Anthropic Claude 3** to power your assistant.
*   **🛡️ Smart Error Recovery**: If a command fails, TermAI detects the error code, analyzes the output, and automatically suggests a fix or backtracks to a safe state.
*   **🎨 Modern "Warp-Like" UI**:
    *   **Block-Based Output**: Commands and their outputs are grouped into distinct, card-like blocks for better readability.
    *   **Floating Input Bar**: A sleek, context-aware input area that stays out of your way.
    *   **Light/Dark Mode**: Switch between a hacker-friendly dark theme and a crisp light theme.
*   **💾 Session Management**:
    *   **Save & Resume**: Name your sessions and save them for later.
    *   **History**: Access past conversations from the sidebar.
    *   **Context Awareness**: TermAI knows your current working directory (`cwd`) and active Git branch.
*   **⚡ Auto-Run Mode**: Enable "Auto-Run" to let the agent execute a sequence of commands autonomously (with safety limits).

## 🛠️ Tech Stack

*   **Frontend**: [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
*   **Styling**: Vanilla CSS (CSS Modules) with a custom design system.
*   **Icons**: [Lucide React](https://lucide.dev/)
*   **State Management**: React Hooks + Custom Events for cross-component communication.
*   **Backend Proxy**: Node.js (for secure API handling, if applicable in future extensions).

## 🚀 Getting Started

### Prerequisites

*   **Node.js** (v18 or higher)
*   **npm** or **yarn**
*   **API Keys**: You'll need an API key for at least one of the supported providers (Gemini, OpenAI, or Anthropic).

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/RedClaus/TermAi.git
    cd TermAi
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Start the development server**:
    ```bash
    npm run dev
    ```

4.  **Open in Browser**:
    Navigate to `http://localhost:5173` (or the URL shown in your terminal).

## ⚙️ Configuration

1.  Click the **Settings** icon (⚙️) in the sidebar or simply start typing in the AI input bar.
2.  Enter your API Key for your preferred provider.
3.  Keys are stored securely in your browser's **Local Storage**.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
