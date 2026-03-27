# llm-onpage-summarizer

A Chrome extension that summarizes the current web page using a locally running LLM via [Ollama](https://ollama.com). No cloud, no API keys, fully private.

## How it works

1. Click the extension icon — a side panel opens
2. Click **Summarize Page**
3. The extension extracts the page text and sends it to your local Ollama instance
4. The summary streams back token by token into the panel

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

- **Model** field: type any model name you have pulled in Ollama (saved automatically)
- **Summarize Page**: extracts visible text from the current page and sends it to Ollama
- **Copy**: copies the generated summary to clipboard
- **Stop**: cancels an in-progress generation

## Configuration

| Setting | Default | Description |
|---|---|---|
| Model | `llama3.2` | Any Ollama model name |
| Ollama URL | `http://localhost:11434` | Configurable in Phase 3 |
| Max text length | 12 000 chars | Prevents context overflow |

## Supported backends (roadmap)

- [x] Ollama (`/api/generate`)
- [ ] LM Studio (`/v1/chat/completions`)
- [ ] Custom OpenAI-compatible endpoint

## Privacy

All processing is local. The extension never sends data to any external server. Page text is only sent to `localhost`.

## License

MIT
