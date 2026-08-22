// A row of subgroup chips for the athlete-targeting pickers. A chip is "active"
// when ALL its members are currently selected; clicking toggles that subgroup's
// members in/out of the selection (union semantics — individuals and multiple
// subgroups combine). The parent owns the selection state and adapts its shape
// via isSelected/onToggleMany.
//
// Props:
//   subgroups:    [{ id, name, member_ids: [athleteId] }]
//   isSelected:   (athleteId) => bool
//   onToggleMany: (athleteIds, select) => void   // add all if select, else remove all
export default function SubgroupChips({ subgroups, isSelected, onToggleMany }) {
  if (!subgroups || subgroups.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {subgroups.map((sg) => {
        const ids = sg.member_ids || [];
        const active = ids.length > 0 && ids.every((id) => isSelected(id));
        return (
          <button
            key={sg.id}
            type="button"
            onClick={() => onToggleMany(ids, !active)}
            disabled={ids.length === 0}
            title={ids.length === 0 ? 'No athletes in this subgroup' : undefined}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition disabled:opacity-40 ${
              active
                ? 'bg-teal-400 text-teal-950 border-transparent'
                : 'bg-teal-400/15 border-teal-400/40 text-teal-100 hover:bg-teal-400/25 hover:border-teal-400/60'
            }`}
          >
            {sg.name} <span className="opacity-70">· {ids.length}</span>
          </button>
        );
      })}
    </div>
  );
}
