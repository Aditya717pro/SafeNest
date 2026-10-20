import React, { useState, useEffect } from 'react';
import {
  Shield, Check, Plus, Trash2, Save,
  AlertTriangle, Lock, Eye, Search, Sparkles
} from 'lucide-react';
import { settingsService } from '../services/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    enabled: true,
    customWhitelist: [],
    customBlacklist: [],
    strictSafeSearch: true,
    blockExplicitImages: true,
    challengeRequired: false
  });
  const [newWhitelistDomain, setNewWhitelistDomain] = useState('');
  const [newBlacklistDomain, setNewBlacklistDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await settingsService.getSettings();
      if (res.settings) {
        setSettings(res.settings);
      }
    } catch (err) {
      console.warn('Load settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (updated = settings) => {
    setSaving(true);
    setFeedback('');
    try {
      const res = await settingsService.updateSettings(updated);
      if (res.settings) {
        setSettings(res.settings);
        setFeedback('Settings updated and synced successfully!');
        setTimeout(() => setFeedback(''), 3000);
      }
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const addWhitelist = (e) => {
    e.preventDefault();
    const d = newWhitelistDomain.trim().toLowerCase().replace(/^https?:\/\//i, '');
    if (!d) return;
    if (!settings.customWhitelist.includes(d)) {
      const updated = { ...settings, customWhitelist: [...settings.customWhitelist, d] };
      setSettings(updated);
      handleSave(updated);
    }
    setNewWhitelistDomain('');
  };

  const removeWhitelist = (domain) => {
    const updated = {
      ...settings,
      customWhitelist: settings.customWhitelist.filter(d => d !== domain)
    };
    setSettings(updated);
    handleSave(updated);
  };

  const addBlacklist = (e) => {
    e.preventDefault();
    const d = newBlacklistDomain.trim().toLowerCase().replace(/^https?:\/\//i, '');
    if (!d) return;
    if (!settings.customBlacklist.includes(d)) {
      const updated = { ...settings, customBlacklist: [...settings.customBlacklist, d] };
      setSettings(updated);
      handleSave(updated);
    }
    setNewBlacklistDomain('');
  };

  const removeBlacklist = (domain) => {
    const updated = {
      ...settings,
      customBlacklist: settings.customBlacklist.filter(d => d !== domain)
    };
    setSettings(updated);
    handleSave(updated);
  };

  const toggleSetting = (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    handleSave(updated);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-sky-950 tracking-tight flex items-center gap-2">
            <span>Protection Rules &amp; Security</span>
            <Sparkles className="w-5 h-5 text-sky-500" />
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure exception rules, safe search enforcement, and anti-relapse challenge settings.
          </p>
        </div>

        {feedback && (
          <div className="px-4 py-2 rounded-xl bg-sky-100 border border-sky-300 text-sky-700 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {/* Security & Enforcement Policies */}
      <div className="glass-card p-6 border-sky-100 space-y-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Core Protection Policies
        </h2>

        {/* SafeSearch Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-sky-50 border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 border border-sky-200 flex items-center justify-center text-sky-600">
              <Search className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800 block">Strict SafeSearch Enforcement</span>
              <span className="text-xs text-slate-500">Locks Google, Bing, DuckDuckGo to strict safe mode and enforces YouTube Restricted Mode.</span>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('strictSafeSearch')}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              settings.strictSafeSearch ? 'bg-sky-500' : 'bg-slate-300'
            }`}
          >
            <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              settings.strictSafeSearch ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        {/* AI Image Blur Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-sky-50 border border-sky-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-600">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800 block">On-Device AI NSFW Image Blurring</span>
              <span className="text-xs text-slate-500">Locally inspects images using NSFW.js MobileNetV2 and locks explicit pictures behind a blur shield.</span>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('blockExplicitImages')}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              settings.blockExplicitImages ? 'bg-blue-500' : 'bg-slate-300'
            }`}
          >
            <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              settings.blockExplicitImages ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>

        {/* 60s Challenge Anti-Relapse Toggle */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-sky-50 border border-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold text-slate-800 block">Anti-Relapse Challenge Lock (60-sec Cooldown)</span>
              <span className="text-xs text-amber-600">Requires an unskippable 60-second cooldown timer + typing a commitment pledge before protection can be disabled.</span>
            </div>
          </div>
          <button
            onClick={() => toggleSetting('challengeRequired')}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              settings.challengeRequired ? 'bg-amber-500' : 'bg-slate-300'
            }`}
          >
            <span className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
              settings.challengeRequired ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Whitelist and Blacklist Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Whitelist Card */}
        <div className="glass-card p-6 border-sky-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-sky-600">Custom Whitelist</h3>
                <p className="text-xs text-slate-500">Domains that will always bypass filtering</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">
                {settings.customWhitelist.length}
              </span>
            </div>

            <form onSubmit={addWhitelist} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newWhitelistDomain}
                onChange={(e) => setNewWhitelistDomain(e.target.value)}
                placeholder="e.g. reddit.com"
                className="flex-1 bg-white border border-sky-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {settings.customWhitelist.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No custom whitelisted domains</p>
              ) : (
                settings.customWhitelist.map((domain) => (
                  <div key={domain} className="flex items-center justify-between p-2 rounded-lg bg-sky-50 border border-sky-100 text-xs text-slate-700">
                    <span>{domain}</span>
                    <button onClick={() => removeWhitelist(domain)} className="text-slate-400 hover:text-rose-600 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Blacklist Card */}
        <div className="glass-card p-6 border-sky-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-rose-600">Custom Blacklist</h3>
                <p className="text-xs text-slate-500">Additional domains to always block</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                {settings.customBlacklist.length}
              </span>
            </div>

            <form onSubmit={addBlacklist} className="flex gap-2 mb-4">
              <input
                type="text"
                value={newBlacklistDomain}
                onChange={(e) => setNewBlacklistDomain(e.target.value)}
                placeholder="e.g. distraction.com"
                className="flex-1 bg-white border border-sky-200 rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </form>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {settings.customBlacklist.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-4">No custom blacklisted domains</p>
              ) : (
                settings.customBlacklist.map((domain) => (
                  <div key={domain} className="flex items-center justify-between p-2 rounded-lg bg-sky-50 border border-sky-100 text-xs text-slate-700">
                    <span>{domain}</span>
                    <button onClick={() => removeBlacklist(domain)} className="text-slate-400 hover:text-rose-600 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
