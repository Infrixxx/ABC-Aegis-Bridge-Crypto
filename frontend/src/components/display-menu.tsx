import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Segmented } from "@/components/ui/segmented"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/input"
import { MODES } from "@/lib/modes"
import { usePreferences, type Mode } from "@/hooks/use-preferences"
import { useSpeech } from "@/hooks/use-speech"

export function DisplayMenu() {
  const { prefs, setPref } = usePreferences()
  const { supported } = useSpeech()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Display and accessibility">
          <Settings2 aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[80dvh] space-y-4 overflow-y-auto">
        <div className="space-y-1.5">
          <Label>View</Label>
          <Segmented<Mode>
            label="View"
            value={prefs.mode ?? "shop"}
            onValueChange={(v) => setPref("mode", v)}
            options={(Object.keys(MODES) as Mode[]).map((m) => ({ value: m, label: MODES[m].name }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <Segmented
            label="Theme"
            value={prefs.theme}
            onValueChange={(v) => setPref("theme", v)}
            options={[
              { value: "system", label: "Auto" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Colours</Label>
          <Segmented
            label="Colour vision"
            value={prefs.palette}
            onValueChange={(v) => setPref("palette", v)}
            options={[
              { value: "standard", label: "Standard" },
              { value: "rg", label: "Red-green" },
              { value: "by", label: "Blue-yellow" },
            ]}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Text size</Label>
          <Segmented
            label="Text size"
            value={prefs.textSize}
            onValueChange={(v) => setPref("textSize", v)}
            options={[
              { value: "md", label: "Normal" },
              { value: "lg", label: "Large" },
              { value: "xl", label: "Larger" },
            ]}
          />
        </div>
        <label className="flex items-center justify-between gap-3 text-sm font-medium">
          High contrast
          <Switch checked={prefs.contrast} onCheckedChange={(v) => setPref("contrast", v)} />
        </label>
        {supported && (
          <>
            <label className="flex items-center justify-between gap-3 text-sm font-medium">
              Read updates aloud
              <Switch checked={prefs.speech} onCheckedChange={(v) => setPref("speech", v)} />
            </label>
            <div className="space-y-1.5">
              <Label>Voice speed</Label>
              <Segmented
                label="Voice speed"
                value={prefs.speechRate}
                onValueChange={(v) => setPref("speechRate", v)}
                options={[
                  { value: "slow", label: "Slow" },
                  { value: "normal", label: "Normal" },
                  { value: "fast", label: "Fast" },
                ]}
              />
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
