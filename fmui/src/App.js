import './index.css';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import Login from './pages/Login';

function App() {
  return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<div>Home</div>} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </BrowserRouter>
  );
}

export default App;
