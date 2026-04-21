# K8s Remediation Analyzer

A working prototype that shows how AI can automatically diagnose Kubernetes incidents and decide whether to fix them without human involvement — or escalate when it's too risky to act alone.

**Live demo:** https://k8s-remediation-analyzer.vercel.app

---

## The Problem It Solves

When a service goes down in Kubernetes, an on-call engineer has to manually dig through logs, events, and configuration files to figure out what broke and how to fix it. This takes time — often 15–30 minutes just to identify the root cause, while the outage continues.

This prototype explores what it looks like when AI handles that diagnostic work automatically, and then makes a judgment call: _is this safe enough to fix on its own, or does a human need to be involved?_

---

## What You'll See in the Demo

Pick any of the three incident scenarios. The analyzer will:

1. **Show the Datadog monitor alert** that detected the incident — what metric crossed what threshold
2. **Run root cause analysis** — explains exactly what broke and why, with a confidence level
3. **Give an auto-remediation verdict** — either `AUTO` (AI acts immediately) or `MANUAL REVIEW` (escalates to a human), with the reasoning behind that decision
4. **Show the evidence** — what signals from the logs, events, and pod config led to the conclusion
5. **Test hypotheses** — what possible causes were considered, ruled out, or left uncertain
6. **Provide remediation steps** — immediate fix, permanent fix, and how to prevent it from happening again

### The three scenarios and why each verdict is different

| Incident | What Happened | AI Verdict | Why |
|---|---|---|---|
| `CrashLoopBackOff` | API gateway can't reach the database — crashes 14 times in 23 min | **Manual Review** | Database issues can hide deeper problems. Auto-restarting could make it worse. Human must verify first. |
| `OOMKilled` | ML model uses 95% of memory at rest. Any request tips it over. | **Auto-Remediate** | Increasing a memory limit is low-risk and reversible. This exact pattern has been fixed the same way 3 times before. |
| `ImagePullBackOff` | Deployment references a container image that doesn't exist in the registry | **Auto-Remediate** | Rolling back to the last working version in staging is safe — no data involved, no production impact. |

---

## What's Happening Behind the Scenes

### The AI analysis pipeline

When you select an incident, the app sends the pod's logs, Kubernetes events, and deployment manifest to Claude (Anthropic's AI model) with a specific prompt that asks for output in a strict JSON format. That structure covers: root cause, evidence signals, hypotheses with validation status, and remediation steps.

The strict JSON schema is intentional — it forces the AI to reason in a structured way instead of generating free-form text, which makes the output auditable and consistent across incidents.

If the Claude API isn't available, the app falls back to pre-computed analysis so the demo always works.

### How the auto-remediation decision is made

Each incident has a pre-defined verdict in this prototype, but in a real system this decision would be determined by three factors:

- **Risk level of the action** — is it reversible? Does it touch production data?
- **Pattern confidence** — has this exact failure type been seen and fixed before?
- **Blast radius** — how many services or users are affected if the automated action goes wrong?

The `OOMKilled` scenario auto-remediates because all three are low-risk. The `CrashLoopBackOff` escalates because the root cause (database down) has too many possible explanations that require human judgment before acting.

### Why structured output matters for AI in production

A common failure mode for AI in incident response is generating confident-sounding text that's wrong in subtle ways. Enforcing a schema — where every analysis must include validated vs. invalidated hypotheses, and every remediation step must carry a risk annotation — makes it much harder for the model to skip its reasoning. It also makes the output directly usable by downstream systems (ticketing, runbooks, on-call notifications) without further parsing.

---

## Tech Stack

- **React 18** — single-page app, no backend required
- **Anthropic Claude API** — AI analysis with structured JSON output
- **Vercel** — deployed as a static site

---

## Run Locally

```bash
git clone https://github.com/sajjavenkataavinash/K8s_remediation_analyzer.git
cd K8s_remediation_analyzer
npm install
npm start
```

Opens at `http://localhost:3000`. To enable live AI analysis, add your Anthropic API key:

```bash
echo "REACT_APP_ANTHROPIC_API_KEY=your-key-here" > .env
```

Without it, the app uses pre-computed fallback data — everything still works.

---

*Built by [Avinash Sajja](https://www.linkedin.com/in/sajjavenkataavinash/) — exploring AI-powered reliability and autonomous remediation for cloud-native systems*
