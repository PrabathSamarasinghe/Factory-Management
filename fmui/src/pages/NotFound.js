import { Link } from 'react-router-dom';

const NotFound = () => {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="text-6xl mb-4">📚🛑</div>
            <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                Index Out of Bounds!
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2 max-w-sm">
                Sorry, we couldn’t find the page you’re looking for. It might have been moved or deleted.
            </p>
            <Link 
                to="/dashboard" 
                className="mt-6 px-4 py-2 bg-emerald-600 text-white rounded-md font-medium text-sm hover:bg-emerald-500 shadow-sm transition-all"
            >
                Return to Dashboard
            </Link>
        </div>
    );
};

export default NotFound;
