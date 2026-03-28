# llm-onpage-summarizer

A Chrome extension that summarizes the current web page using a **locally running LLM via [Ollama](https://ollama.com)**. No cloud, no API keys, fully private — everything runs on your machine.

## Why bother?

You shouldn't read everything that lands in your browser. Most content isn't worth your time.

- **Cut the Noise** — get the gist of articles, logs, or tickets instantly.
- **Zero Friction** — no tab switching, no copy-pasting.
- **Decide Faster** — see the core idea first, then decide if it's worth the deep dive.
- **Your Data, Your Call** — run it locally with Ollama, or connect a cloud model. You choose what leaves your machine.

Stop wasting minutes on fluff. Start with the summary.

## How it works

1. Click the extension icon — a side panel opens
2. Select a mode: **Summarize** or **Custom**
3. Click **Run**
4. The extension extracts the page text and sends it to your local Ollama instance
5. The result streams back token by token into the panel

## Requirements

- Chrome 114+ (side panel API)
- [Ollama](https://ollama.com) running locally on `http://localhost:11434`
- At least one model pulled, e.g.: `ollama pull llama3.2`

## Installation

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `llm-onpage-summarizer` folder
5. Click the extension icon in the toolbar to open the side panel

## Usage

| Control | Description |
|---|---|
| Mode buttons | Switch between Summarize / Key Points / ELI5 / Translate |
| **Run** | Extract page text and send to Ollama |
| **Stop** | Cancel an in-progress generation |
| **Clear** | Remove the current result |
| **Copy** | Copy result to clipboard |
| ⚙ Settings | Configure model, Ollama URL, prompt template, Markdown toggle |
| ⏱ History | Browse last 8 results |

## Configuration

| Setting | Default | Description |
|---|---|---|
| Model | fetched from Ollama | Dropdown of all locally available models |
| Ollama URL | `http://localhost:11434` | Change if Ollama runs on a different port |
| Prompt template | built-in per mode | Fully editable — see section below |
| Render Markdown | off | Toggle rich formatting in the result |
| Max text length | 12 000 chars | Hard cap to prevent context overflow |

## Prompt templates — the most important setting

> **The quality of the result depends directly on the prompt you write.**

The extension ships with one default tab — **Summarize**. You can add more tabs via the **+** button, name them however you like, and write a completely custom prompt for each.

Open ⚙ Settings → **Prompt template** to edit the prompt for the active tab. Use `{{text}}` as the placeholder for page content.

Tips:
- Write the prompt in the language you want the output in
- Be explicit: "Reply in --language--", "Use bullet points", "Keep it under 5 sentences"
- If results are generic or off-topic, rewrite the prompt first before switching models

## Model choice matters

Different Ollama models produce **very different results** for the same prompt:

| Model | Notes |
|---|---|
| `llama3.2`, `llama3.1` | Good general-purpose summarization |
| `mistral`, `mistral-nemo` | Strong at structured output |
| `gemma2` | Concise and fast |
| `qwen2.5` | Good multilingual support |
| Small models (1–3B) | Fast but may produce shallow summaries |
| Large models (7B+) | Better reasoning, slower on CPU |

**Good results come from experimentation.** Try different models, tweak the prompt, and find the combination that works for your use case. There is no single "best" setting — it depends on your hardware, model, and the type of page you are summarizing.

## Privacy

While using Ollama, all processing is local. The extension never sends data to any external server. Page text is only sent to `localhost`.

## License

MIT
