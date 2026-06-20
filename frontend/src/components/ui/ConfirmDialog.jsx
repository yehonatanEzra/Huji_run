// Small in-app confirmation dialog — replaces the browser's native confirm().
// Bottom-sheet on phones, centered card on larger screens.
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onClose,
  busy = false,
  danger = false,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-[#161616]/95 backdrop-blur-2xl border border-white/10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3 className="text-base font-semibold text-white mb-1">{title}</h3>}
        {message && <p className="text-sm text-white/65">{message}</p>}
        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3 rounded-xl border border-white/20 text-white/80 font-semibold hover:bg-white/10 disabled:opacity-50 transition"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-3 rounded-xl font-semibold active:scale-[0.98] disabled:opacity-50 transition ${
              danger ? 'bg-red-500/90 text-white hover:bg-red-500' : 'bg-[#c0c1ff] text-[#1000a9] hover:bg-[#d0d1ff]'
            }`}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
