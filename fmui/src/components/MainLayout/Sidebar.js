import { useState, useEffect } from 'react';
import Button from '../Button';
import locals from '../../utils/locals';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const SidebarDropdown = ({ item, currentPath }) => {
    // Check if any sub-item matches current route
    const isChildActive = item.subItems?.some(subItem => subItem.path === currentPath);
    const [isOpen, setIsOpen] = useState(isChildActive);

    // Auto-open if navigating to a child item
    useEffect(() => {
        if (isChildActive) {
            setIsOpen(true);
        }
    }, [isChildActive]);

    return (
        <div className="flex flex-col">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-between px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors w-full text-left font-medium ${
                    isChildActive ? 'bg-slate-900/80 text-white font-semibold' : ''
                }`}
            >
                <div className="flex items-center">
                    {item.icon}
                    <span>{item.title}</span>
                </div>
                <svg 
                    className={`w-3.5 h-3.5 text-slate-400 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {isOpen && (
                <div className="bg-slate-900/50 py-1 flex flex-col border-l-2 border-slate-600 ml-4 my-1">
                    {item.subItems.map((subItem, subIndex) => {
                        const isActive = currentPath === subItem.path;
                        return (
                            <Link 
                                key={subIndex} 
                                to={subItem.path} 
                                className={`flex items-center px-4 py-2 text-sm transition-colors ${
                                    isActive 
                                        ? 'bg-slate-700/80 text-white font-medium pl-6 border-l-2 border-red-500 -ml-[2px]' 
                                        : 'text-slate-400 hover:text-white hover:bg-slate-800/40 pl-6'
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full mr-2.5 ${isActive ? 'bg-red-400' : 'bg-slate-500'}`}></span>
                                {subItem.title}
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const Sidebar = ({ sidebarItems }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    const handleLogout = () => {
        sessionStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <aside className="w-64 h-screen bg-slate-800 text-slate-300 flex flex-col overflow-y-auto sidebar-scrollbar border-r border-slate-700 shadow-xl shrink-0">
            {/* Brand Header */}
            <div className="h-14 flex items-center px-5 bg-slate-700 text-white text-lg font-bold tracking-wider shrink-0 gap-2 shadow-sm border-b border-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-red-400/40"></span>
                <span>Galatura Finance</span>
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 py-3 flex flex-col text-sm space-y-0.5">
                {sidebarItems.map((item, index) => {
                    if (item.subItems) {
                        return <SidebarDropdown key={index} item={item} currentPath={currentPath} />;
                    }
                    const isActive = currentPath === item.path;
                    return (
                        <Link 
                            key={index} 
                            to={item.path} 
                            className={`flex items-center px-4 py-3 transition-colors ${
                                isActive 
                                    ? 'bg-slate-700 text-white font-semibold border-l-4 border-red-500' 
                                    : 'text-slate-300 hover:bg-slate-700/60 hover:text-white'
                            }`}
                        >
                            {item.icon}
                            <span>{item.title}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom Logout */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/80 mt-auto shrink-0">
                <Button
                    name={locals.Logout}
                    onClick={handleLogout}
                    btncss={"bg-slate-700 hover:bg-red-700 text-slate-200 hover:text-white font-medium py-2.5 px-4 rounded-lg transition-colors w-full flex items-center justify-center gap-2"}
                />
            </div>
        </aside>
    );
};

export default Sidebar;