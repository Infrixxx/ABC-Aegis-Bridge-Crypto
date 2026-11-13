import { LogOut, User as UserIcon } from "lucide-react"
import { Logo } from "@/components/logo"
import { DisplayMenu } from "@/components/display-menu"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MODES, tabIcon, tabLabel, type TabId } from "@/lib/modes"
import type { Mode } from "@/hooks/use-preferences"
import type { HealthState } from "@/hooks/use-health"
import { useAuth } from "@/hooks/use-auth"
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
  const { user, logout } = useAuth()

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
          <div className="ml-auto flex items-center gap-2">
            {health === "offline" && <Badge tone="danger">Offline</Badge>}

            {user && (
              <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-2xs md:flex">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                  <UserIcon className="size-3.5" />
                </span>
                <div className="text-left leading-tight">
                  <p className="text-xs font-semibold text-foreground">{user.full_name}</p>
                  <p className="text-[10px] text-muted-foreground">{user.organization || user.role.toUpperCase()}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-danger"
                  onClick={logout}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            )}

            <DisplayMenu />

            {user && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground hover:text-danger md:hidden"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="size-4" />
              </Button>
            )}
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
