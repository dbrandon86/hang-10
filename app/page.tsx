"use client";

import React, { useEffect, useMemo, useState } from "react";

type Phase = "home" | "setup" | "play" | "end";
type YesNo = "YES" | "NO";

type QAItem = {
  q: string;
  a: YesNo;
};

type Settings = {
  maxStrikes: number; // 10
  maxQuestions: number; // 10
  wrongLetterStrike: number; // 1
  wrongFullGuessStrike: number; // 2
  hintCostCategory: number; // 3
};

const DEFAULT_SETTINGS: Settings = {
  maxStrikes: 10,
  maxQuestions: 10,
  wrongLetterStrike: 1,
  wrongFullGuessStrike: 2,
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

function maskedAnswer(norm: string, revealed: Set<string>) {
  // Show blanks as underscores for unrevealed letters; keep spaces/punctuation visible.
  let out = "";
  for (const ch of norm) {
    if (isLetter(ch)) out += (revealed.has(ch) ? ch : "_") + " ";
    else out += ch + " ";
  }
  return out.trimEnd();
}

function allRevealed(norm: string, revealed: Set<string>) {
  for (const ch of norm) {
    if (isLetter(ch) && !revealed.has(ch)) return false;
  }
  return true;
}

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// Xs only (no dots): shows the number of strikes as X characters.
function strikeMarks(strikes: number) {
  return "X".repeat(Math.max(0, strikes)).split("").join(" ");
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("home");

  // Setup fields
  const [secretAnswer, setSecretAnswer] = useState("");
  const [category, setCategory] = useState("");

  // Settings
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Game state
  const [strikes, setStrikes] = useState(0);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [qaLog, setQaLog] = useState<QAItem[]>([]);
  const [revealedLetters, setRevealedLetters] = useState<Set<string>>(new Set());
  const [wrongLetters, setWrongLetters] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string>("");

  // Inputs
  const [questionText, setQuestionText] = useState("");
  const [letterGuess, setLetterGuess] = useState("");
  const [fullGuess, setFullGuess] = useState("");

  // UI niceties
  const [showAnswerToHost, setShowAnswerToHost] = useState(false);

  const normalized = useMemo(() => normalizeAnswer(secretAnswer), [secretAnswer]);
  const uniqueLetters = useMemo(() => uniqLettersInAnswer(normalized), [normalized]);

  const pattern = useMemo(
    () => maskedAnswer(normalized, revealedLetters),
    [normalized, revealedLetters]
  );

  const hasWon = useMemo(() => {
    if (!normalized.trim()) return false;
    return allRevealed(normalized, revealedLetters);
  }, [normalized, revealedLetters]);

  const hasLost = strikes >= settings.maxStrikes;

  useEffect(() => {
    if (phase !== "play") return;
    if (hasWon) {
      setPhase("end");
      setMessage("You solved it!");
    } else if (hasLost) {
      setPhase("end");
      setMessage("You hit 10 strikes.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWon, hasLost]);

  function resetGameToHome() {
    setPhase("home");
    setSecretAnswer("");
    setCategory("");
    setShowAnswerToHost(false);

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
    const trimmed = secretAnswer.trim();
    if (!trimmed) {
      setMessage("Enter a secret answer first.");
      return;
    }
    if (uniqLettersInAnswer(normalizeAnswer(trimmed)).size === 0) {
      setMessage("Answer must contain at least one letter (A–Z).");
      return;
    }

    // fresh state
    setStrikes(0);
    setQuestionsAsked(0);
    setQaLog([]);
    setRevealedLetters(new Set());
    setWrongLetters(new Set());
    setMessage("");
    setQuestionText("");
    setLetterGuess("");
    setFullGuess("");

    setPhase("play");
  }

  function applyStrikes(add: number) {
    if (add <= 0) return;
    setStrikes((s) => s + add);
  }

  function addQA(answer: YesNo) {
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

    if (answer === "NO") applyStrikes(1);
    setMessage(answer === "YES" ? "Marked as YES (no strike)." : "Marked as NO (+1 strike).");
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
      setMessage(`Nice — “${ch}” is in the answer.`);
    } else {
      setWrongLetters((prev) => {
        const next = new Set(prev);
        next.add(ch);
        return next;
      });
      applyStrikes(settings.wrongLetterStrike);
      setMessage(`Nope — “${ch}” is not in the answer. (+${settings.wrongLetterStrike} strike)`);
    }

    setLetterGuess("");
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
      setMessage("Correct!");
    } else {
      applyStrikes(settings.wrongFullGuessStrike);
      setMessage(`Wrong full guess. (+${settings.wrongFullGuessStrike} strikes)`);
    }
    setFullGuess("");
  }

  function buyHintShowCategory() {
    const cost = settings.hintCostCategory;

    if (!category.trim()) {
      setMessage("No category was set for this game.");
      return;
    }

    applyStrikes(cost);
    setMessage(`Hint: category is “${category.trim()}”. (+${cost} strikes)`);
  }

  const strikesLeft = Math.max(0, settings.maxStrikes - strikes);
  const questionsLeft = Math.max(0, settings.maxQuestions - questionsAsked);

  const primaryBtn =
    "rounded-2xl bg-[#E87722] px-4 py-3 font-medium text-white hover:opacity-90";
  const secondaryBtn =
    "rounded-2xl border border-white/20 px-4 py-3 font-medium hover:bg-white/10";

  return (
    <main className="min-h-screen bg-[#0C2340] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#E87722]">Hang 10</h1>
            <p className="text-white/80">
              10 yes/no questions + hangman, 10 strikes and you’re out.
            </p>
          </div>
          <button className={secondaryBtn} onClick={resetGameToHome}>
            Reset
          </button>
        </header>

        {message && (
          <div className="mb-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/90">
            {message}
          </div>
        )}

        {phase === "home" && (
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <h2 className="text-xl font-semibold">Start</h2>
            <p className="mt-2 text-white/80">
              MVP is <span className="font-medium">local 2-player</span>: one person enters the
              secret answer (Host), the other plays (Player).
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <button
                className={primaryBtn}
                onClick={() => {
                  setMessage("");
                  setPhase("setup");
                }}
              >
                Start a New Game
              </button>

              <button
                className={secondaryBtn}
                onClick={() => {
                  setSettings(DEFAULT_SETTINGS);
                  setMessage("Settings restored to defaults.");
                }}
              >
                Restore Default Settings
              </button>
            </div>

            <div className="mt-8 rounded-2xl border border-white/15 bg-white/5 p-4">
              <h3 className="font-semibold">Settings</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <LabeledNumber
                  label="Wrong letter strike"
                  value={settings.wrongLetterStrike}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, wrongLetterStrike: clampInt(v, 0, 5) }))
                  }
                />
                <LabeledNumber
                  label="Wrong full guess strikes"
                  value={settings.wrongFullGuessStrike}
                  onChange={(v) =>
                    setSettings((s) => ({
                      ...s,
                      wrongFullGuessStrike: clampInt(v, 0, 10),
                    }))
                  }
                />
                <LabeledNumber
                  label="Max strikes"
                  value={settings.maxStrikes}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, maxStrikes: clampInt(v, 1, 20) }))
                  }
                />
                <LabeledNumber
                  label="Max questions"
                  value={settings.maxQuestions}
                  onChange={(v) =>
                    setSettings((s) => ({ ...s, maxQuestions: clampInt(v, 0, 20) }))
                  }
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
            <h2 className="text-xl font-semibold">Host setup</h2>
            <p className="mt-2 text-white/80">Enter the secret answer and optionally a category.</p>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm text-white/80">Secret answer</label>
                <input
                  className="w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40"
                  value={secretAnswer}
                  onChange={(e) => setSecretAnswer(e.target.value)}
                  placeholder="e.g., THE GODFATHER"
                />
                <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
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
                <label className="mb-2 block text-sm text-white/80">Category (optional)</label>
                <input
                  className="w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g., Movie"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button className={primaryBtn} onClick={startGame}>
                  Start Game
                </button>
                <button className={secondaryBtn} onClick={() => setPhase("home")}>
                  Back
                </button>
              </div>
            </div>
          </section>
        )}

        {phase === "play" && (
          <section className="grid gap-6 lg:grid-cols-3">
            {/* Left: status + answer */}
            <div className="rounded-3xl border border-white/15 bg-white/5 p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-white/90">
                  <span className="font-semibold text-white">Strikes:</span>{" "}
                  <span className="font-mono">{strikeMarks(strikes) || "—"}</span>{" "}
                  <span className="ml-2 text-white/70">
                    ({strikes}/{settings.maxStrikes}) • {strikesLeft} left
                  </span>
                </div>
                <div className="text-sm text-white/90">
                  <span className="font-semibold text-white">Questions:</span> {questionsAsked} /{" "}
                  {settings.maxQuestions}{" "}
                  <span className="ml-2 text-white/70">({questionsLeft} left)</span>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/15 bg-black/20 p-5">
                <div className="text-xs uppercase tracking-wider text-white/70">Answer</div>
                <div className="mt-2 break-words font-mono text-2xl leading-relaxed">{pattern}</div>
                <div className="mt-3 text-sm text-white/70">
                  Letters revealed:{" "}
                  <span className="text-white">{revealedLetters.size}</span> /{" "}
                  <span className="text-white">{uniqueLetters.size}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <h3 className="font-semibold">Ask a yes/no question</h3>
                  <p className="mt-1 text-sm text-white/80">
                    Each <span className="font-medium">NO</span> is +1 strike. Max{" "}
                    {settings.maxQuestions} questions.
                  </p>
                  <input
                    className="mt-3 w-full rounded-2xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40"
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
                      className={
                        primaryBtn + " flex-1 disabled:opacity-40"
                      }
                      onClick={() => addQA("NO")}
                      disabled={questionsAsked >= settings.maxQuestions}
                    >
                      NO (+1)
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
                  <h3 className="font-semibold">Guess a letter</h3>
                  <p className="mt-1 text-sm text-white/80">
                    Wrong letter: +{settings.wrongLetterStrike} strike.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <input
                      className="w-24 rounded-2xl border border-white/20 bg-black/20 px-4 py-3 text-center text-lg font-semibold outline-none focus:border-white/40"
                      value={letterGuess}
                      onChange={(e) => setLetterGuess(e.target.value)}
                      placeholder="A"
                      maxLength={2}
                    />
                    <button className={primaryBtn + " flex-1"} onClick={guessLetter}>
                      Guess
                    </button>
                  </div>

                  <div className="mt-3 text-sm text-white/80">
                    <div>
                      <span className="text-white/70">Wrong letters:</span>{" "}
                      <span className="font-mono">{[...wrongLetters].sort().join(" ") || "—"}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-white/5 p-4 md:col-span-2">
                  <h3 className="font-semibold">Guess the full answer</h3>
                  <p className="mt-1 text-sm text-white/80">
                    Wrong full guess: +{settings.wrongFullGuessStrike} strikes.
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      className="flex-1 rounded-2xl border border-white/20 bg-black/20 px-4 py-3 outline-none focus:border-white/40"
                      value={fullGuess}
                      onChange={(e) => setFullGuess(e.target.value)}
                      placeholder="Type your full answer guess…"
                    />
                    <button className={primaryBtn} onClick={guessFullAnswer}>
                      Submit
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: hints + log */}
            <aside className="rounded-3xl border border-white/15 bg-white/5 p-6">
              <h3 className="text-lg font-semibold">Hint (costs strikes)</h3>
              <div className="mt-3 grid gap-3">
                <button
                  className="rounded-2xl border border-white/20 px-4 py-3 text-left hover:bg-white/10"
                  onClick={buyHintShowCategory}
                >
                  <div className="font-medium">Show category</div>
                  <div className="text-sm text-white/70">
                    Cost: +{settings.hintCostCategory} strikes
                  </div>
                </button>
              </div>

              <h3 className="mt-8 text-lg font-semibold">Question log</h3>
              <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-white/15 bg-black/20">
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

              <div className="mt-6 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
                <div className="font-semibold text-white">Host-only (optional)</div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="hostshow"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showAnswerToHost}
                    onChange={(e) => setShowAnswerToHost(e.target.checked)}
                  />
                  <label htmlFor="hostshow">Show answer</label>
                </div>
                {showAnswerToHost && (
                  <div className="mt-2 font-mono text-white/90">{normalized.trim() || "—"}</div>
                )}
              </div>
            </aside>
          </section>
        )}

        {phase === "end" && (
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">{hasWon ? "🎉 You win!" : "💥 You lose!"}</h2>
            <p className="mt-2 text-white/80">{message}</p>

            <div className="mt-5 rounded-2xl border border-white/15 bg-black/20 p-5">
              <div className="text-xs uppercase tracking-wider text-white/70">Answer</div>
              <div className="mt-2 break-words font-mono text-2xl leading-relaxed">
                {normalizeAnswer(secretAnswer).trim()}
              </div>
              {category.trim() && (
                <div className="mt-3 text-sm text-white/80">
                  <span className="text-white/70">Category:</span> {category.trim()}
                </div>
              )}
              <div className="mt-3 text-sm text-white/80">
                <span className="text-white/70">Strikes:</span> {strikeMarks(strikes) || "—"}{" "}
                <span className="text-white/70">
                  ({strikes}/{settings.maxStrikes})
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className={primaryBtn}
                onClick={() => {
                  // keep same answer/category; restart play
                  setStrikes(0);
                  setQuestionsAsked(0);
                  setQaLog([]);
                  setRevealedLetters(new Set());
                  setWrongLetters(new Set());
                  setMessage("");
                  setQuestionText("");
                  setLetterGuess("");
                  setFullGuess("");
                  setPhase("play");
                }}
              >
                Play Again (same answer)
              </button>

              <button
                className={secondaryBtn}
                onClick={() => {
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
