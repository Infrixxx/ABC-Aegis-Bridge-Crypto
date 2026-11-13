import { Logo } from "@/components/logo"
import { MODES } from "@/lib/modes"
import type { Mode } from "@/hooks/use-preferences"

export function Welcome({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-8 px-4 py-10">
      <header className="reveal space-y-4">
        <Logo />
        <h1 className="font-display text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          What will you
          <br />
          use this for?
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">Pick one. You can change it any time from the menu.</p>
      </header>
      <div className="grid gap-3">
        {(Object.keys(MODES) as Mode[]).map((m, i) => {
          const x = MODES[m]
          const Icon = x.icon
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              style={{ "--i": i + 1 } as React.CSSProperties}
              className="reveal card-lift group flex items-center gap-4 rounded-3xl border border-border bg-card p-4 text-left sm:p-5"
            >
              <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${x.chip}`}>
                <Icon className="size-7" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-display block text-2xl font-semibold">{x.title}</span>
                <span className="block text-sm text-muted-foreground">{x.blurb}</span>
                <span className="mt-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">{x.forWho}</span>
              </span>
            </button>
          )
        })}
      </div>
    </main>
  )
}
