import { Banknote, Cpu, Layers, Receipt, Store, type LucideIcon } from "lucide-react"
import type { Mode } from "@/hooks/use-preferences"

export type TabId = "charge" | "activity" | "machines"

export interface ModeMeta {
  name: string
  title: string
  blurb: string
  forWho: string
  icon: LucideIcon
  chip: string
  tabs: TabId[]
}

export const MODES: Record<Mode, ModeMeta> = {
  shop: {
    name: "Shop",
    title: "Take payments",
    blurb: "Type an amount, show the code, get paid. Customers can pay from any phone, even one with no data.",
    forWho: "Shop owners and cashiers",
    icon: Store,
    chip: "bg-[var(--decor-1)] text-[#1b1405]",
    tabs: ["charge", "activity"],
  },
  machines: {
    name: "Machines",
    title: "Set limits for machines",
    blurb: "Chargers, meters and other devices that pay on their own, with a spending limit only you can change.",
    forWho: "Machine owners and operators",
    icon: Cpu,
    chip: "bg-[var(--decor-2)] text-white",
    tabs: ["machines", "activity"],
  },
  pro: {
    name: "Full details",
    title: "See everything",
    blurb: "Order tags, proofs of payment, the complete ledger table and the technical numbers behind each payment.",
    forWho: "Accountants and developers",
    icon: Layers,
    chip: "bg-[var(--decor-3)] text-white",
    tabs: ["charge", "machines", "activity"],
  },
}

export function tabLabel(tab: TabId, mode: Mode): string {
  if (tab === "charge") return "Charge"
  if (tab === "machines") return "Machines"
  return mode === "shop" ? "Today" : mode === "machines" ? "Payments" : "Ledger"
}

export function tabIcon(tab: TabId, mode: Mode): LucideIcon {
  if (tab === "charge") return Store
  if (tab === "machines") return Cpu
  return mode === "shop" ? Banknote : Receipt
}
