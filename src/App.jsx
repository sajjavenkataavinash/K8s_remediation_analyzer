import { useState, useEffect, useRef } from "react";

const SAMPLE_INCIDENTS = [
  {
    id: "crashloop",
    label: "CrashLoopBackOff",
    event: {
      type: "CrashLoopBackOff", namespace: "production", pod: "api-gateway-7d4b8c6f9-x2k4m",
      container: "api-gateway", cluster: "us-east-1-prod", node: "ip-10-0-3-142.ec2.internal",
      restartCount: 14, lastState: "Terminated", exitCode: 1, reason: "Error", age: "23m",
      logs: "2026-04-20T14:32:01Z [ERROR] Failed to connect to database at postgres://db-primary:5432/apidb\n2026-04-20T14:32:01Z [ERROR] Connection refused - retrying in 5s\n2026-04-20T14:32:06Z [ERROR] Failed to connect to database at postgres://db-primary:5432/apidb\n2026-04-20T14:32:06Z [FATAL] Max retries exceeded. Shutting down.\n2026-04-20T14:32:06Z [INFO] Process exited with code 1",
      events: "LAST SEEN   TYPE      REASON              MESSAGE\n2m          Warning   BackOff             Back-off restarting failed container\n3m          Warning   Unhealthy           Readiness probe failed: connection refused\n5m          Normal    Pulled              Container image \"api-gateway:v2.4.1\" already present\n23m         Normal    Scheduled           Successfully assigned to ip-10-0-3-142",
      manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api-gateway\n  namespace: production\nspec:\n  replicas: 3\n  template:\n    spec:\n      containers:\n      - name: api-gateway\n        image: api-gateway:v2.4.1\n        env:\n        - name: DB_HOST\n          value: \"db-primary\"\n        - name: DB_PORT\n          value: \"5432\"\n        resources:\n          limits:\n            memory: \"512Mi\"\n            cpu: \"500m\""
    },
    analysis: {
      root_cause: { summary: "Container cannot connect to PostgreSQL database service db-primary on port 5432, causing the application to crash on startup.", detailed_explanation: "The container logs show repeated 'Connection refused' errors when attempting to connect to postgres://db-primary:5432/apidb. After exhausting retry attempts, the process exits with code 1, triggering Kubernetes to restart the container. With 14 restarts in 23 minutes, the pod is now in CrashLoopBackOff with increasing backoff delays.", confidence: "high", severity: "critical" },
      evidence: [
        { signal: "Exit code 1 with FATAL: Max retries exceeded", interpretation: "Application has a hard dependency on database connectivity at startup and crashes deterministically when it fails" },
        { signal: "14 restarts in 23 minutes", interpretation: "The issue is persistent, not transient — the database service has been unreachable for the entire duration" },
        { signal: "Readiness probe failed: connection refused", interpretation: "The container's health endpoint is also unreachable, confirming the app never successfully starts" },
        { signal: "Container image already present on node", interpretation: "This is not an image pull issue — the container starts but crashes during initialization" }
      ],
      hypotheses: [
        { hypothesis: "Database service db-primary is down or not deployed", status: "validated", reasoning: "Consistent connection refused errors across all restart attempts indicate the target service is not accepting connections" },
        { hypothesis: "Incorrect database credentials or connection string", status: "invalidated", reasoning: "Connection refused (ECONNREFUSED) indicates a TCP-level failure, not an authentication error" },
        { hypothesis: "Network policy blocking traffic between namespaces", status: "inconclusive", reasoning: "Possible if db-primary is in a different namespace. Would need to check NetworkPolicy resources" },
        { hypothesis: "Container resource limits causing OOM before connection", status: "invalidated", reasoning: "Exit code is 1 (application error), not 137 (OOM). Memory limits of 512Mi are adequate" }
      ],
      remediation: {
        immediate: { action: "Check if the database service and pod are running. If down, restart the database deployment.", command: "kubectl get pods -n production -l app=db-primary && kubectl get svc db-primary -n production", risk: "low" },
        permanent_fix: { action: "Add a startup probe with graceful retry logic so the container waits for database availability instead of crashing.", changes: "Add to container spec:\n  startupProbe:\n    tcpSocket:\n      port: 5432\n    failureThreshold: 30\n    periodSeconds: 10\n\nOr add init container:\n  initContainers:\n  - name: wait-for-db\n    image: busybox\n    command: ['sh', '-c', 'until nc -z db-primary 5432; do sleep 2; done']" },
        prevention: "Implement circuit breaker pattern for database connections. Add PodDisruptionBudgets for the database. Set up monitors on database pod availability."
      },
      affected_services: ["api-gateway (3 replicas affected)", "Upstream services routing to api-gateway", "End users hitting API endpoints"],
      timeline_estimate: "5-15 min if database needs restart; 30-60 min if data corruption"
    }
  },
  {
    id: "oomkilled",
    label: "OOMKilled",
    event: {
      type: "OOMKilled", namespace: "production", pod: "ml-inference-5f8d9a7b2-q9r3n",
      container: "ml-inference", cluster: "us-west-2-prod", node: "ip-10-0-7-88.ec2.internal",
      restartCount: 3, lastState: "Terminated", exitCode: 137, reason: "OOMKilled", age: "12m",
      logs: "2026-04-20T15:10:22Z [INFO] Loading model weights: recommendation-v3.bin (1.8GB)\n2026-04-20T15:10:45Z [INFO] Model loaded successfully. Memory usage: 1.9GB\n2026-04-20T15:10:46Z [INFO] Starting inference server on :8080\n2026-04-20T15:11:02Z [INFO] Processing batch request: 250 items\n2026-04-20T15:11:08Z [WARN] Memory usage at 92% of limit (1.84GB / 2GB)\n2026-04-20T15:11:09Z [INFO] Processing batch request: 300 items\nKilled",
      events: "LAST SEEN   TYPE      REASON              MESSAGE\n1m          Warning   OOMKilling          Memory cgroup out of memory: Killed process 1\n2m          Normal    Pulled              Container image \"ml-inference:v3.1.0\" already present\n12m         Normal    Scheduled           Successfully assigned to ip-10-0-7-88",
      manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ml-inference\n  namespace: production\nspec:\n  replicas: 2\n  template:\n    spec:\n      containers:\n      - name: ml-inference\n        image: ml-inference:v3.1.0\n        resources:\n          requests:\n            memory: \"1Gi\"\n            cpu: \"1000m\"\n          limits:\n            memory: \"2Gi\"\n            cpu: \"2000m\""
    },
    analysis: {
      root_cause: { summary: "ML model weights consume 1.9GB at rest, leaving only ~100MB headroom. Concurrent batch requests push memory beyond the 2Gi container limit.", detailed_explanation: "The recommendation model v3.bin requires 1.8GB to load, and after initialization the container sits at 1.9GB — already 95% of the 2Gi limit. When batch inference requests arrive (250-300 items), the additional memory for tensor operations and request buffers exceeds the limit. The kernel OOM killer terminates the process with signal 9 (exit code 137).", confidence: "high", severity: "critical" },
      evidence: [
        { signal: "Model file is 1.8GB, post-load memory is 1.9GB", interpretation: "Base memory footprint leaves no room for inference workload" },
        { signal: "Memory at 92% before second batch request", interpretation: "First batch pushed memory close to limit; second batch was the tipping point" },
        { signal: "Exit code 137 (SIGKILL)", interpretation: "Kernel OOM killer terminated the process — not a graceful shutdown" },
        { signal: "Memory request 1Gi vs limit 2Gi", interpretation: "Large gap means pod gets burstable QoS — no guaranteed memory" }
      ],
      hypotheses: [
        { hypothesis: "Container memory limit too low for model + inference", status: "validated", reasoning: "Model alone uses 95% of the limit. Any inference work will exceed it." },
        { hypothesis: "Memory leak in the inference server", status: "invalidated", reasoning: "OOM happens quickly after load, not gradually. Usage correlates with batch size, not duration." },
        { hypothesis: "Batch size is too large", status: "validated", reasoning: "250-300 items per batch with 95% memory already used guarantees OOM" },
        { hypothesis: "Model file grew larger in recent version", status: "inconclusive", reasoning: "Cannot determine from current data. Worth checking release notes." }
      ],
      remediation: {
        immediate: { action: "Increase container memory limit to 4Gi to provide headroom for model + inference.", command: "kubectl set resources deployment/ml-inference -n production --limits=memory=4Gi --requests=memory=3Gi", risk: "low" },
        permanent_fix: { action: "Right-size memory based on profiled workload. Implement batch size limits. Consider model quantization.", changes: "Update deployment manifest:\n  resources:\n    requests:\n      memory: \"3Gi\"  # was 1Gi\n    limits:\n      memory: \"4Gi\"  # was 2Gi\n\nAdd to app config:\n  MAX_BATCH_SIZE: 100\n  MEMORY_WATCHDOG: true" },
        prevention: "Set up memory usage monitors with warning at 80% of limit. Implement VPA recommendations. Add app-level memory guards that reject requests near limits."
      },
      affected_services: ["ml-inference (1 of 2 replicas down)", "Recommendation API consumers", "Product pages depending on recommendations"],
      timeline_estimate: "5 min for limit increase; 1-2 hours for batch tuning"
    }
  },
  {
    id: "imagepull",
    label: "ImagePullBackOff",
    event: {
      type: "ImagePullBackOff", namespace: "staging", pod: "checkout-service-6c4a9d8e1-h7j2p",
      container: "checkout-service", cluster: "us-east-1-staging", node: "ip-10-0-2-55.ec2.internal",
      restartCount: 0, lastState: "Waiting", exitCode: null, reason: "ImagePullBackOff", age: "8m",
      logs: "(no logs available — container never started)",
      events: "LAST SEEN   TYPE      REASON              MESSAGE\n1m          Warning   Failed              Failed to pull image: manifest not found\n2m          Warning   Failed              Error: ImagePullBackOff\n8m          Normal    Scheduled           Successfully assigned to ip-10-0-2-55",
      manifest: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout-service\n  namespace: staging\nspec:\n  replicas: 1\n  template:\n    spec:\n      containers:\n      - name: checkout-service\n        image: us-east1-docker.pkg.dev/myproject/services/checkout-service:v1.9.3-rc2\n        ports:\n        - containerPort: 3000\n      imagePullSecrets:\n      - name: artifact-registry-key"
    },
    analysis: {
      root_cause: { summary: "Image tag v1.9.3-rc2 does not exist in Google Artifact Registry. The CI/CD pipeline likely failed to push this image before deployment.", detailed_explanation: "The Kubernetes event shows 'manifest not found' when pulling from Artifact Registry, meaning the repository exists but the specific tag v1.9.3-rc2 is not present. The '-rc2' suffix suggests a release candidate that may not have passed CI checks. This commonly occurs when a deployment is triggered before the CI build completes.", confidence: "high", severity: "warning" },
      evidence: [
        { signal: "Error: manifest not found (not 'access denied')", interpretation: "Registry auth is working (imagePullSecrets valid), but the specific tag doesn't exist" },
        { signal: "Tag is v1.9.3-rc2 (release candidate)", interpretation: "RC tags are built by CI pipelines. The pipeline may have failed or tag was never pushed" },
        { signal: "Namespace is staging, not production", interpretation: "Pre-production deployment, likely part of release validation" },
        { signal: "Zero restarts, container never started", interpretation: "Unlike CrashLoopBackOff, the image was never pulled — issue is entirely in the image layer" }
      ],
      hypotheses: [
        { hypothesis: "Image tag v1.9.3-rc2 was never pushed to registry", status: "validated", reasoning: "Manifest not found is definitive — the tag does not exist." },
        { hypothesis: "Registry credentials are expired", status: "invalidated", reasoning: "Expired credentials produce 'unauthorized', not 'manifest not found'" },
        { hypothesis: "Wrong registry region", status: "inconclusive", reasoning: "If image was pushed to different regional registry, it wouldn't appear. Worth verifying CI target." },
        { hypothesis: "CI/CD pipeline build failed for this tag", status: "validated", reasoning: "Most likely — deployment was triggered before CI completed or after it failed" }
      ],
      remediation: {
        immediate: { action: "Verify the image exists. If not, roll back to last known good tag.", command: "gcloud artifacts docker images list us-east1-docker.pkg.dev/myproject/services/checkout-service --include-tags | grep v1.9", risk: "low" },
        permanent_fix: { action: "Add image existence verification as a gate in the deployment pipeline.", changes: "Add CI step before deploy:\n  - name: verify-image\n    run: |\n      gcloud artifacts docker images describe \\\n        $REGISTRY/checkout-service:$TAG || exit 1\n\nOr rollback now:\n  kubectl set image deployment/checkout-service \\\n    checkout-service=$REGISTRY/checkout-service:v1.9.2 \\\n    -n staging" },
        prevention: "Implement image promotion workflow: images verified in staging registry before deployment manifests reference them. Add monitor on ImagePullBackOff events."
      },
      affected_services: ["checkout-service (staging — 0/1 ready)", "Staging integration tests", "QA team blocked on release validation"],
      timeline_estimate: "5 min for rollback; 15-30 min to rebuild and push RC"
    }
  }
];

const ConfidenceBadge = ({ level }) => {
  const c = { high: { bg: "#0a3d1a", border: "#1a7a3a", text: "#4ade80", label: "HIGH" }, medium: { bg: "#3d2e0a", border: "#7a6a1a", text: "#facc15", label: "MEDIUM" }, low: { bg: "#3d0a0a", border: "#7a1a1a", text: "#f87171", label: "LOW" } }[level] || { bg: "#3d2e0a", border: "#7a6a1a", text: "#facc15", label: "MEDIUM" };
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: c.bg, border: `1px solid ${c.border}`, color: c.text, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: c.text }} />{c.label}</span>);
};

const SeverityBadge = ({ severity }) => {
  const c = { critical: { bg: "#dc2626" }, warning: { bg: "#d97706" }, info: { bg: "#2563eb" } }[severity] || { bg: "#2563eb" };
  return (<span style={{ background: c.bg, color: "#fff", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{severity}</span>);
};

const Section = ({ title, icon, children, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #2a2a3a", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#1a1a2e", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontWeight: 600, textAlign: "left" }}>
        <span style={{ fontSize: 14 }}>{icon}</span><span style={{ flex: 1 }}>{title}</span>
        <span style={{ color: "#64748b", fontSize: 12, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>▼</span>
      </button>
      {open && <div style={{ padding: 14, background: "#12121e" }}>{children}</div>}
    </div>
  );
};

const TypewriterText = ({ text, speed = 5, onComplete }) => {
  const safe = text || "";
  const [shown, setShown] = useState("");
  const i = useRef(0);
  useEffect(() => {
    if (!safe) { onComplete?.(); return; }
    setShown(""); i.current = 0;
    const iv = setInterval(() => {
      if (i.current < safe.length) { const c = Math.min(4, safe.length - i.current); setShown(p => p + safe.slice(i.current, i.current + c)); i.current += c; }
      else { clearInterval(iv); onComplete?.(); }
    }, speed);
    return () => clearInterval(iv);
  }, [safe]);
  return <span>{shown}</span>;
};

export default function App() {
  const [sel, setSel] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [phase, setPhase] = useState(0);
  const [src, setSrc] = useState("");

  const analyze = async (inc) => {
    setSel(inc); setLoading(true); setAnalysis(null); setTab("overview"); setPhase(0); setSrc("");
    // Try live API, silently fall back to pre-computed
    let result = null, source = "pre-computed";
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 2048,
          messages: [{ role: "user", content: `You are a K8s SRE. Analyze: ${inc.event.type} pod ${inc.event.pod}. Logs: ${inc.event.logs}. Events: ${inc.event.events}. Manifest: ${inc.event.manifest}. Respond ONLY with JSON: {"root_cause":{"summary":"","detailed_explanation":"","confidence":"high","severity":"critical"},"evidence":[{"signal":"","interpretation":""}],"hypotheses":[{"hypothesis":"","status":"validated","reasoning":""}],"remediation":{"immediate":{"action":"","command":"","risk":"low"},"permanent_fix":{"action":"","changes":""},"prevention":""},"affected_services":[""],"timeline_estimate":""}` }]
        })
      });
      const d = await r.json();
      const t = (d.content || []).filter(b => b.type === "text").map(b => b.text).join("");
      if (t && t.includes("{")) { result = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1)); source = "live AI"; }
    } catch (e) { /* fallback */ }
    if (!result) { await new Promise(r => setTimeout(r, 1800)); result = inc.analysis; }
    setAnalysis(result); setSrc(source); setPhase(1); setLoading(false);
  };

  const riskColor = { low: "#4ade80", medium: "#facc15", high: "#f87171" };
  const statusCfg = { validated: { i: "✅", c: "#4ade80" }, invalidated: { i: "❌", c: "#f87171" }, inconclusive: { i: "❓", c: "#facc15" } };
  const tabs = [{ id: "overview", l: "Root Cause", i: "🔍" }, { id: "remediation", l: "Remediation", i: "⚡" }, { id: "raw", l: "Raw Data", i: "📋" }];

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", background: "#0d0d1a", color: "#e2e8f0", minHeight: "100vh", maxWidth: 720, margin: "0 auto", padding: "20px 16px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:#12121e}::-webkit-scrollbar-thumb{background:#2a2a3a;border-radius:3px}@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", fontSize: 16 }}>☸</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#f1f5f9" }}>K8s Remediation Analyzer</h1>
        </div>
        <p style={{ fontSize: 12, color: "#64748b", margin: 0, paddingLeft: 42 }}>AI-powered root cause analysis and guided remediation for Kubernetes incidents</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Select incident to analyze</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SAMPLE_INCIDENTS.map(inc => {
            const isSel = sel?.id === inc.id;
            const c = { crashloop: { bg: "#2a1a1a", b: "#7a3a3a", a: "#3d1a1a", t: "#f87171" }, oomkilled: { bg: "#2a2a1a", b: "#7a6a1a", a: "#3d3a1a", t: "#facc15" }, imagepull: { bg: "#1a1a2a", b: "#3a3a7a", a: "#1a1a3d", t: "#818cf8" } }[inc.id];
            return (<button key={inc.id} onClick={() => !loading && analyze(inc)} style={{ padding: "10px 16px", borderRadius: 8, border: `1px solid ${isSel ? c.t : c.b}`, background: isSel ? c.a : c.bg, color: isSel ? c.t : "#94a3b8", cursor: loading ? "wait" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", opacity: loading && !isSel ? 0.5 : 1 }}>{inc.label}</button>);
          })}
        </div>
      </div>

      {sel && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8, padding: 12, background: "#1a1a2e", borderRadius: 8, border: "1px solid #2a2a3a", marginBottom: 16 }}>
          {[{ l: "Pod", v: sel.event.pod.split("-").slice(0, 2).join("-") }, { l: "Namespace", v: sel.event.namespace }, { l: "Restarts", v: sel.event.restartCount }, { l: "Age", v: sel.event.age }, { l: "Exit", v: sel.event.exitCode ?? "N/A" }].map((x, i) => (
            <div key={i} style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", marginBottom: 2 }}>{x.l}</div><div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{x.v}</div></div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", gap: 20 }}>
          <div style={{ width: 48, height: 48, border: "3px solid #2a2a3a", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center" }}><div style={{ fontWeight: 600, color: "#c4b5fd", marginBottom: 4 }}>Analyzing incident telemetry...</div><div>Correlating logs, events, and manifest</div></div>
        </div>
      )}

      {analysis && !loading && (<>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: src === "live AI" ? "#4ade80" : "#818cf8", background: src === "live AI" ? "#0a3d1a" : "#1a1a3d", border: `1px solid ${src === "live AI" ? "#1a7a3a" : "#3a3a7a"}`, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>
            {src === "live AI" ? "⚡ Live AI" : "📦 Pre-computed Analysis"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 2, marginBottom: 16, background: "#1a1a2e", borderRadius: 8, padding: 3 }}>
          {tabs.map(t => (<button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "none", background: tab === t.id ? "#2a2a4a" : "transparent", color: tab === t.id ? "#e2e8f0" : "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><span>{t.i}</span>{t.l}</button>))}
        </div>

        {tab === "overview" && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 16 }}>🔍</span><span style={{ fontWeight: 700, fontSize: 14 }}>Root Cause Analysis</span>
              <ConfidenceBadge level={analysis.root_cause.confidence} /><SeverityBadge severity={analysis.root_cause.severity} />
            </div>
            <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600, marginBottom: 6, lineHeight: 1.4 }}><TypewriterText text={analysis.root_cause.summary} speed={8} /></div>
            <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.5 }}>{phase >= 1 && <TypewriterText text={analysis.root_cause.detailed_explanation} speed={5} onComplete={() => setPhase(2)} />}</div>
          </div>
          {phase >= 2 && <Section title="Evidence Signals" icon="📊"><div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(analysis.evidence || []).map((e, i) => (<div key={i} style={{ padding: "8px 10px", background: "#161625", borderRadius: 6, borderLeft: "3px solid #818cf8" }}>
              <div style={{ color: "#c4b5fd", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>SIGNAL</div>
              <div style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 6 }}>{e.signal}</div>
              <div style={{ color: "#86efac", fontSize: 11, fontWeight: 600, marginBottom: 2 }}>INTERPRETATION</div>
              <div style={{ color: "#e2e8f0", fontSize: 13 }}>{e.interpretation}</div>
            </div>))}
          </div></Section>}
          {phase >= 2 && <Section title="Hypotheses Tested" icon="🧪"><div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(analysis.hypotheses || []).map((h, i) => { const s = statusCfg[h.status] || statusCfg.inconclusive; return (
              <div key={i} style={{ padding: "8px 10px", background: "#161625", borderRadius: 6 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <span style={{ flexShrink: 0 }}>{s.i}</span><span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600, flex: 1 }}>{h.hypothesis}</span>
                  <span style={{ color: s.c, fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{(h.status || "").toUpperCase()}</span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: 12, paddingLeft: 22 }}>{h.reasoning}</div>
              </div>);
            })}
          </div></Section>}
        </div>)}

        {tab === "remediation" && analysis.remediation && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#0a1a0a", border: "1px solid #1a3a1a", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>⚡</span><span style={{ fontWeight: 700, color: "#4ade80", fontSize: 14 }}>Immediate Action</span>
              {analysis.remediation.immediate?.risk && <span style={{ fontSize: 11, color: riskColor[analysis.remediation.immediate.risk], background: "#1a1a2e", padding: "2px 6px", borderRadius: 4 }}>Risk: {analysis.remediation.immediate.risk.toUpperCase()}</span>}
            </div>
            <div style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 10 }}>{analysis.remediation.immediate?.action}</div>
            {analysis.remediation.immediate?.command && <pre style={{ background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 6, padding: 12, color: "#a5f3fc", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", overflowX: "auto", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all" }}><span style={{ color: "#64748b" }}>$ </span>{analysis.remediation.immediate.command}</pre>}
          </div>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 16 }}>🔧</span><span style={{ fontWeight: 700, color: "#818cf8", fontSize: 14 }}>Permanent Fix</span></div>
            <div style={{ color: "#e2e8f0", fontSize: 13, marginBottom: 8 }}>{analysis.remediation.permanent_fix?.action}</div>
            {analysis.remediation.permanent_fix?.changes && <pre style={{ background: "#0d0d1a", border: "1px solid #2a2a3a", borderRadius: 6, padding: 12, color: "#fde68a", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", lineHeight: 1.5, margin: 0, wordBreak: "break-all" }}>{analysis.remediation.permanent_fix.changes}</pre>}
          </div>
          <div style={{ background: "#1a1a2e", border: "1px solid #2a2a3a", borderRadius: 8, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><span style={{ fontSize: 16 }}>🛡️</span><span style={{ fontWeight: 700, color: "#f0abfc", fontSize: 14 }}>Prevention</span></div>
            <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.5 }}>{analysis.remediation.prevention}</div>
          </div>
          {analysis.timeline_estimate && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#1a1a2e", borderRadius: 8, border: "1px solid #2a2a3a" }}><span>⏱️</span><span style={{ color: "#94a3b8", fontSize: 13 }}>Resolution:</span><span style={{ color: "#e2e8f0", fontSize: 13, fontWeight: 600 }}>{analysis.timeline_estimate}</span></div>}
        </div>)}

        {tab === "raw" && sel && (<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[["Container Logs", "📝", sel.event.logs], ["Kubernetes Events", "📋", sel.event.events], ["Deployment Manifest", "⚙️", sel.event.manifest]].map(([t, ic, d], i) => (
            <Section key={i} title={t} icon={ic}><pre style={{ background: "#0d0d1a", borderRadius: 6, padding: 12, color: "#e2e8f0", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", overflowX: "auto", margin: 0, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{d}</pre></Section>
          ))}
        </div>)}
      </>)}

      {!sel && !loading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>☸</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginBottom: 4 }}>No incident selected</div>
          <div style={{ fontSize: 12, color: "#4a4a6a" }}>Select a Kubernetes error above to run AI-powered analysis</div>
        </div>
      )}

      <div style={{ marginTop: 24, padding: "12px 0", borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#4a4a6a" }}>Built by Avinash Sajja · AI-Powered K8s Remediation Prototype</div>
      </div>
    </div>
  );
}
