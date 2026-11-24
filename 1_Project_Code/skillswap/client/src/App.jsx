import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Nav from './components/Nav';
import { Empty, Loading } from './components/ui';
import Landing from './pages/Landing';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail, Welcome } from './pages/Auth';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Profile from './pages/Profile';
import MySkills from './pages/MySkills';
import Swaps from './pages/Swaps';
import SwapDetail from './pages/SwapDetail';
import Messages from './pages/Messages';
import Credits from './pages/Credits';
import Settings from './pages/Settings';
import Admin from './pages/Admin';

function Private({ children, admin }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <main className="wrap page"><Loading /></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (admin && user.role !== 'admin') return <Navigate to="/home" replace />;
  return children;
}

export default function App() {
  const { ready } = useAuth();
  if (!ready) return null;
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/u/:id" element={<Profile />} />
        <Route path="/welcome" element={<Private><Welcome /></Private>} />
        <Route path="/home" element={<Private><Home /></Private>} />
        <Route path="/my-skills" element={<Private><MySkills /></Private>} />
        <Route path="/swaps" element={<Private><Swaps /></Private>} />
        <Route path="/swaps/:id" element={<Private><SwapDetail /></Private>} />
        <Route path="/messages" element={<Private><Messages /></Private>} />
        <Route path="/messages/:id" element={<Private><Messages /></Private>} />
        <Route path="/credits" element={<Private><Credits /></Private>} />
        <Route path="/settings" element={<Private><Settings /></Private>} />
        <Route path="/admin" element={<Private admin><Admin /></Private>} />
        <Route path="*" element={<main className="wrap page"><Empty title="This page doesn’t exist">Check the address, or head back home.</Empty></main>} />
      </Routes>
    </>
  );
}
