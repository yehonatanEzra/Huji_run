import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const athleteItems = [
  { to: '/home', label: 'Home', icon: '🎟️' },
  { to: '/calendar', label: 'Training', icon: '🏋️' },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

const coachItems = [
  { to: '/coach/dashboard', label: 'Tracking', icon: '📊' },
  { to: '/coach/workouts', label: 'Coach', icon: '📋' },
  { to: '/feed', label: 'Feed', icon: '📢' },
  { to: '/races', label: 'Races', icon: '🏆' },
  { to: '/hall-of-fame', label: 'Hall of Fame', icon: '🥇' },
  { to: '/health-wellness', label: 'Health', icon: '🏥' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export default function BottomNav() {
  const { user } = useAuth();
  const items = user?.role === 'coach' ? coachItems : athleteItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex overflow-x-auto scrollbar-hide items-center h-16 px-1">
        {items.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs transition-colors flex-shrink-0 min-w-[64px] px-1 ${
                isActive ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`
            }
          >
            <span className="text-xl">{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
