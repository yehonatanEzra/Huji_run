import { useAuth } from '../../contexts/AuthContext';
import PageBackground from '../../components/PageBackground';
import GroupProfileView from '../../components/GroupProfileView';

export default function MyGroupPage() {
  const { user } = useAuth();
  const groupId = user?.training_group_id;

  return (
    <div>
      <PageBackground src="/bg.jpg" />

      <h1 className="text-2xl font-black text-white mb-5 [text-shadow:0_2px_12px_rgba(0,0,0,0.6)]">My Group</h1>

      {groupId ? (
        <GroupProfileView groupId={groupId} />
      ) : (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-white/60">You're not part of a group yet.</p>
        </div>
      )}
    </div>
  );
}
