export function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className="chip" aria-pressed={active} onClick={onClick}>
      {label}
    </button>
  );
}
