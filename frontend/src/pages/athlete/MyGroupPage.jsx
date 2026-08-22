import { useAuth } from '../../contexts/AuthContext';
import PageBackground from '../../components/PageBackground';
import TeamProfileView from '../../components/TeamProfileView';

export default function MyGroupPage() {
  const { user } = useAuth();
  const teamId = user?.active_team_id;

  return (
    <div>
      <PageBackground src="/bg.jpg" />

      <h1 className="text-2xl font-black text-white mb-1 [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">My Group</h1>
      <p className="text-xs text-white/55 mb-5">
        {user?.active_team_name ? user.active_team_name : 'Your team profile'}
      </p>

      {teamId ? (
        <TeamProfileView teamId={teamId} />
      ) : (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-white/60">You're not part of a team yet.</p>
        </div>
      )}
    </div>
  );
}
