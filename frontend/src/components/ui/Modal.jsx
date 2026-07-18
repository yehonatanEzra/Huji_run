export default function Modal({ open, onClose, title, children, panelClassName, fullScreen, zClassName = 'z-50' }) {
  if (!open) return null;

  const panel = panelClassName ?? 'bg-white';
  const titleCls = panelClassName ? 'text-white' : 'text-gray-900';
  const closeCls = panelClassName ? 'text-white/50 hover:text-white' : 'text-gray-400 hover:text-gray-600';

  const sizeCls = fullScreen
    ? 'w-full h-dvh max-w-none rounded-none'
    : 'w-full sm:max-w-md max-h-[85dvh] rounded-t-2xl sm:rounded-2xl';
  const wrapperCls = fullScreen ? 'items-stretch' : 'items-end sm:items-center';

  return (
    <div className={`fixed inset-0 ${zClassName} flex ${wrapperCls} justify-center`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ${panel} ${sizeCls} overflow-auto p-5 pb-20 sm:pb-5`}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h2 className={`text-lg font-semibold ${titleCls}`}>{title}</h2>
          {fullScreen ? (
            <button
              onClick={onClose}
              className={`shrink-0 inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                panelClassName
                  ? 'bg-white/15 border border-white/25 text-white hover:bg-white/25'
                  : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Back
            </button>
          ) : (
            <button onClick={onClose} className={`text-xl ${closeCls}`}>
              &times;
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
