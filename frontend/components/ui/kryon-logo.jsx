export function KryonLogo({ size = 120 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="red1" cx="60%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#ff2020" />
          <stop offset="100%" stopColor="#8b0000" />
        </radialGradient>
        <radialGradient id="silver1" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#e0e0e0" />
          <stop offset="100%" stopColor="#6b6b6b" />
        </radialGradient>
        <radialGradient id="red2" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#e01010" />
          <stop offset="100%" stopColor="#700000" />
        </radialGradient>
        <radialGradient id="silver2" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#d0d0d0" />
          <stop offset="100%" stopColor="#555" />
        </radialGradient>
      </defs>
      <path d="M100 100 L72 30 Q100 10 128 30 Z" fill="url(#red1)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L128 30 Q162 55 170 72 Z" fill="url(#silver1)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L170 72 Q190 100 170 128 Z" fill="url(#red2)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L170 128 Q162 145 128 170 Z" fill="url(#silver2)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L128 170 Q100 190 72 170 Z" fill="url(#red1)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L72 170 Q38 145 30 128 Z" fill="url(#silver1)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L30 128 Q10 100 30 72 Z" fill="url(#red2)" stroke="#111" strokeWidth="1.5" />
      <path d="M100 100 L30 72 Q38 55 72 30 Z" fill="url(#silver2)" stroke="#111" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="8" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
      <circle cx="100" cy="100" r="4" fill="#444" />
    </svg>
  )
}

export function KryonIcon({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 2 L24 7.5 L24 20.5 L14 26 L4 20.5 L4 7.5 Z" fill="none" stroke="#e0e0e0" strokeWidth="1.5" />
      <path d="M14 6 L22 18 L14 15 L6 18 Z" fill="#e0e0e0" />
    </svg>
  )
}
