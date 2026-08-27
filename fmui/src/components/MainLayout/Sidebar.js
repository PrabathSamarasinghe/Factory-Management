import { useState } from 'react';
import Button from '../Button';
import locals from '../../utils/locals';
import { Link } from 'react-router-dom';

// 1. Create a self-contained component for items with dropdowns
const SidebarDropdown = ({ item }) => {
    // This state is isolated and only exists if the item has sub-items
    const [isOpen, setIsOpen] = useState(false); 

    return (
        <div className="flex flex-col">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white transition-colors w-full text-left"
            >
                <div className="flex items-center">
                    {item.icon}
                    {item.title}
                </div>
                <svg 
                    className={`w-3 h-3 text-slate-500 transform transition-transform ${isOpen ? 'rotate-180' : 'rotate-0'}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            
            {isOpen && (
                <div className="bg-slate-700/50 py-1 flex flex-col">
                    {item.subItems.map((subItem, subIndex) => (
                        <Link key={subIndex} to={subItem.path} className="flex items-center px-4 py-2 hover:text-white pl-8 transition-colors">
                            <span className="w-1.5 h-1.5 border-2 border-slate-500 rounded-full mr-3"></span>
                            {subItem.title}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
};

// 2. Your main Sidebar component stays clean
const Sidebar = ({ sidebarItems }) => {
    return (
        <aside className="w-64 h-screen bg-slate-800 text-slate-300 flex flex-col overflow-y-auto">
            {/* Brand Header */}
            <div className="h-14 flex items-center px-4 bg-slate-700 text-white text-xl font-bold tracking-wide shrink-0">
                Galatura Finance
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 py-4 flex flex-col text-sm">
                {sidebarItems.map((item, index) => (
                    item.subItems ? (
                        // Dynamically instantiates state only for items with sub-items
                        <SidebarDropdown key={index} item={item} />
                    ) : (
                        <Link key={index} to={item.path} className="flex items-center px-4 py-3 hover:bg-slate-700 hover:text-white transition-colors">
                            {item.icon}
                            {item.title}
                        </Link>
                    )
                ))}

                <div className="items-center justify-center mt-auto mb-4">
                    <Button
                        name={locals.Logout}
                        onClick={() => {
                            sessionStorage.removeItem('token');
                            window.location.href = '/login';
                        }}
                        btncss={"bg-none text-white font-semibold py-2 px-4 rounded-none hover:bg-slate-700 hover:text-white transition-colors"}
                    />
                </div>
            </nav>
        </aside>
    );
}

export default Sidebar;