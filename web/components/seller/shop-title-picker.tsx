"use client";

import { Input } from "@/components/ui/input";
import { SHOP_TITLE_MAX, SHOP_TITLE_PRESETS, isPresetTitle } from "@/lib/shop-title";
import { cn } from "@/lib/utils";

const CUSTOM = "__custom__";

/**
 * Pick how the shop is labeled: one of the presets or the seller's own words.
 * It is only a title. Nothing here asks who the seller is.
 *
 * Controlled: `value` is the title itself. A value that is not a preset (or an
 * empty one while typing) shows the custom box.
 */
export function ShopTitlePicker({
  value,
  custom,
  onChange,
}: {
  value: string;
  /** True while the custom option is chosen, even before anything is typed. */
  custom: boolean;
  onChange: (title: string, custom: boolean) => void;
}) {
  const selected = custom ? CUSTOM : value;
  const option = (key: string, label: string) => (
    <label
      key={key}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold",
        selected === key ? "border-cola bg-cola text-cream" : "border-border bg-white text-cola hover:bg-accent",
      )}
    >
      <input
        type="radio"
        name="shop_title_choice"
        value={key}
        checked={selected === key}
        onChange={() => (key === CUSTOM ? onChange(isPresetTitle(value) ? "" : value, true) : onChange(key, false))}
        className="sr-only"
      />
      {label}
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold text-cola">Shop title</legend>
      <p className="text-sm text-muted-foreground">
        How your shop is labeled on your page, in the shop list, on orders and in messages. Pick one or write your own.
      </p>
      <div className="flex flex-wrap gap-2">
        {SHOP_TITLE_PRESETS.map((preset) => option(preset, preset))}
        {option(CUSTOM, "Something else")}
      </div>
      {custom && (
        <label className="flex flex-col gap-1.5 text-sm font-bold text-cola">
          Your title ({value.length}/{SHOP_TITLE_MAX})
          <Input
            name="shop_title"
            value={value}
            maxLength={SHOP_TITLE_MAX}
            onChange={(e) => onChange(e.target.value, true)}
            placeholder="Snack Auntie"
            className="h-11 bg-white"
          />
        </label>
      )}
    </fieldset>
  );
}
