import Sidebar from "../components/MainLayout/Sidebar";
import TopBar from "../components/MainLayout/TopBar";
import { Outlet } from "react-router-dom"; // Add this import
import sidebarItems from "../config/config";

const MainLayout = () => { // Remove { children }
    return (
        <div className="flex h-screen bg-gray-100">
            <Sidebar sidebarItems={sidebarItems}/>
            <div className="flex-1 flex flex-col overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default MainLayout;