import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Shield, BarChart3, Settings, LogOut, User } from 'lucide-react';

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem('safesurf_token');
    localStorage.removeItem('safesurf_user');
    if (onLogout) onLogout();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="border-b border-sky-100 bg-white/90 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 border border-sky-300 flex items-center justify-center text-sky-600 shadow-lg shadow-sky-500/10">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-sky-950 flex items-center gap-2">
              SafeSurf <span className="text-xs px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 font-semibold border border-sky-300">Suite</span>
            </span>
            <span className="text-xs text-slate-500 block -mt-1 font-medium">Content Shield &amp; Analytics</span>
          </div>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive('/')
                ? 'bg-sky-100 text-sky-700 border border-sky-300'
                : 'text-slate-500 hover:text-sky-700 hover:bg-sky-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Analytics</span>
          </Link>

          <Link
            to="/settings"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive('/settings')
                ? 'bg-sky-100 text-sky-700 border border-sky-300'
                : 'text-slate-500 hover:text-sky-700 hover:bg-sky-50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Settings &amp; Rules</span>
          </Link>
        </div>

        {/* User Info & Logout */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-50 border border-sky-100 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>{user.email}</span>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Log out"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}
