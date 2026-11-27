interface ProgressBarProps {
  libelle: string;
  value: number;
  detail?: string;
}

export default function ProgressBar({ libelle, value, detail }: ProgressBarProps) {
  const pourcentage = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-meta">
        <span>{libelle}</span>
        <span className="tabular-nums font-semibold">{detail ?? `${pourcentage} %`}</span>
      </div>
      <div
        className="mt-2 h-2 w-full rounded-pill bg-rest"
        role="progressbar"
        aria-label={libelle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcentage}
        aria-valuetext={detail}
      >
        <div
          className="h-2 rounded-pill bg-black"
          style={{ width: `${pourcentage}%` }}
        />
      </div>
    </div>
  );
}
