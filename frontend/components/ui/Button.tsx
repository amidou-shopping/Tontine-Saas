import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary';

/** Classes partagées avec les <a> qui doivent avoir l'apparence d'un bouton. */
export function buttonClasses(variant: ButtonVariant = 'primary', className = '') {
  const base =
    'inline-flex min-h-control items-center justify-center gap-2 rounded-pill border px-5 text-body font-semibold focus-ring disabled:cursor-not-allowed disabled:opacity-50';
  const styles =
    variant === 'primary'
      ? 'border-black bg-black text-surface hover:bg-ink'
      : 'border-line-strong bg-surface text-ink hover:bg-canvas';
  return `${base} ${styles} ${className}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export default function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
