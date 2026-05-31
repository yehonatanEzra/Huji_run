export default function Modal({ open, onClose, title, children, panelClassName }) {
  if (!open) return null;

  const panel = panelClassName ?? 'bg-white';
  const titleCls = panelClassName ? 'text-white' : 'text-gray-900';
  const closeCls = panelClassName ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-600';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ${panel} rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85dvh] overflow-auto p-5 pb-20 sm:pb-5`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${titleCls}`}>{title}</h2>
          <button onClick={onClose} className={`text-xl ${closeCls}`}>
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
