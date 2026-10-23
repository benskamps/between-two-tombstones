"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ReadoutStrip } from "@/components/ui/Instrument";
import { SymbolPair } from "@/components/ui/Motifs";
import { Candle, Chisel } from "@/components/ui/symbols";
import { recordStoneCalculated } from "@/lib/passport/store";
import {
  birthFromAged,
  exactAge,
  formatAge,
  formatYMD,
  parseAged,
  parseIsoDate,
  type YMD,
} from "@/lib/stonemath";

type Mode = "birth" | "span";

type Preset = {
  label: string;
  mode: Mode;
  birthIso?: string;
  deathIso: string;
  carvedAge?: string;
  note: string;
};

const PRESETS: Preset[] = [
  {
    label: "1851 Victorian stone",
    mode: "birth",
    deathIso: "1851-03-04",
    carvedAge: "Aged 34 y'rs 2 m's 11 d's",
    note: "Died March 4, 1851 · borrows 28 days from February 1851.",
  },
  {
    label: "Washington Irving",
    mode: "span",
    birthIso: "1783-04-03",
    deathIso: "1859-11-28",
    note: "Sleepy Hollow Cemetery · exact years, months and days.",
  },
  {
    label: "“In the 76th year”",
    mode: "birth",
    deathIso: "1859-11-28",
    carvedAge: "in the 76th year of his age",
    note: "Being in your 76th year means 75 full years have passed.",
  },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIso(d: YMD): string {
  return `${String(d.y).padStart(4, "0")}-${pad2(d.m)}-${pad2(d.d)}`;
}

export function StoneMathTool() {
  const [mode, setMode] = useState<Mode>("birth");
  const [deathIso, setDeathIso] = useState("1851-03-04");
  const [birthIso, setBirthIso] = useState("1783-04-03");
  const [carvedAge, setCarvedAge] = useState("Aged 34 y'rs 2 m's 11 d's");

  function applyPreset(p: Preset) {
    setMode(p.mode);
    setDeathIso(p.deathIso);
    if (p.birthIso) setBirthIso(p.birthIso);
    if (p.carvedAge) setCarvedAge(p.carvedAge);
    recordStoneCalculated();
  }

  const birthCalc = useMemo(() => {
    const death = parseIsoDate(deathIso);
    if (!death) return { ok: false as const, error: "Enter a real death date (YYYY-MM-DD)." };
    const parsed = parseAged(carvedAge);
    if (!parsed) {
      return {
        ok: false as const,
        error: "Couldn’t read a carved age. Try “Aged 34 y'rs 2 m's 11 d's” or “in the 76th year of his age”.",
      };
    }
    try {
      const est = birthFromAged(death, parsed);
      return { ok: true as const, death, parsed, est };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Couldn’t work back that date." };
    }
  }, [deathIso, carvedAge]);

  const spanCalc = useMemo(() => {
    const birth = parseIsoDate(birthIso);
    const death = parseIsoDate(deathIso);
    if (!birth) return { ok: false as const, error: "Enter a real birth date (YYYY-MM-DD)." };
    if (!death) return { ok: false as const, error: "Enter a real death date (YYYY-MM-DD)." };
    try {
      const age = exactAge(birth, death);
      return { ok: true as const, birth, death, age };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Couldn’t calculate that span." };
    }
  }, [birthIso, deathIso]);

  return (
    <div className="space-y-5" data-testid="stonemath-tool">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Calculation mode">
          <button
            type="button"
            aria-pressed={mode === "birth"}
            onClick={() => setMode("birth")}
            className={`btn flex-1 ${mode === "birth" ? "btn-primary" : "btn-ghost"}`}
          >
            Work back birth date
          </button>
          <button
            type="button"
            aria-pressed={mode === "span"}
            onClick={() => setMode("span")}
            className={`btn flex-1 ${mode === "span" ? "btn-primary" : "btn-ghost"}`}
          >
            Age between two dates
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="label text-muted">Sample carvings</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="btn btn-ghost px-3 text-sm"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {mode === "birth" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="block font-bold">Date of death (YYYY-MM-DD)</span>
              <input
                type="text"
                inputMode="numeric"
                value={deathIso}
                onChange={(e) => {
                  setDeathIso(e.target.value);
                  recordStoneCalculated();
                }}
                placeholder="1851-03-04"
                className="field w-full"
              />
            </label>
            <label className="block space-y-1">
              <span className="block font-bold">Carved age on the stone</span>
              <input
                type="text"
                value={carvedAge}
                onChange={(e) => {
                  setCarvedAge(e.target.value);
                  recordStoneCalculated();
                }}
                placeholder="Aged 34 y'rs 2 m's 11 d's"
                className="field w-full"
              />
            </label>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="block font-bold">Date of birth (YYYY-MM-DD)</span>
              <input
                type="text"
                inputMode="numeric"
                value={birthIso}
                onChange={(e) => {
                  setBirthIso(e.target.value);
                  recordStoneCalculated();
                }}
                placeholder="1783-04-03"
                className="field w-full"
              />
            </label>
            <label className="block space-y-1">
              <span className="block font-bold">Date of death (YYYY-MM-DD)</span>
              <input
                type="text"
                inputMode="numeric"
                value={deathIso}
                onChange={(e) => {
                  setDeathIso(e.target.value);
                  recordStoneCalculated();
                }}
                placeholder="1859-11-28"
                className="field w-full"
              />
            </label>
          </div>
        )}
      </div>

      <section aria-label="Stonecutter result" className="arch arch-rule space-y-3 text-center">
        <SymbolPair
          className="justify-center"
          death={<Chisel className="h-6 w-6" />}
          life={<Candle className="h-6 w-6" animate />}
        />
        {mode === "birth" ? (
          birthCalc.ok ? (
            <>
              <ReadoutStrip
                tone="candle"
                live
                status={birthCalc.parsed.inYear ? `${birthCalc.parsed.inYear}th year` : birthCalc.est.exact ? "Exact match" : "Approximate"}
                values={[
                  { label: "Parsed", value: `${birthCalc.parsed.years}y ${birthCalc.parsed.months}m ${birthCalc.parsed.days}d` },
                  { label: "Born", value: toIso(birthCalc.est.birth) },
                ]}
              />
              <p className="label text-muted">Born</p>
              <p className="font-display text-3xl text-candle" data-testid="stonemath-result">
                {formatYMD(birthCalc.est.birth)}
              </p>
              <p className="text-sm text-muted">
                Worked back from {formatYMD(birthCalc.death)} minus {formatAge(birthCalc.parsed)}.
              </p>
              {birthCalc.parsed.inYear && (
                <p className="text-sm text-muted">
                  “In the {birthCalc.parsed.inYear}th year” means {birthCalc.parsed.years} full years had passed, so the
                  birth fell in the year ending {formatYMD(birthCalc.est.birth)}.
                </p>
              )}
              {!birthCalc.parsed.inYear && birthCalc.est.matches.length > 1 && (
                <p className="text-sm text-muted">
                  Month-end borrowing fits {birthCalc.est.matches.length} adjacent dates:{" "}
                  {birthCalc.est.matches.map(formatYMD).join(" or ")}.
                </p>
              )}
            </>
          ) : (
            <p role="alert" className="text-danger" data-testid="stonemath-error">
              {birthCalc.error}
            </p>
          )
        ) : spanCalc.ok ? (
          <>
            <ReadoutStrip
              tone="candle"
              live
              status="Carved span"
              values={[
                { label: "Stamp", value: `${spanCalc.age.years}¢` },
                { value: `${spanCalc.age.years}y ${spanCalc.age.months}m ${spanCalc.age.days}d` },
              ]}
            />
            <p className="label text-muted">Carved age at death</p>
            <p className="font-display text-3xl text-candle" data-testid="stonemath-result">
              {formatAge(spanCalc.age)}
            </p>
            <p className="text-sm text-muted">
              From {formatYMD(spanCalc.birth)} to {formatYMD(spanCalc.death)} · Postage stamp value: {spanCalc.age.years}
            </p>
          </>
        ) : (
          <p role="alert" className="text-danger" data-testid="stonemath-error">
            {spanCalc.error}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/games" className="btn btn-ghost">
          Back to the games
        </Link>
        <Link href="/p" className="btn btn-ghost">
          Open Graveyard Passport
        </Link>
      </div>
    </div>
  );
}
