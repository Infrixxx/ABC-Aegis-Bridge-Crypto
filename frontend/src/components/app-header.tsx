import { Logo } from "@/components/logo"
import { DisplayMenu } from "@/components/display-menu"
import { Badge } from "@/components/ui/badge"
import { MODES, tabIcon, tabLabel, type TabId } from "@/lib/modes"
import type { Mode } from "@/hooks/use-preferences"
import type { HealthState } from "@/hooks/use-health"
import { cn } from "@/lib/utils"

export function AppHeader({
  mode,
  tab,
  setTab,
  health,
}: {
  mode: Mode
  tab: TabId
  setTab: (t: TabId) => void
  health: HealthState
}) {
  const tabs = MODES[mode].tabs
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          <Logo className="size-9" />
          <span className="font-display text-xl font-semibold tracking-tight">Aegis Bridge</span>
          <nav className="ml-6 hidden gap-1 sm:flex" aria-label="Sections">
            {tabs.map((t) => {
              const Icon = tabIcon(t, mode)
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-current={tab === t ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                    tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {tabLabel(t, mode)}
                </button>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {health === "offline" && <Badge tone="danger">Offline</Badge>}
            <DisplayMenu />
          </div>
        </div>
      </header>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        aria-label="Sections"
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
          {tabs.map((t) => {
            const Icon = tabIcon(t, mode)
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
                  tab === t ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className={cn("grid h-7 w-14 place-items-center rounded-full", tab === t && "bg-foreground text-background")}>
                  <Icon className="size-5" aria-hidden />
                </span>
                {tabLabel(t, mode)}
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
