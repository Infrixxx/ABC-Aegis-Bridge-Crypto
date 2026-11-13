import { Bot, CheckCircle2, Clock, ShieldAlert, ShieldCheck, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { AgentTraceStep } from "@/lib/types"
import { cn } from "@/lib/utils"

function getAgentIcon(agent: string, status: string) {
  const isBlocked = status.includes("BLOCK") || status === "REJECTED" || status === "FAILED"
  if (agent.toLowerCase().includes("security")) {
    return isBlocked ? <ShieldAlert className="size-4 text-danger" /> : <ShieldCheck className="size-4 text-success" />
  }
  if (agent.toLowerCase().includes("guardian")) {
    return isBlocked ? <ShieldAlert className="size-4 text-warning" /> : <Zap className="size-4 text-primary" />
  }
  if (agent.toLowerCase().includes("transaction")) {
    return isBlocked ? <ShieldAlert className="size-4 text-danger" /> : <CheckCircle2 className="size-4 text-success" />
  }
  return <Bot className="size-4 text-primary" />
}

function getStatusBadgeTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const s = status.toUpperCase()
  if (s === "OK" || s === "CLEARED" || s === "APPROVED" || s === "SETTLED" || s === "PAID") return "success"
  if (s.includes("WARN") || s.includes("402")) return "warning"
  if (s.includes("BLOCK") || s === "FAILED" || s === "REJECTED") return "danger"
  return "neutral"
}

export function AgentTraceView({
  steps,
  orderId,
  className,
}: {
  steps?: AgentTraceStep[] | null
  orderId?: string
  className?: string
}) {
  const hasSteps = Array.isArray(steps) && steps.length > 0

  return (
    <div className={cn("space-y-3 rounded-2xl border border-border bg-card/60 p-4 shadow-xs", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-primary" />
          <h4 className="font-display text-sm font-semibold tracking-tight text-foreground">
            LangGraph Multi-Agent Telemetry
          </h4>
          {orderId && (
            <span className="font-mono text-xs text-muted-foreground">#{orderId}</span>
          )}
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          Autonomous On-Ledger Governance
        </span>
      </div>

      {!hasSteps ? (
        <div className="space-y-2 py-2 text-xs text-muted-foreground">
          <p>
            This order is currently queued. When confirmed via offline USSD or M2M paywall, the LangGraph agent graph executes in real time:
          </p>
          <div className="grid gap-1.5 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/50 p-2">
              <span className="font-semibold text-foreground">1. Security Node</span>
              <p className="mt-0.5 text-[11px]">O(1) Threat cache + 60s FX lock.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <span className="font-semibold text-foreground">2. Guardian Node</span>
              <p className="mt-0.5 text-[11px]">XRPL Channel caps &amp; whitelist.</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2">
              <span className="font-semibold text-foreground">3. Transaction Node</span>
              <p className="mt-0.5 text-[11px]">XRPL DestinationTag settlement.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative space-y-3 pl-2 before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {steps.map((step, idx) => {
            const tone = getStatusBadgeTone(step.status)
            return (
              <div key={idx} className="relative flex items-start gap-3 pl-5">
                <span className="absolute left-2.5 top-1 -translate-x-1/2 flex size-4 items-center justify-center rounded-full bg-card ring-2 ring-border">
                  <span className="size-1.5 rounded-full bg-primary" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                      {getAgentIcon(step.agent, step.status)}
                      <span>{step.agent}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        <Clock className="size-3" />
                        {step.latency_ms}ms
                      </span>
                      <Badge tone={tone} className="text-[10px] py-0 px-1.5">
                        {step.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground break-words">
                    {step.detail}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
