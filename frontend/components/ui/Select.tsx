'use client';

import { useId, type SelectHTMLAttributes } from 'react';

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: Option[];
  aide?: string;
}

export default function Select({
  label,
  options,
  aide,
  className = '',
  id,
  ...props
}: SelectProps) {
  const identifiantGenere = useId();
  const identifiant = id ?? identifiantGenere;

  return (
    <div>
      <label htmlFor={identifiant} className="block text-body font-medium text-ink">
        {label}
      </label>
      <select
        id={identifiant}
        className={`mt-2 h-control w-full rounded-control border border-line-strong bg-surface px-4 text-body text-ink focus-ring ${className}`}
        aria-describedby={aide ? `${identifiant}-aide` : undefined}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {aide && (
        <p id={`${identifiant}-aide`} className="mt-2 text-meta text-muted-canvas">
          {aide}
        </p>
      )}
    </div>
  );
}
