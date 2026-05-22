import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useAuth } from '../../contexts/AuthContext';

export default function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-dvh">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold tracking-tight">Huji Run</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="opacity-80">{user?.full_name}</span>
          <button onClick={logout} className="underline opacity-70 hover:opacity-100">
            Logout
          </button>
        </div>
      </header>
      <main className="flex-1 pb-20 px-4 py-4 max-w-2xl mx-auto w-full">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
