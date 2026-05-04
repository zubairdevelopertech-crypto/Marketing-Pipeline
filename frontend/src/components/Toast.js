export default function Toast({ toasts }) {
  const icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span style={{ fontSize: '14px' }}>{icons[t.type] || icons.info}</span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
