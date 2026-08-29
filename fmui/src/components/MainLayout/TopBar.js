import React, { useState, useEffect, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

const TopBar = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState({ username: 'Admin', role: 'User' });
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                setUser({
                    username: decoded.username || decoded.name || 'Admin',
                    role: decoded.role || 'Staff'
                });
            } catch (err) {
                console.error('Failed to decode token:', err);
            }
        }
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        navigate('/login');
    };

    const getInitials = (name) => {
        if (!name) return 'A';
        const parts = name.trim().split(' ');
        if (parts.length > 1) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    return (
        <header className="h-14 bg-slate-700 flex items-center justify-between px-6 text-white shadow-md w-full shrink-0">
            {/* Left side info */}
            <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-slate-300 bg-slate-800/60 px-2.5 py-1 rounded">
                    Factory Management Portal
                </span>
            </div>

            {/* Right side - User profile */}
            <div className="flex items-center gap-4 relative" ref={dropdownRef}>
                <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-3 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors focus:outline-none"
                    aria-expanded={dropdownOpen}
                >
                    <div className="h-8 w-8 rounded-full bg-slate-900 border border-slate-500 flex items-center justify-center text-xs font-bold text-slate-200 shadow-inner">
                        {getInitials(user.username)}
                    </div>
                    <div className="text-left hidden sm:block">
                        <div className="text-sm font-medium text-slate-100 leading-tight">
                            {user.username}
                        </div>
                        <div className="text-[11px] text-slate-400 capitalize">
                            {user.role}
                        </div>
                    </div>
                    <svg
                        className={`w-3.5 h-3.5 text-slate-400 transform transition-transform ${dropdownOpen ? 'rotate-180' : 'rotate-0'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Dropdown Menu */}
                {dropdownOpen && (
                    <div className="absolute right-0 top-12 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 text-slate-700">
                        <div className="px-4 py-2 border-b border-slate-100">
                            <p className="text-xs text-slate-400 uppercase font-semibold">Signed in as</p>
                            <p className="text-sm font-medium text-slate-800 truncate">{user.username}</p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                        >
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            Log Out
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};

export default TopBar;