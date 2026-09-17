export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: 'text' | 'rect' | 'circle';
  className?: string;
}

/** Loading placeholder (frontend-pattern.md §9.4: text 44/45%, rect blocks). Pure CSS pulse,
 * no animation library. */
export function Skeleton({ width = '100%', height = 16, variant = 'text', className = '' }: SkeletonProps) {
  const radius = variant === 'circle' ? 'rounded-full' : variant === 'rect' ? 'rounded-md' : 'rounded';
  return (
    <span
      className={`inline-block animate-pulse bg-gray-200 ${radius} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonRowsProps {
  rows?: number;
  columns?: number;
}

/** Composed skeleton for a table body while a list is loading. */
export function SkeletonRows({ rows = 5, columns = 4 }: SkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-3 py-2">
              <Skeleton height={12} width={c === 0 ? '60%' : '80%'} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default Skeleton;
