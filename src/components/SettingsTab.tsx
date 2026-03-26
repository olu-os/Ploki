import React, { useState, useEffect } from "react";

export type PunctuationMode = "auto" | "spoken" | "none";

export interface AppSettings {
  punctuationMode: PunctuationMode;
  segmentationSilenceMs: number;
  autoStopSilenceMs: number;
  dailyWordGoal: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  punctuationMode: "auto",
  segmentationSilenceMs: 1500,
  autoStopSilenceMs: 20000,
  dailyWordGoal: 500,
};

interface Props {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
}

const PUNCTUATION_OPTIONS: { value: PunctuationMode; label: string; description: string }[] = [
  {
    value: "auto",
    label: "Automatic",
    description: "Ploki adds punctuation automatically.",
  },
  {
    value: "spoken",
    label: "Spoken",
    description: 'You say the punctuation aloud — "comma", "period", "question mark", etc.',
  },
  {
    value: "none",
    label: "None",
    description: "No punctuation is added.",
  },
];

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  // Offset to keep the label centred over the thumb (thumb radius ~8px)
  const offsetPx = 8 - (pct / 100) * 16;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-stone-800">{label}</p>
        <p className="text-xs text-stone-400 mt-0.5">{description}</p>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-stone-800"
        />
        <span
          className="absolute top-7 text-xs font-mono font-medium text-stone-600 -translate-x-1/2 pointer-events-none bg-white px-1.5 py-0.5 rounded"
          style={{ left: `calc(${pct}% + ${offsetPx}px)` }}
        >
          {format(value)}
        </span>
      </div>
      <div className="flex justify-between text-xs text-stone-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

function WordGoalInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      value={raw}
      onChange={(e) => {
        const s = e.target.value.replace(/[^0-9]/g, "");
        setRaw(s);
        if (s !== "") onChange(Number(s));
        else onChange(0);
      }}
      className="w-24 px-3 py-1.5 text-sm border border-stone-200 rounded-md text-right focus:outline-none focus:ring-2 focus:ring-stone-400"
    />
  );
}

export function SettingsTab({ settings, onChange }: Props) {
  return (
    <div className="w-full max-w-2xl flex flex-col gap-6">

      {/* Punctuation */}
      <div className="bg-white rounded-sm shadow-sm border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Punctuation</h3>
          <p className="text-xs text-stone-400 mt-0.5">How punctuation is added to your dictated text.</p>
        </div>
        <div className="divide-y divide-stone-100">
          {PUNCTUATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-4 px-6 py-4 cursor-pointer transition-colors ${
                settings.punctuationMode === opt.value ? "bg-stone-50" : "hover:bg-stone-50/60"
              }`}
            >
              <input
                type="radio"
                name="punctuationMode"
                value={opt.value}
                checked={settings.punctuationMode === opt.value}
                onChange={() => onChange({ punctuationMode: opt.value })}
                className="mt-0.5 accent-stone-800 flex-shrink-0"
              />
              <div>
                <p className="text-sm font-medium text-stone-800">{opt.label}</p>
                <p className="text-xs text-stone-400 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Voice Timing */}
      <div className="bg-white rounded-sm shadow-sm border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Voice Timing</h3>
          <p className="text-xs text-stone-400 mt-0.5">Control how long the app listens between phrases.</p>
        </div>
        <div className="px-6 py-5 flex flex-col gap-6">
          <SliderRow
            label="Pause before new line"
            description='Silence after speaking before moving to the next line. Longer helps prevent mid-sentence splits.'
            value={settings.segmentationSilenceMs}
            min={0}
            max={10000}
            step={100}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
            onChange={(v) => onChange({ segmentationSilenceMs: v })}
          />
          <SliderRow
            label="Auto-stop after silence"
            description="How long to wait with no speech before automatically stopping the microphone."
            value={settings.autoStopSilenceMs}
            min={0}
            max={60000}
            step={1000}
            format={(v) => `${v / 1000}s`}
            onChange={(v) => onChange({ autoStopSilenceMs: v })}
          />
        </div>
      </div>

      {/* Writing Goals */}
      <div className="bg-white rounded-sm shadow-sm border border-stone-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">Writing Goals</h3>
          <p className="text-xs text-stone-400 mt-0.5">Targets shown in the sidebar.</p>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-stone-800">Daily word goal</p>
              <p className="text-xs text-stone-400 mt-0.5">Number of words to write per session.</p>
            </div>
<WordGoalInput value={settings.dailyWordGoal} onChange={(v) => onChange({ dailyWordGoal: v })} />
          </div>
        </div>
      </div>

    </div>
  );
}
