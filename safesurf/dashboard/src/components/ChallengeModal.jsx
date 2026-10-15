import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, ShieldCheck, X } from 'lucide-react';

const CHALLENGE_PROMPTS = [
  "I choose self-discipline, mental clarity, and long-term goals over short-term impulses.",
  "Pausing gives me strength. I have control over my thoughts and actions.",
  "I am building healthy digital habits and protecting my peace of mind."
];

export default function ChallengeModal({ isOpen, onClose, onConfirm }) {
  const [targetPrompt, setTargetPrompt] = useState('');
  const [userInput, setUserInput] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(60);

  useEffect(() => {
    if (isOpen) {
      // Pick random prompt and reset timer
      const randomPrompt = CHALLENGE_PROMPTS[Math.floor(Math.random() * CHALLENGE_PROMPTS.length)];
      setTargetPrompt(randomPrompt);
      setUserInput('');
      setSecondsRemaining(60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, secondsRemaining]);

  if (!isOpen) return null;

  const isTextMatched = userInput.trim() === targetPrompt.trim();
  const isUnlocked = secondsRemaining === 0 && isTextMatched;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-card max-w-lg w-full p-6 border-amber-500/30 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Pause Protection Challenge</h3>
            <p className="text-xs text-amber-400/90 font-medium">60-Second Mindfulness &amp; Typing Verification</p>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          To prevent impulsive disabling, SafeSurf enforces a 60-second reflection timer and verification pledge before protection can be paused.
        </p>

        {/* 60s Countdown Timer */}
        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
            <Clock className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '4s' }} />
            <span>Reflection Cooldown:</span>
          </div>
          <span className={`text-2xl font-black ${secondsRemaining === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {secondsRemaining > 0 ? `${secondsRemaining}s` : 'Timer Complete'}
          </span>
        </div>

        {/* Typing Verification Prompt */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-400 block mb-1.5">
            Type this statement exactly as shown:
          </label>
          <div className="p-3 rounded-lg bg-slate-900 border border-white/10 text-xs italic text-slate-200 select-none mb-2">
            "{targetPrompt}"
          </div>
          <textarea
            rows={2}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="Type verification statement here..."
            className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none font-mono"
          />
          {userInput.length > 0 && (
            <p className={`text-[11px] mt-1 font-medium ${isTextMatched ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isTextMatched ? '✓ Text matches perfectly' : '✗ Text does not match yet'}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 flex items-center justify-center gap-1.5 transition-all"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Keep Protection Active</span>
          </button>

          <button
            onClick={onConfirm}
            disabled={!isUnlocked}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
              isUnlocked
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed opacity-60'
            }`}
          >
            {isUnlocked ? 'Confirm & Disable' : 'Locked (Wait & Match)'}
          </button>
        </div>
      </div>
    </div>
  );
}
