"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Phase = "home" | "setup" | "play" | "end";
type YesNo = "YES" | "NO";

type QAItem = {
  q: string;
  a: YesNo;
};

type Settings = {
  maxStrikes: number; // default 10
  maxQuestions: number; // default 10
  wrongLetterStrike: number; // default 1
  wrongFullGuessStrike: number; // default 1
  hintCostCategory: number; // default 3
};

const DEFAULT_SETTINGS: Settings = {
  maxStrikes: 10,
  maxQuestions: 10,
  wrongLetterStrike: 1,
  wrongFullGuessStrike: 1,
  hintCostCategory: 3,
};

function normalizeAnswer(s: string) {
  return s.normalize("NFKD").toUpperCase();
}

function isLetter(ch: string) {
  return /^[A-Z]$/.test(ch);
}

function uniqLettersInAnswer(norm: string) {
  const set = new Set<string>();
  for (const ch of norm) if (isLetter(ch)) set.add(ch);
  return set;
}

function allRevealed(norm: string, revealed: Set<string>) {
  for (const ch of norm) {
    if (isLetter(ch) && !revealed.has(ch)) return false;
  }
  return true;
}

// ✅ Needed for Settings controls (prevents Vercel build failure)
function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Xs only (no dots)
function strikeMarks(strikes: number) {
  return "X".repeat(Math.max(0, strikes)).split("").join(" ");
}

/**
 * Answer display:
 * - Less space between letters (tight)
 * - More space between words (bigger gap)
 * - Auburn orange for BOTH underscores + revealed letters
 * - Not bold
 */
function AnswerDisplay({
  normalized,
  revealed,
}: {
  normalized: string;
  revealed: Set<string>;
}) {
  const items: React.ReactNode[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];

    if (ch === " ") {
      // bigger word gap
      items.push(<span key={`w-${i}`} className="inline-block w-10" />);
      continue;
    }

    if (isLetter(ch)) {
      const shown = revealed.has(ch) ? ch : "_";
      items.push(
        <span
          key={`l-${i}`}
          className="inline-flex w-8 sm:w-10 items-center justify-center font-mono text-4xl sm:text-5xl font-normal tracking-tight text-[#E87722] mx-1"
          aria-label={shown === "_" ? "blank" : shown}
        >
          {shown}
        </span>
      );
      continue;
    }

    // punctuation visible, neutral color
    items.push(
      <span
        key={`p-${i}`}
        className="font-mono text-4xl sm:text-5xl font-normal tracking-tight text-white/90 mx-1"
      >
        {ch}
      </span>
    );
  }

  return <div className="flex flex-wrap justify-center items-center">{items}</div>;
}

/**
 * Simple sound effects (no files needed) via Web Audio API.
 * Mobile requires a user gesture once; we resume context on-demand.
 */
function useSfx(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  function getCtx() {
    if (!ctxRef.current) {
      // @ts-expect-error Safari prefix
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    return ctxRef.current;
  }

  function beep(freq: number, ms: number, volume = 0.05, type: OscillatorType = "sine") {
    if (!enabled) return;

    const ctx = getCtx();
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.value = freq;

    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + ms / 1000);
  }

  return {
    click: () => beep(440, 35, 0.03, "sine"),
    yes: () => beep(660, 90, 0.05, "triangle"),
    no: () => beep(220, 140, 0.06, "sawtooth"),
    correct: () => {
      beep(784, 80, 0.05, "triangle");
      setTimeout(() => beep(988, 90, 0.05, "triangle"), 90);
    },
    wrong: () => beep(196, 160, 0.07, "sawtooth"),
    hint: () => {
      beep(523, 80, 0.05, "sine");
      setTimeout(() => beep(659, 90, 0.05, "sine"), 90);
    },
    win: () => {
      beep(659, 90, 0.05, "triangle");
      setTimeout(() => beep(784, 90, 0.05, "triangle"), 90);
      setTimeout(() => beep(988, 120, 0.06, "triangle"), 180);
    },
    lose: () => {
      beep(220, 140, 0.06, "sawtooth");
      setTimeout(() => beep(196, 170, 0.07, "sawtooth"), 130);
      setTimeout(() => beep(174, 200, 0.08, "sawtooth"), 270);
    },
  };
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("home");

  // setup
  const [secretAnswer, setSecretAnswer] = useState("");
  const [category, setCategory] = useState("");

  // settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // sound
  const [soundsOn, setSoundsOn] = useState(true);
  const sfx = useSfx(soundsOn);

  // game state
  const [strikes, setStrikes] = useState(0);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [qaLog, setQaLog] = useState<QAItem[]>([]);
  const [revealedLetters, setRevealedLetters] = useState<Set<string>>(new Set());
  const [wrongLetters, setWrongLetters] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>("");

  // inputs
  const [questionText, setQuestionText] = useState("");
  const [letterGuess, setLetterGuess] = useState("");
  const [fullGuess, setFullGuess] = useState("");

  // host-only view
  const [showAnswerToHost, setShowAnswerToHost] = useState(false);

  // enter-to-submit focus refs
  const letterInputRef = useRef<HTMLInputElement | null>(null);
  const fullInputRef = useRef<HTMLInputElement | null>(null);

  const normalized = useMemo(() => normalizeAnswer(secretAnswer), [secretAnswer]);
  const uniqueLetters = useMemo(() => uniqLettersInAnswer(normalized), [normalized]);

  const hasWon = useMemo(() => {
    if (phase !== "play") return false;
    if (!normalized.trim()) return false;
    return allRevealed(normalized, revealedLetters);
  }, [phase, normalized, revealedLetters]);

  const hasLost = useMemo(() => phase === "play" && strikes >= settings.maxStrikes, [
    phase,
    strikes,
    settings.maxStrikes,
  ]);

  useEffect(() => {
    if (phase !== "play") return;

    if (hasWon) {
      setPhase("end");
      setMessage("You solved it!");
      sfx.win();
    } else if (hasLost) {
      setPhase("end");
      setMessage("You hit 10 strikes.");
      sfx.lose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWon, hasLost]);

  const strikesLeft = Math.max(0, settings.maxStrikes - strikes);
  const questionsLeft = Math.max(0, settings.maxQuestions - questionsAsked);

  function applyStrikes(add: number) {
    if (add <= 0) return;
    setStrikes((s) => s + add);
  }

  function resetToHome() {
    setPhase("home");
    setSecretAnswer("");
    setCategory("");
    setShowAnswerToHost(false);

    setSettings(DEFAULT_SETTINGS);

    setStrikes(0);
    setQuestionsAsked(0);
    setQaLog([]);
    setRevealedLetters(new Set());
    setWrongLetters(new Set());
    setMessage("");

    setQuestionText("");
    setLetterGuess("");
    setFullGuess("");
  }

  function startGame() {
    sfx.click();

    const trimmed = secretAnswer.trim();
    if (!trimmed) {
      setMessage("Enter a secret answer first.");
      return;
    }
    if (uniqLettersInAnswer(normalizeAnswer(trimmed)).size === 0) {
      setMessage("Answer must contain at least one letter (A–Z).");
      return;
    }

    setStrikes(0);
    setQuestionsAsked(0);
    setQaLog([]);
    setRevealedLetters(new Set());
    setWrongLetters(new Set());

    setQuestionText("");
    setLetterGuess("");
    setFullGuess("");

    setMessage("Game started — ask a question or guess a letter!");
    setPhase("play");

    setTimeout(() => letterInputRef.current?.focus(), 0);
  }

  function addQA(answer: YesNo) {
    sfx.click();

    if (questionsAsked >= settings.maxQuestions) {
      setMessage("You’ve used all 10 questions. Switch to guessing letters or the full answer.");
      return;
    }

    const q = questionText.trim();
    if (!q) {
      setMessage("Type a question first.");
      return;
    }

    setQaLog((log) => [{ q, a: answer }, ...log]);
    setQuestionsAsked((n) => n + 1);
    setQuestionText("");

    if (answer === "NO") {
      applyStrikes(1);
      sfx.no();
      setMessage("Marked as NO (+1 strike).");
    } else {
      sfx.yes();
      setMessage("Marked as YES (no strike).");
    }
  }

  function guessLetter() {
    const raw = letterGuess.trim().toUpperCase();
    const ch = raw.slice(0, 1);

    if (!isLetter(ch)) {
      setMessage("Enter a single letter A–Z.");
      return;
    }

    if (revealedLetters.has(ch) || wrongLetters.has(ch)) {
      setMessage(`You already tried “${ch}”.`);
      return;
    }

    if (normalized.includes(ch)) {
      setRevealedLetters((prev) => {
        const next = new Set(prev);
        next.add(ch);
        return next;
      });
      sfx.correct();
      setMessage(`Nice — “${ch}” is in the answer.`);
    } else {
      setWrongLetters((prev) => {
        const next = new Set(prev);
        next.add(ch);
        return next;
      });
      applyStrikes(settings.wrongLetterStrike);
      sfx.wrong();
      setMessage(`Nope — “${ch}” is not in the answer. (+${settings.wrongLetterStrike} strike)`);
    }

    setLetterGuess("");
    setTimeout(() => letterInputRef.current?.focus(), 0);
  }

  function guessFullAnswer() {
    const g = fullGuess.trim();
    if (!g) {
      setMessage("Type a full answer guess first.");
      return;
    }

    const normGuess = normalizeAnswer(g);
    if (normGuess === normalized.trim()) {
      setRevealedLetters(new Set(uniqueLetters));
      sfx.win();
      setMessage("Correct!");
    } else {
      applyStrikes(settings.wrongFullGuessStrike);
      sfx.wrong();
      setMessage(`Wrong full guess. (+${settings.wrongFullGuessStrike} strike)`);
    }

    setFullGuess("");
    setTimeout(() => fullInputRef.current?.focus(), 0);
  }

  function buyHintShowCategory() {
    const cost = settings.hintCostCategory;

    if (!category.trim()) {
      setMessage("No category was set for this game.");
      return;
    }

    applyStrikes(cost);
    sfx.hint();
    setMessage(`Hint: category is “${category.trim()}”. (+${cost} strikes)`);
  }

  const primaryBtn =
    "rounded-2xl bg-[#E87722] px-5 py-3 font-semibold text-white hover:opacity-90";
  const secondaryBtn =
    "rounded-2xl border border-white/20 px-5 py-3 font-semibold hover:bg-white/10";

  return (
    <main className="min-h-screen bg-[#0C2340] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="mb-6 text-center">
          <h1 className="text-5xl font-extrabold tracking-tight text-[#E87722]">Hang 10</h1>
          <p className="mt-2 text-lg text-white/85">
            Ask up to 10 yes/no questions. Each <span className="font-semibold">NO</span> is a strike. 10 strikes and
            you’re out.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button className={secondaryBtn} onClick={resetToHome}>
              Reset
            </button>
            <button
              className={secondaryBtn}
              onClick={() => setSoundsOn((v) => !v)}
              aria-pressed={soundsOn}
              title="Toggle sound effects"
            >
              Sounds: {soundsOn ? "On" : "Off"}
            </button>
          </div>
        </header>

        {/* Feedback box ALWAYS present (prevents resizing) */}
        <div className="mb-4 rounded-3xl border border-white/25 bg-[#E87722]/20 px-6 py-5 min-h-[88px] flex items-center text-lg font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <span className={message ? "" : "text-white/70"}>
            {message || "Make a move to see feedback here."}
          </span>
        </div>

        {/* Strikes box below feedback */}
        <div className="mb-6 rounded-3xl border border-white/25 bg-white/5 px-6 py-5 min-h-[88px] flex flex-col justify-center shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <div className="text-sm uppercase tracking-wider text-white/70">Strikes</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl text-red-400">{strikeMarks(strikes) || "—"}</span>
            <span className="text-white/75">
              ({strikes}/{settings.maxStrikes}) • {strikesLeft} left
            </span>
          </div>
        </div>

        {phase === "home" && (
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">Start</h2>
            <p className="mt-2 text-white/85">
              MVP is <span className="font-semibold">local 2-player</span>: one person enters the secret answer (Host),
              the other plays (Player).
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                className={primaryBtn}
                onClick={() => {
                  sfx.click();
                  setMessage("");
                  setPhase("setup");
                }}
              >
                Start a New Game
              </button>

              <button
                className={secondaryBtn}
                onClick={() => {
                  sfx.click();
                  setSettings(DEFAULT_SETTINGS);
                  setMessage("Settings restored to defaults.");
                }}
              >
                Restore Default Settings
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4">
              <h3 className="font-semibold text-lg">Settings</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <LabeledNumber
                  label="Wrong letter strike"
                  value={settings.wrongLetterStrike}
                  onChange={(v) => setSettings((s) => ({ ...s, wrongLetterStrike: clampInt(v, 0, 5) }))}
                />
                <LabeledNumber
                  label="Wrong full guess strikes"
                  value={settings.wrongFullGuessStrike}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, wrongFullGuessStrike: clampInt(v, 0, 10) }))
                  }
                />
                <LabeledNumber
                  label="Max strikes"
                  value={settings.maxStrikes}
                  onChange={(v) => setSettings((s) => ({ ...s, maxStrikes: clampInt(v, 1, 20) }))}
                />
                <LabeledNumber
                  label="Max questions"
                  value={settings.maxQuestions}
                  onChange={(v) => setSettings((s) => ({ ...s, maxQuestions: clampInt(v, 0, 20) }))}
                />
                <LabeledNumber
                  label="Hint cost: category"
                  value={settings.hintCostCategory}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, hintCostCategory: clampInt(v, 0, 10) }))
                  }
                />
              </div>
            </div>
          </section>
        )}

        {phase === "setup" && (
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">Host setup</h2>
            <p className="mt-2 text-white/85">Enter the secret answer and optionally a category.</p>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm text-white/85">Secret answer</label>
                <input
                  className="w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-lg outline-none focus:border-white/40"
                  value={secretAnswer}
                  onChange={(e) => setSecretAnswer(e.target.value)}
                  placeholder="e.g., THE GODFATHER"
                />
                <div className="mt-2 flex items-center gap-2 text-sm text-white/85">
                  <input
                    id="show"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showAnswerToHost}
                    onChange={(e) => setShowAnswerToHost(e.target.checked)}
                  />
                  <label htmlFor="show">Show answer (host view)</label>
                </div>
                {showAnswerToHost && secretAnswer.trim() && (
                  <div className="mt-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm">
                    <span className="text-white/70">Normalized preview:</span>{" "}
                    <span className="font-mono">{normalizeAnswer(secretAnswer)}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/85">Category (optional)</label>
                <input
                  className="w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-lg outline-none focus:border-white/40"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Movie"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button className={primaryBtn} onClick={startGame}>
                  Start Game
                </button>
                <button
                  className={secondaryBtn}
                  onClick={() => {
                    sfx.click();
                    setPhase("home");
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === "play" && (
          <>
            {/* FULL-WIDTH ANSWER AREA */}
            <section className="mb-6 rounded-3xl border border-white/15 bg-black/20 p-6">
              <div className="text-xs uppercase tracking-wider text-white/70 text-center">Answer</div>
              <AnswerDisplay normalized={normalized} revealed={revealedLetters} />
              <div className="mt-4 text-base text-white/75 text-center">
                Letters revealed:{" "}
                <span className="text-white font-semibold">{revealedLetters.size}</span> /{" "}
                <span className="text-white font-semibold">{uniqueLetters.size}</span>
              </div>
            </section>

            {/* Everything below aligned in a grid (hint + log moved DOWN here) */}
            <section className="grid gap-6 md:grid-cols-2">
              {/* Ask */}
              <div className="rounded-3xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-bold">Ask a yes/no question</h3>
                <p className="mt-1 text-sm text-white/85">
                  Each <span className="font-semibold">NO</span> is +1 strike. Max {settings.maxQuestions} questions.
                </p>
                <input
                  className="mt-3 w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-lg outline-none focus:border-white/40"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="e.g., Is it a movie?"
                  disabled={questionsAsked >= settings.maxQuestions}
                />
                <div className="mt-3 flex gap-3">
                  <button
                    className={secondaryBtn + " flex-1 disabled:opacity-40"}
                    onClick={() => addQA("YES")}
                    disabled={questionsAsked >= settings.maxQuestions}
                  >
                    YES
                  </button>
                  <button
                    className={primaryBtn + " flex-1 disabled:opacity-40"}
                    onClick={() => addQA("NO")}
                    disabled={questionsAsked >= settings.maxQuestions}
                  >
                    NO (+1)
                  </button>
                </div>
                <div className="mt-3 text-sm text-white/80">
                  <span className="font-semibold text-white">Questions:</span> {questionsAsked}/{settings.maxQuestions}{" "}
                  <span className="text-white/70">({questionsLeft} left)</span>
                </div>
              </div>

              {/* Guess letter (enter submits) */}
              <div className="rounded-3xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-bold">Guess a letter</h3>
                <p className="mt-1 text-sm text-white/85">
                  Wrong letter: +{settings.wrongLetterStrike} strike.
                </p>
                <form
                  className="mt-3 flex gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    guessLetter();
                  }}
                >
                  <input
                    ref={letterInputRef}
                    className="w-28 rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-center text-2xl font-bold outline-none focus:border-white/40"
                    value={letterGuess}
                    onChange={(e) => setLetterGuess(e.target.value)}
                    placeholder="A"
                    maxLength={2}
                  />
                  <button type="submit" className={primaryBtn + " flex-1"}>
                    Guess
                  </button>
                </form>
                <div className="mt-3 text-sm text-white/85">
                  <span className="text-white/70">Wrong letters:</span>{" "}
                  <span className="font-mono">{[...wrongLetters].sort().join(" ") || "—"}</span>
                </div>
              </div>

              {/* Guess full answer (enter submits) */}
              <div className="rounded-3xl border border-white/15 bg-white/5 p-5 md:col-span-2">
                <h3 className="text-lg font-bold">Guess the full answer</h3>
                <p className="mt-1 text-sm text-white/85">
                  Wrong full guess: +{settings.wrongFullGuessStrike} strike.
                </p>
                <form
                  className="mt-3 flex flex-col gap-3 sm:flex-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    guessFullAnswer();
                  }}
                >
                  <input
                    ref={fullInputRef}
                    className="flex-1 rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-lg outline-none focus:border-white/40"
                    value={fullGuess}
                    onChange={(e) => setFullGuess(e.target.value)}
                    placeholder="Type your full answer guess…"
                  />
                  <button type="submit" className={primaryBtn}>
                    Submit
                  </button>
                </form>
              </div>

              {/* Hint moved DOWN, aligned */}
              <div className="rounded-3xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-bold">Hint (costs strikes)</h3>
                <button
                  className="mt-3 w-full rounded-2xl border border-white/20 px-5 py-4 text-left hover:bg-white/10"
                  onClick={buyHintShowCategory}
                >
                  <div className="text-lg font-semibold">Show category</div>
                  <div className="text-sm text-white/70">Cost: +{settings.hintCostCategory} strikes</div>
                </button>
              </div>

              {/* Log moved DOWN, aligned */}
              <div className="rounded-3xl border border-white/15 bg-white/5 p-5">
                <h3 className="text-lg font-bold">Question log</h3>
                <div className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/15 bg-black/20">
                  {qaLog.length === 0 ? (
                    <div className="p-4 text-sm text-white/70">No questions yet.</div>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {qaLog.map((item, idx) => (
                        <li key={idx} className="p-4">
                          <div className="text-sm text-white/90">{item.q}</div>
                          <div className="mt-1 text-xs">
                            <span
                              className={
                                "inline-flex rounded-full px-2 py-1 font-semibold " +
                                (item.a === "YES"
                                  ? "bg-emerald-500/15 text-emerald-200"
                                  : "bg-rose-500/15 text-rose-200")
                              }
                            >
                              {item.a}
                            </span>
                            {item.a === "NO" && <span className="ml-2 text-white/70">(+1 strike)</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {phase === "end" && (
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <h2 className="text-3xl font-extrabold">{hasWon ? "🎉 You win!" : "💥 You lose!"}</h2>
            <p className="mt-2 text-white/85 text-lg">{message}</p>

            <div className="mt-5 rounded-3xl border border-white/15 bg-black/20 p-6">
              <div className="text-xs uppercase tracking-wider text-white/70">Answer</div>
              <div className="mt-3 break-words font-mono text-3xl leading-relaxed text-[#E87722]">
                {normalizeAnswer(secretAnswer).trim()}
              </div>
              {category.trim() && (
                <div className="mt-3 text-base text-white/85">
                  <span className="text-white/70">Category:</span> {category.trim()}
                </div>
              )}
              <div className="mt-3 text-base text-white/85">
                <span className="text-white/70">Strikes:</span>{" "}
                <span className="font-mono text-red-400">{strikeMarks(strikes) || "—"}</span>{" "}
                <span className="text-white/70">({strikes}/{settings.maxStrikes})</span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className={primaryBtn}
                onClick={() => {
                  sfx.click();
                  setStrikes(0);
                  setQuestionsAsked(0);
                  setQaLog([]);
                  setRevealedLetters(new Set());
                  setWrongLetters(new Set());
                  setMessage("New round — go!");
                  setQuestionText("");
                  setLetterGuess("");
                  setFullGuess("");
                  setPhase("play");
                  setTimeout(() => letterInputRef.current?.focus(), 0);
                }}
              >
                Play Again (same answer)
              </button>

              <button
                className={secondaryBtn}
                onClick={() => {
                  sfx.click();
                  setMessage("");
                  setPhase("setup");
                }}
              >
                New Answer
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function LabeledNumber(props: { label: string; value: number; onChange: (v: number) => void }) {
  const { label, value, onChange } = props;
  return (
    <label className="block">
      <div className="mb-1 text-xs text-white/70">{label}</div>
      <input
        type="number"
        className="w-full rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-sm outline-none focus:border-white/40"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
      />
    </label>
  );
}
