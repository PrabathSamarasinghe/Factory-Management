import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center p-8 font-sans">
            <div className="w-20 h-20 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-3xl font-black mb-6 shadow-xl border border-slate-700">
                404
            </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                Page Not Found
            </h1>
            <p className="text-xs text-slate-500 mt-2 max-w-sm">
                The operations module or page you requested could not be located in the factory management registry.
            </p>
            <div className="mt-6 flex items-center gap-3">
                <Link 
                    to="/" 
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-xs shadow-sm hover:shadow-md transition-all inline-flex items-center gap-2"
                >
                    <span>← Return to Command Center</span>
                </Link>
            </div>
        </div>
    );
};

export default NotFound;
