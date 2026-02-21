/* ─── Lens Protocol Badge ─── */
export default function LensBadge({ handle, loading }: { handle?: string; loading?: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-[#00501e]/20 text-[#abfe2c] border border-[#abfe2c]/20 animate-pulse">
        <LensLogo size={14} />
        checking…
      </span>
    );
  }

  if (!handle) return null;

  return (
    <a
      href={`https://hey.xyz/u/${handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-[#00501e]/30 text-[#abfe2c] border border-[#abfe2c]/30 hover:bg-[#00501e]/50 transition"
    >
      <LensLogo size={14} />
      {handle}.lens
    </a>
  );
}

/* Lens logo as inline SVG */
function LensLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M100 0C155.228 0 200 44.7715 200 100C200 155.228 155.228 200 100 200C44.7715 200 0 155.228 0 100C0 44.7715 44.7715 0 100 0Z"
        fill="#ABFE2C"
      />
      <path
        d="M100 30C67.5 30 42 58 42 93C42 104 45 114 50 123C54 130 50 138 44 142C52 144 62 142 70 137C72 136 74 135 76 135C78 135 80 135 82 136C87 138 93 139 100 139C132.5 139 158 111 158 76C158 58 142 30 100 30Z"
        fill="#00501E"
      />
    </svg>
  );
}
