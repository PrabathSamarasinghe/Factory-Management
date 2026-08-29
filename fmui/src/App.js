import './index.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import Trip from './pages/trip/Trip';
import Users from './pages/user_management/Users';
import Dashboard from './pages/Dashboard';
import MainLayout from './layouts/MainLayout';
import NotFound from './pages/NotFound';
import CreateTrip from './pages/trip/CreateTrip';
import Lorries from './pages/fleet/Lorries';
import Routes_ from './pages/fleet/Routes';
import Attendance from './pages/attendance/Attendance';
import BoughtLeaf from './pages/bought_leaf/BoughtLeaf';
import CreateBoughtLeaf from './pages/bought_leaf/CreateBoughtLeaf';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes (No Layout) */}
        <Route path="/login" element={<Login />} />

        {/* Protected Routes (With Layout) */}
        <Route element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trip" element={<Trip />} />
          <Route path="/trip/create" element={<CreateTrip />} />
          <Route path="/users/:userType" element={<Users />} />
          <Route path="/lorries" element={<Lorries />} />
          <Route path="/routes" element={<Routes_ />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/bought-leaf" element={<BoughtLeaf />} />
          <Route path="/bought-leaf/create" element={<CreateBoughtLeaf />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      <ToastContainer 
        position="top-right" 
        autoClose={3500} 
        hideProgressBar={false} 
        newestOnTop 
        closeOnClick 
        pauseOnFocusLoss 
        pauseOnHover 
      />
    </BrowserRouter>
  );
}

export default App;