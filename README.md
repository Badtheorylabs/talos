<h1 align="center">Talos</h1>
<h3 align="center">A privacy-first, self-improving AI agent by BTL</h3>

**Talos** is a production-ready general AI agent built to _do_, not just _think_. It bridges insight with execution, helping you move from idea to results effortlessly.

Some examples of what Talos can do:

- "📥 Find the top 3 most-starred Python repositories on GitHub this week and summarize what each does"
- "🔎 Search Hacker News for posts about 'LangChain' and summarize the top 3 discussions"
- "✈️ Check for flight prices every day and visualize price trends over time"
- "📊 Plot the MACD and RSI for TSLA over the last week"
- "🗺️ Get the past year's weather in Tokyo and tell me the best time to visit"
- "💬 Translate this Word document from Spanish to English and preserve formatting"
- "📚 Scrape the top 10 books from the New York Times Best Sellers list and generate a reading list"
- "🧠 Train a digit recognition model on the MNIST dataset using PyTorch"

## ✨ Features

With all the tools it has, Talos is capable of:

- Computer control through command line
- Accessing files and folders
- Python code execution
- Web browser automation
- Web search via [Jina](docs/configuration.md#http)
- Time awareness and scheduling
- Chatting with [other language models](docs/configuration.md#llm)
- Short-term memory for context retention
- Bot functionality for [Telegram](docs/configuration.md#telegram) and [Discord](docs/configuration.md#discord)

......

## 🚀 Quick Start

1. [Install pnpm](https://pnpm.io/installation) (if not already installed):

```bash
npm install -g pnpm
```

2. Install project dependencies:

```bash
cd btl-talos-core
pnpm i
pnpx playwright install
```

3. Copy the example config file:

```bash
cp configs/config.yaml-example configs/config.yaml
```

4. Edit `configs/config.yaml` with your API key. Here's a minimal working configuration:

```yaml
quiet: true

plugins:
  cerebrum:
    base_url: https://api.openai.com/v1
    api_key: sk-proj-your-openai-api-key
    model: gpt-4o
    temperature: 0.5
    image_supported: true
    max_prompts: 50
    max_event_strlen: 65536
    max_tokens: 16384
  clock:
  http:
  short-term-memory:
  file-system:
  python:
  shell:
  browser:
    headless: false
  cli-ui:
```

> **Note:** This is a minimal working configuration. Advanced features such as [Jina web search](docs/configuration.md#http), [multiple language model support](docs/configuration.md#llm), [Telegram](docs/configuration.md#telegram) and [Discord](docs/configuration.md#discord) integration are not included here, though some may be essential for production use and require additional API keys.
>
> For a complete list of plugins and detailed configuration options, please refer to the [Configuration Guide](docs/configuration.md). See [Cerebrum](docs/configuration.md#cerebrum) section for best practices on selecting the right model for your use case.

5. Launch Talos:

```bash
pnpm start
```

6. Now you can talk to Talos in your terminal!

## 📝 Documentation

Other projects have docs. We have **Vibe Docs**.

Yes, there's a [Configuration Guide](docs/configuration.md) if you're into that sort of thing. But if you really want to understand Talos, we recommend a more modern approach: feed the entire codebase to your favorite AI — Cursor, Windsurf, Talos herself, or even your toaster if it runs GPT — and just ask it how things work.

Trust us: the AI will probably do a better job explaining it than we ever could. It's like documentation, but smarter, more interactive, and doesn't judge your typos.

> **Note:** This is not a joke. We are serious. The above is also vibe documented.

## 🗓️ Roadmap

Our mission is to realize **human-level intelligence**, or _AGI_, by evolving Talos into a truly autonomous and capable agent. Here's a more detailed roadmap of what we're working on:

- [ ] **Autonomous Code Writing**

  - Enable Talos to iteratively write and improve its own plugins

- [ ] **Robust Browser Automation**

  - Improve reliability and fault tolerance in headless and headful modes
  - Add advanced DOM element parsing and interaction strategies

- [ ] **Context Management Improvements**

  - Adjust prompt context windows for different LLMs
  - Implement context summarization for out-of-window context

- [ ] **Long-Term Memory with RAG**

  - Set up vector database integration for persistent knowledge
  - Enable memory recall across sessions and tasks
  - Support user-specific long-term context embedding and retrieval

- [ ] **Image and Video Model Expansion**

  - Integrate support for more image and video generation models
  - Enable multimodal workflows that combine text, image, and video reasoning

- [ ] **Video Understanding Capabilities**
  - Implement advanced video content analysis and understanding capabilities
  - Develop temporal reasoning for video sequences and events
  - Enable extraction of key information and insights from video sources

## 🤝 Contributing

We welcome contributions from everyone — whether you're fixing a typo, suggesting a feature, or building a whole new plugin!

Talos is a community-driven project, and we believe in building great tools _together_. Here's how you can help:

### 💡 Got an Idea?

Open an issue in the BTL project tracker and let's discuss it.

### 🛠 Want to Contribute Code?

1. Fork the repo and create your branch:
   ```bash
   git checkout -b your-feature
   ```
2. Make your changes and commit them with a clear message.
3. Push to your fork and open a Pull Request.

### 🧪 Suggest Tests or Improvements

Not into code? You can still help by:

- Testing features and reporting issues
- Improving documentation
- Sharing Talos with others and providing feedback

## 📄 License

This project is licensed under the BSD 3-Clause License. See the [LICENSE](LICENSE) file for details.
