import type { ComponentPropsWithRef } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet';
  size?: 'default' | 'small';
};

/** Native semantics, including type, disabled and React 19 ref. Navigation uses links. */
export function Button({
  variant = 'secondary',
  size = 'default',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={`replay-button ${className}`}
      {...props}
    />
  );
}
