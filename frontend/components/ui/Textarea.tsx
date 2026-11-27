'use client';

import { useId, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  aide?: string;
}

export default function Textarea({ label, aide, className = '', id, ...props }: TextareaProps) {
  const identifiantGenere = useId();
  const identifiant = id ?? identifiantGenere;

  return (
    <div>
      <label htmlFor={identifiant} className="block text-body font-medium text-ink">
        {label}
      </label>
      <textarea
        id={identifiant}
        className={`mt-2 w-full rounded-control border border-line-strong bg-surface px-4 py-3 text-body text-ink placeholder:text-muted focus-ring ${className}`}
        aria-describedby={aide ? `${identifiant}-aide` : undefined}
        {...props}
      />
      {aide && (
        <p id={`${identifiant}-aide`} className="mt-2 text-meta text-muted-canvas">
          {aide}
        </p>
      )}
    </div>
  );
}
