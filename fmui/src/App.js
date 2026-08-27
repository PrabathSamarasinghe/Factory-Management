import './index.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import Login from './pages/Login';
import Trip from './pages/trip/Trip';
import Users from './pages/user_management/Users';
import Dashboard from './pages/Dashboard';

import MainLayout from './layouts/MainLayout'; // Fixed typo in filename if needed
import NotFound from './pages/NotFound';
import CreateTrip from './pages/trip/CreateTrip';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes (No Layout) */}
        <Route path="/login" element={<Login />} />

        {/* Protected/Dashboard Routes (With Layout) */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trip" element={<Trip />} />
          <Route path="/trip/create" element={<CreateTrip />} />
          <Route path="/users/:userType" element={<Users />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;