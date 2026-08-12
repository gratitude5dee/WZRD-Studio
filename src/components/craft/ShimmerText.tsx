import './craft.css';

/**
 * Label with a moving specular highlight — for active/working states.
 * The gradient sweeps between the accent and a lighter ink of it.
 */
export function ShimmerText({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`craft-motion bg-clip-text font-medium text-transparent ${className}`}
      style={{
        backgroundImage:
          'linear-gradient(90deg, hsl(var(--text-secondary)) 35%, hsl(var(--text-primary)) 50%, hsl(var(--text-secondary)) 65%)',
        backgroundSize: '200% 100%',
        animation: 'craft-shimmer-text 1.4s linear infinite',
      }}
    >
      {children}
    </span>
  );
}
