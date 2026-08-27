import React from 'react';

const TopBar = () => {
    return (
        <header className="h-14 bg-slate-700 flex items-center justify-end px-4 text-white shadow-md w-full">

            {/* Right side - User & Notifications */}
            <div className="flex items-center gap-4">
                {/* Notifications */}
                {/* <button className="relative text-slate-300 hover:text-white transition-colors p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-orange-500 rounded-sm transform translate-x-1 -translate-y-1">
                        1
                    </span>
                </button> */}

                {/* User Dropdown */}
                <button className="flex items-center gap-2 hover:bg-slate-600 px-2 py-1 rounded transition-colors">
                    <img 
                        src="https://i.pravatar.cc/150?img=11" 
                        alt="User" 
                        className="h-8 w-8 rounded-full border border-slate-500"
                    />
                    <span className="text-sm font-medium text-slate-200">John Dsouza</span>
                </button>

                {/* Settings */}
                {/* <button className="text-slate-300 hover:text-white transition-colors p-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button> */}
            </div>
        </header>
    );
}

export default TopBar;