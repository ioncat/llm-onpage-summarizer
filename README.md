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
| Tabs | Switch between prompt tabs (Summarize + any custom tabs you add) |
| **Run** | Extract page text and send to Ollama |
| **Stop** | Cancel an in-progress generation |
| **Clear** | Remove the current result |
| **Copy** | Copy result to clipboard |
| ⚙ Settings | Configure model, max text length, Ollama URL, prompt template, Markdown toggle |
| ⏱ History | Browse last 8 results |

## Configuration

| Setting | Default | Description |
|---|---|---|
| Model | fetched from Ollama | Dropdown of all locally available models |
| Ollama URL | `http://localhost:11434` | Change if Ollama runs on a different port |
| Prompt template | built-in per mode | Fully editable — see section below |
| Render Markdown | off | Toggle rich formatting in the result |
| Max text length | 12 000 chars | Hard cap to prevent context overflow |

## The prompt is everything

> **90% of result quality comes from the prompt. Model choice is secondary.**

The extension ships with one default tab — **Summarize**. Add more tabs via the **+** button, name them however you like, write a completely custom prompt for each.

Open ⚙ Settings → **Prompt template** to edit. Use `{{text}}` as the placeholder for page content.

### Why the prompt matters so much

Models follow instructions — but only if those instructions are explicit. A vague prompt gets a vague result. A precise prompt that tells the model exactly what format, language, and depth you want will consistently outperform a better model with a weak prompt.

If results are off: **rewrite the prompt first**, before switching models.

### Prompt structure that works

The most reliable pattern: give context first, then content, then the output instruction last. Models weight recent instructions more heavily.

```
Read the following text — it may be in any language.

{{text}}

Now write a summary in [your language] in 4–6 bullet points.
Always respond in [your language], regardless of the language of the text above.
```

Replace `[your language]` with whatever you need. The same structure works for any task — key points, ELI5, action items, translation.

### Tips

- Be explicit about format: "Use bullet points", "Keep it under 5 sentences", "Start each point with a verb"
- Put the output instruction **after** `{{text}}` — models follow the last instruction most reliably
- If the model ignores your language instruction, try `qwen2.5` or `mistral` — they handle multilingual prompts better than some others
- Create separate tabs for different tasks: one for quick summaries, one for deep analysis, one for extracting action items

## Model choice matters

Different models produce **very different results** for the same prompt:

| Model | Notes |
|---|---|
| `llama3.2`, `llama3.1` | Good general-purpose summarization |
| `mistral`, `mistral-nemo` | Strong at structured output |
| `gemma2` | Concise and fast |
| `qwen2.5` | Best multilingual support |
| Small models (1–3B) | Fast but may produce shallow summaries |
| Large models (7B+) | Better reasoning, slower on CPU |

**There is no single best model.** Experiment with prompt + model combinations. A well-written prompt on a small model often beats a lazy prompt on a large one.

### Managing your model list

When you have many models installed, the dropdown gets noisy fast. **Manage models** lets you build a personal layer on top of what Ollama provides — rate what works, hide what doesn't — without touching Ollama itself.

Open ⚙ Settings → **Manage models**:

- **★★★★★ — Rate models** by clicking the stars next to each name. Highly rated models float to the top of the dropdown so your best options are always first.
- **Hide** — removes a model from the dropdown without touching Ollama. Useful for models you've tested and ruled out. Hidden models appear in a separate "Hidden" section and can be restored at any time.

Ratings and hidden state are saved locally in the extension and survive restarts. They are independent of prompt tabs — one rating applies across all tabs.

## Privacy

While using Ollama, all processing is local. The extension never sends data to any external server. Page text is only sent to `localhost`.

## License

MIT
