import { Laptop, Moon, Sun } from "lucide-react";
import type { ThemePreference } from "@/app/App";

interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  compact?: boolean;
}

const themes: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Usar tema claro", icon: Sun },
  { value: "dark", label: "Usar tema oscuro", icon: Moon },
  { value: "system", label: "Usar tema del sistema", icon: Laptop }
];

export function ThemeToggle({ value, onChange, compact = false }: ThemeToggleProps) {
  return (
    <div className={`theme-toggle ${compact ? "theme-toggle--compact" : ""}`} aria-label="Apariencia">
      {themes.map(({ value: theme, label, icon: Icon }) => (
        <button
          className={`icon-button ${value === theme ? "is-active" : ""}`}
          key={theme}
          type="button"
          aria-label={label}
          title={label}
          onClick={() => onChange(theme)}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={2} />
        </button>
      ))}
    </div>
  );
}
