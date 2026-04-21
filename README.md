# K8s Remediation Analyzer

An AI-powered prototype for Kubernetes incident triage — root cause analysis, hypothesis testing, and guided remediation steps, structured for SRE workflows.

**Live demo:** https://k8s-remediation-analyzer.vercel.app

---

## What It Does

Select a Kubernetes incident type and the analyzer returns:

- **Root cause** with confidence level (High / Medium / Low)
- **Evidence signals** correlated across logs, events, and manifests
- **Hypotheses** — validated, invalidated, or inconclusive
- **Remediation steps** — immediate stabilization, permanent fix, and preventive action, each with risk annotation and `kubectl` commands
- **Resolution timeline** estimate

Supported incident types:
- `CrashLoopBackOff` — database connectivity failure on startup
- `OOMKilled` — container exceeding memory limits
- `ImagePullBackOff` — registry authentication / image not found

---

## How It Works

The app calls the Anthropic Claude API with a structured prompt and enforces a strict JSON output schema for consistency. If the API is unavailable, it falls back to pre-computed analysis — so the UI always returns a result.

**Stack:** React 18, Anthropic Claude API, deployed on Vercel

---

## Run Locally

```bash
git clone https://github.com/sajjavenkataavinash/K8s_remediation_analyzer.git
cd K8s_remediation_analyzer
npm install
npm start
