import React, { useState, useEffect } from 'react';
import {
  Shield, Globe, MessageSquare, Image as ImageIcon,
  CheckCircle, AlertCircle, RefreshCw, Lock, Sparkles
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import StatsCard from '../components/StatsCard';
import ChallengeModal from '../components/ChallengeModal';
import { settingsService, statsService } from '../services/api';

export default function Dashboard() {
  const [settings, setSettings] = useState({
    enabled: true,
    customWhitelist: [],
    customBlacklist: [],
    challengeRequired: false
  });
  const [weeklyStats, setWeeklyStats] = useState([]);
  const [totals, setTotals] = useState({ blockedSites: 0, maskedWords: 0, blurredImages: 0 });
  const [loading, setLoading] = useState(true);
  const [isChallengeOpen, setIsChallengeOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, statsRes] = await Promise.allSettled([
        settingsService.getSettings(),
        statsService.getWeeklyStats()
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value.settings) {
        setSettings(settingsRes.value.settings);
      }
      if (statsRes.status === 'fulfilled' && statsRes.value.weekly) {
        setWeeklyStats(statsRes.value.weekly);
        setTotals(statsRes.value.totals || { blockedSites: 0, maskedWords: 0, blurredImages: 0 });
      }
    } catch (err) {
      console.warn('Dashboard load note:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleToggleClick = async () => {
    if (settings.enabled && settings.challengeRequired) {
      // Must pass 60-second challenge before disabling
      setIsChallengeOpen(true);
    } else {
      await updateProtection(!settings.enabled);
    }
  };

  const updateProtection = async (newEnabled) => {
    try {
      const res = await settingsService.updateSettings({ enabled: newEnabled });
      if (res.settings) {
        setSettings(res.settings);
        setStatusFeedback(newEnabled ? 'Protection Activated' : 'Protection Paused');
        setTimeout(() => setStatusFeedback(''), 3000);
      }
    } catch (err) {
      alert('Failed to update protection: ' + err.message);
    }
  };

  const handleChallengeSuccess = async () => {
    setIsChallengeOpen(false);
    await updateProtection(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Hero Protection Status Banner */}
      <div className="glass-card p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden border-sky-200">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
            settings.enabled
              ? 'bg-sky-100 border border-sky-300 text-sky-600 shadow-xl shadow-sky-500/20'
              : 'bg-slate-100 border border-slate-200 text-slate-500'
          }`}>
            <Shield className="w-8 h-8" />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl sm:text-2xl font-black text-sky-950 tracking-tight">
                {settings.enabled ? 'SafeSurf Protection Active' : 'Protection Paused'}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                settings.enabled
                  ? 'bg-sky-100 text-sky-700 border-sky-300'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}>
                {settings.enabled ? 'SHIELD ON' : 'PAUSED'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {settings.enabled
                ? '988k+ adult domains intercepted, SafeSearch forced, profanity masked, and NSFW images blurred.'
                : 'All filtering layers are temporarily paused.'}
            </p>
          </div>
        </div>

        {/* Master Toggle Button */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          {statusFeedback && (
            <span className="text-xs font-semibold text-sky-600 animate-pulse">
              {statusFeedback}
            </span>
          )}
          <button
            onClick={handleToggleClick}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
              settings.enabled
                ? 'bg-white hover:bg-sky-50 text-slate-700 border border-sky-200'
                : 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/25'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>{settings.enabled ? 'Pause Protection' : 'Turn Protection ON'}</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Adult Sites Blocked"
          value={totals.blockedSites}
          subtitle="Intercepted before navigation"
          icon={Globe}
          color="rose"
        />
        <StatsCard
          title="Profane Words Masked"
          value={totals.maskedWords}
          subtitle="Cuss words filtered with ***"
          icon={MessageSquare}
          color="amber"
        />
        <StatsCard
          title="NSFW Images Blurred"
          value={totals.blurredImages}
          subtitle="On-device AI classification"
          icon={ImageIcon}
          color="sky"
        />
        <StatsCard
          title="Threat Database Size"
          value="988911"
          subtitle="StevenBlack &amp; BlockListProject"
          icon={Shield}
          color="blue"
        />
      </div>

      {/* Weekly Analytics Chart */}
      <div className="glass-card p-6 border-sky-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-base font-bold text-sky-950 flex items-center gap-2">
              <span>Weekly Protection Telemetry</span>
              <Sparkles className="w-4 h-4 text-sky-500" />
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Daily breakdown of intercepted content across past 7 days</p>
          </div>
          <button
            onClick={loadData}
            title="Refresh statistics"
            className="p-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-slate-500 hover:text-sky-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSites" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorImages" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="day" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderColor: 'rgba(14, 165, 233, 0.35)',
                  borderRadius: '10px',
                  fontSize: '12px',
                  color: '#0f172a'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
              <Area type="monotone" dataKey="blockedSites" name="Blocked Sites" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorSites)" />
              <Area type="monotone" dataKey="maskedWords" name="Masked Words" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorWords)" />
              <Area type="monotone" dataKey="blurredImages" name="Blurred Images" stroke="#0ea5e9" strokeWidth={2} fillOpacity={1} fill="url(#colorImages)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Anti-Relapse 60s Challenge Modal */}
      <ChallengeModal
        isOpen={isChallengeOpen}
        onClose={() => setIsChallengeOpen(false)}
        onConfirm={handleChallengeSuccess}
      />
    </div>
  );
}
