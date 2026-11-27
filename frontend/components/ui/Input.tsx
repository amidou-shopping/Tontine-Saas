'use client';

import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  aide?: string;
  erreur?: string;
}

export default function Input({ label, aide, erreur, className = '', id, ...props }: InputProps) {
  const identifiantGenere = useId();
  const identifiant = id ?? identifiantGenere;
  const descriptionId = `${identifiant}-description`;
  const message = erreur ?? aide;

  return (
    <div>
      <label htmlFor={identifiant} className="block text-body font-medium text-ink">
        {label}
      </label>
      <input
        id={identifiant}
        className={`mt-2 h-control w-full rounded-control border bg-surface px-4 text-body text-ink placeholder:text-muted focus-ring ${
          erreur ? 'border-danger' : 'border-line-strong'
        } ${className}`}
        aria-invalid={erreur ? true : undefined}
        aria-describedby={message ? descriptionId : undefined}
        {...props}
      />
      {message && (
        <p
          id={descriptionId}
          className={`mt-2 text-meta ${erreur ? 'text-danger' : 'text-muted-canvas'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
