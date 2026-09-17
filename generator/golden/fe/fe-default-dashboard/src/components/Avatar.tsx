export interface AvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<string, string> = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10' };

/** Ports .avatar / .avatar.sm / .avatar.lg. */
export function Avatar({ src, name, size = 'md' }: AvatarProps) {
  const initials = (name ?? '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return src ? (
    <img
      src={src}
      alt={name ?? 'avatar'}
      className={`rounded-full border border-border bg-gray-100 object-cover ${SIZE_CLASS[size]}`}
    />
  ) : (
    <span
      className={`grid place-items-center rounded-full border border-border bg-gray-100 text-[10px] font-semibold text-text-secondary ${SIZE_CLASS[size]}`}
    >
      {initials}
    </span>
  );
}

export default Avatar;
