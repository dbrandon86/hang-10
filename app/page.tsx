"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* =======================
   Types & Defaults
======================= */
type Phase = "home" | "setup" | "play" | "end";
type YesNo = "YES" | "NO";

type QAItem = { q: string; a: YesNo };

type Settings = {
  maxStrikes: number;
  maxQuestions: number;
  wrongLetterStrike: number;
  wrongFullGuessStrike: number;
  hintCostCategory: number;
};

const DEFAULT_SETTINGS: Settings = {
  maxStrikes: 10,
  maxQuestions: 10,
  wrongLetterStrike: 1,
  wrongFullGuessStrike: 1,
  hintCostCategory: 3,
};

/* =======================
   Helpers
======================= */
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

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function strikeMarks(strikes: number) {
  return "X".repeat(Math.max(0, strikes)).split("").join(" ");
}

/* =======================
   Answer Display (FULL WIDTH)
======================= */
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
      items.push(<span key={`w-${i}`} className="inline-block w-10" />);
    } else if (isLetter(ch)) {
      items.push(
        <span
          key={`l-${i}`}
          className="mx-1 w-8 sm:w-10 text-center font-mono text-4xl sm:text-5xl font-normal text-[#E87722]"
        >
          {revealed.has(ch) ? ch : "_"}
        </span>
      );
    } else {
      items.push(
        <span
          key={`p-${i}`}
          className="mx-1 font-mono text-4xl sm:text-5xl text-white/90"
        >
          {ch}
        </span>
      );
    }
  }

  return <div className="flex flex-wrap justify-center">{items}</div>;
}

/* =======================
   Page Component
======================= */
export default function Page() {
  const [phase, setPhase] = useState<Phase>("home");

  const [secretAnswer, setSecretAnswer] = useState("");
  const [category, setCategory] = useState("");

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [strikes, setStrikes] = useState(0);
  const [questionsAsked, setQuestionsAsked] = useState(0);
  const [qaLog, setQaLog] = useState<QAItem[]>([]);
  const [revealedLetters, setRevealedLetters] = useState<Set<string>>(new Set());
  const [wrongLetters, setWrongLetters] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  const [questionText, setQuestionText] = useState("");
  const [letterGuess, setLetterGuess] = useState("");
  const [fullGuess, setFullGuess] = useState("");

  const letterInputRef = useRef<HTMLInputElement | null>(null);
  const fullInputRef = useRef<HTMLInputElement | null>(null);

  const normalized = useMemo(() => normalizeAnswer(secretAnswer), [secretAnswer]);
  const uniqueLetters = useMemo(() => uniqLettersInAnswer(normalized), [normalized]);

  const hasWon = allRevealed(normalized, revealedLetters);
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
  }, [hasWon, hasLost, phase]);

  /* =======================
     Game Logic
  ======================= */
  function startGame() {
    if (!secretAnswer.trim()) {
      setMessage("Enter a secret answer first.");
      return;
    }
    setStrikes(0);
    setQuestionsAsked(0);
    setQaLog([]);
    setRevealedLetters(new Set());
    setWrongLetters(new Set());
    setMessage("Game started!");
    setPhase("play");
  }

  function addQA(answer: YesNo) {
    if (!questionText.trim()) return;
    setQaLog((l) => [{ q: questionText, a: answer }, ...l]);
    setQuestionsAsked((n) => n + 1);
    setQuestionText("");
    if (answer === "NO") setStrikes((s) => s + 1);
    setMessage(answer === "YES" ? "YES" : "NO (+1 strike)");
  }

  function guessLetter() {
    const ch = letterGuess.toUpperCase();
    if (!isLetter(ch)) return;

    if (normalized.includes(ch)) {
      setRevealedLetters((r) => new Set(r).add(ch));
      setMessage(`"${ch}" is in the answer`);
    } else {
      setWrongLetters((w) => new Set(w).add(ch));
      setStrikes((s) => s + settings.wrongLetterStrike);
      setMessage(`"${ch}" is NOT in the answer`);
    }
    setLetterGuess("");
  }

  function guessFullAnswer() {
    if (normalizeAnswer(fullGuess) === normalized) {
      setRevealedLetters(new Set(uniqueLetters));
      setMessage("Correct!");
    } else {
      setStrikes((s) => s + settings.wrongFullGuessStrike);
      setMessage("Wrong full guess");
    }
    setFullGuess("");
  }

  /* =======================
     UI
  ======================= */
  const primaryBtn =
    "rounded-2xl bg-[#E87722] px-5 py-3 font-semibold text-white hover:opacity-90";
  const secondaryBtn =
    "rounded-2xl border border-white/20 px-5 py-3 hover:bg-white/10";

  return (
    <main className="min-h-screen bg-[#0C2340] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <header className="mb-6 text-center">
          <h1 className="text-5xl font-extrabold text-[#E87722]">Hang 10</h1>
          <p className="mt-2 text-lg text-white/80">
            10 questions. 10 strikes. Think carefully.
          </p>
        </header>

        {/* Feedback */}
        <div className="mb-4 rounded-3xl bg-[#E87722]/20 px-6 py-5 min-h-[88px] flex items-center text-lg font-semibold">
          {message || "Make a move to see feedback here."}
        </div>

        {/* Strikes */}
        <div className="mb-6 rounded-3xl bg-white/5 px-6 py-5 min-h-[88px]">
          <div className="uppercase text-sm text-white/70">Strikes</div>
          <div className="mt-2 text-2xl font-mono text-red-400">
            {strikeMarks(strikes)}
          </div>
        </div>

        {phase === "play" && (
          <>
            {/* FULL-WIDTH ANSWER */}
            <div className="mb-8 rounded-3xl bg-black/20 px-6 py-8">
              <div className="mb-3 text-sm uppercase text-white/70 text-center">
                Answer
              </div>
              <AnswerDisplay normalized={normalized} revealed={revealedLetters} />
            </div>

            {/* ACTIONS GRID */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Ask Question */}
              <div className="rounded-3xl bg-white/5 p-5">
                <h3 className="font-bold">Ask a yes/no question</h3>
                <input
                  className="mt-3 w-full rounded-xl px-4 py-3 text-black"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
                <div className="mt-3 flex gap-3">
                  <button className={secondaryBtn} onClick={() => addQA("YES")}>
                    YES
                  </button>
                  <button className={primaryBtn} onClick={() => addQA("NO")}>
                    NO
                  </button>
                </div>
              </div>

              {/* Guess Letter */}
              <div className="rounded-3xl bg-white/5 p-5">
                <h3 className="font-bold">Guess a letter</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    guessLetter();
                  }}
                  className="mt-3 flex gap-3"
                >
                  <input
                    ref={letterInputRef}
                    className="w-20 text-center text-2xl rounded-xl text-black"
                    value={letterGuess}
                    onChange={(e) => setLetterGuess(e.target.value)}
                  />
                  <button className={primaryBtn}>Guess</button>
                </form>
              </div>

              {/* Guess Full Answer */}
              <div className="rounded-3xl bg-white/5 p-5 md:col-span-2">
                <h3 className="font-bold">Guess the full answer</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    guessFullAnswer();
                  }}
                  className="mt-3 flex gap-3"
                >
                  <input
                    ref={fullInputRef}
                    className="flex-1 rounded-xl px-4 py-3 text-black"
                    value={fullGuess}
                    onChange={(e) => setFullGuess(e.target.value)}
                  />
                  <button className={primaryBtn}>Submit</button>
                </form>
              </div>

              {/* Hint */}
              <div className="rounded-3xl bg-white/5 p-5">
                <h3 className="font-bold">Hint</h3>
                <button
                  className={secondaryBtn}
                  onClick={() => {
                    setStrikes((s) => s + settings.hintCostCategory);
                    setMessage(`Category: ${category || "None"}`);
                  }}
                >
                  Show category (+{settings.hintCostCategory})
                </button>
              </div>

              {/* Log */}
              <div className="rounded-3xl bg-white/5 p-5">
                <h3 className="font-bold">Question Log</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {qaLog.map((q, i) => (
                    <li key={i}>
                      {q.q} — <strong>{q.a}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
