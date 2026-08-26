import './index.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import Login from './pages/Login';
import Trip from './pages/trip/Trip';
import Users from './pages/user_management/Users';
import Home from './pages/Home';

function App() {
  return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trip" element={<Trip />} />
          <Route path="/login" element={<Login />} />
          <Route path="/users/:userType" element={<Users />} />
        </Routes>
      </BrowserRouter>
  );
}

export default App;
