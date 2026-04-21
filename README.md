# ☸ K8s Remediation Analyzer

**AI-powered root cause analysis and guided remediation for Kubernetes incidents.**

An interactive prototype that demonstrates the core product loop for Kubernetes incident remediation: **Detect → Diagnose → Suggest → Remediate**. Built to explore how AI can accelerate incident resolution and reduce MTTR in Kubernetes environments.

![K8s Remediation Analyzer](docs/screenshot.png)

---

## What It Does

Select a Kubernetes incident type and get an instant, structured diagnosis:

| Feature | Description |
|---------|-------------|
| **Root Cause Analysis** | AI-powered diagnosis with confidence levels based on telemetry signals |
| **Evidence Correlation** | Correlates container logs, K8s events, and manifest configuration to identify the underlying issue |
| **Hypothesis Testing** | Tests multiple failure hypotheses and marks each as validated, invalidated, or inconclusive |
| **Guided Remediation** | Provides immediate actions (with kubectl commands), permanent fixes (manifest changes), and prevention strategies |
| **Risk Assessment** | Each remediation action includes a risk level (low/medium/high) to help operators make informed decisions |

### Supported Incident Types

- **CrashLoopBackOff** — Database connectivity failure causing startup crashes
- **OOMKilled** — ML model memory exceeding container limits under batch load
- **ImagePullBackOff** — Missing container image tag from failed CI/CD pipeline

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                User Interface                │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Incident │ │ Analysis │ │ Remediation  │ │
│  │ Selector │ │  Viewer  │ │   Actions    │ │
│  └────┬─────┘ └────▲─────┘ └──────▲───────┘ │
│       │            │               │         │
│  ┌────▼────────────┴───────────────┴───────┐ │
│  │          Analysis Engine                 │ │
│  │  ┌─────────┐  ┌──────────┐  ┌────────┐ │ │
│  │  │Telemetry│  │Hypothesis│  │  Fix   │ │ │
│  │  │ Parser  │→ │  Tester  │→ │Generator│ │ │
│  │  └─────────┘  └──────────┘  └────────┘ │ │
│  └─────────────────┬───────────────────────┘ │
│                    │                         │
│  ┌─────────────────▼───────────────────────┐ │
│  │        LLM (Claude Sonnet)              │ │
│  │  Structured JSON output with schema     │ │
│  │  enforcement for consistent responses   │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌─────────────────────────────────────────┐ │
│  │     Pre-computed Fallback Analysis      │ │
│  │  Ensures reliability when API is        │ │
│  │  unavailable (offline, CORS, etc.)      │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Structured Output Schema** — Early iterations used open-ended prompts ("analyze this incident"). Results were inconsistent. Switching to a strict JSON schema with defined fields (root cause, evidence, hypotheses, remediation) made output consistent and evaluable.

2. **Hypothesis-Driven Diagnosis** — Instead of just showing a conclusion, the analyzer shows its reasoning: which hypotheses were tested, which were validated or ruled out. This transparency builds trust — users can see *why* the system reached its conclusion.

3. **Remediation Spectrum** — Each incident includes three levels of action: immediate (stabilize now), permanent fix (prevent recurrence), and prevention (systemic improvement). This mirrors real incident response workflows.

4. **Graceful Degradation** — The app tries a live LLM API call first, but falls back to pre-computed analysis if the API is unavailable. The user experience is identical either way. This pattern is critical for production AI products — you can't have a remediation tool that fails when you need it most.

5. **Risk-Annotated Actions** — Every remediation command includes a risk level. In a real product, this would gate whether the action can be auto-executed vs. requiring human approval.

---

## Tech Stack

- **React** — UI framework
- **Anthropic Claude API** — LLM for live analysis (with pre-computed fallback)
- **Tailwind-style inline CSS** — Styling
- **No external dependencies** — Runs standalone in any React environment

---

## Getting Started

### Option 1: Run in Claude Artifacts
The simplest way — paste the contents of `src/App.jsx` into a Claude artifact (React type) and it runs immediately.

### Option 2: Local Development

```bash
# Clone the repo
git clone https://github.com/sajjavenkataavinash/K8s_remediation_analyzer.git
cd K8s_remediation_analyzer

# Install dependencies
npm install

# Start development server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Option 3: Deploy to Vercel/Netlify

```bash
npm run build
# Deploy the build/ folder to any static hosting
```

---

## Project Structure

```
K8s_remediation_analyzer/
├── README.md                  # This file
├── package.json               # Dependencies and scripts
├── public/
│   └── index.html             # HTML entry point
├── src/
│   ├── App.jsx                # Main application component
│   ├── index.js               # React entry point
│   └── incidents/             # Incident data and pre-computed analysis
│       ├── crashloop.json     # CrashLoopBackOff scenario
│       ├── oomkilled.json     # OOMKilled scenario
│       └── imagepull.json     # ImagePullBackOff scenario
└── docs/
    └── screenshot.png         # UI screenshot
```

---

## How This Connects to Real-World Remediation

This prototype explores the same product loop that production remediation tools implement:

| Step | This Prototype | Production System (e.g., Datadog) |
|------|---------------|----------------------------------|
| **Detect** | User selects incident type | Monitors detect K8s errors automatically |
| **Diagnose** | LLM analyzes logs + events + manifest | AI correlates across metrics, logs, traces, events |
| **Suggest** | Shows remediation with risk levels | Presents guided fix with confidence score |
| **Remediate** | Displays kubectl commands to copy | One-click apply, PR generation, or auto-remediation |

### Key Product Challenges Explored

- **Trust Spectrum**: How do you move users from "show me the suggestion" → "apply it for me" → "just handle it"?
- **Safety Guardrails**: Every action needs risk annotation. Wrong automated action on production = destroyed trust.
- **Evaluation**: How do you measure if the AI's diagnosis was correct? Accuracy metrics need ground truth.
- **Consistency vs. Peak Performance**: A system that's right 95% but unpredictably wrong 5% is worse than one that's right 85% consistently. Users need to predict when to trust it.

---

## Future Enhancements

- [ ] **Custom Incident Input** — Let users paste their own kubectl output / logs
- [ ] **Live Cluster Connection** — Connect via kubeconfig to analyze real-time incidents
- [ ] **Feedback Loop** — "Was this diagnosis helpful?" to build evaluation dataset
- [ ] **Multi-Signal Correlation** — Combine metrics (CPU, memory, network) with logs and events
- [ ] **Auto-Remediation Simulation** — Execute fixes in a sandboxed environment
- [ ] **Incident History** — Track past analyses and resolution patterns

---

## Author

**Avinash Sajja** — Technical Product Manager  
[LinkedIn](https://www.linkedin.com/in/venkataavinash-sajja) · [Portfolio](https://venkataavinash-sajja-tpm.pages.dev/)

---

## License

MIT License — see [LICENSE](LICENSE) for details.
