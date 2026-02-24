import React from 'react';

export default function RegisterFlowAnimation() {
  const baseBlue = "#0052FF";

  return (
    <div className="w-full max-w-3xl mx-auto my-8 overflow-hidden rounded-xl bg-[#0a0a0a] border border-gray-800 p-4 shadow-2xl">
      <svg
        viewBox="0 0 800 220"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <style>
          {`
            .rf-step { opacity: 0; animation: fade-in 8s infinite; }
            .rf-step-1 { animation-delay: 0.5s; opacity: 1; } /* Always faintly visible */
            .rf-step-2 { animation-delay: 2s; }
            .rf-step-3 { animation-delay: 4.5s; }
            
            .rf-arrow-path {
              stroke-dasharray: 100;
              stroke-dashoffset: 100;
              animation: draw-arrow 8s infinite;
            }
            .rf-arrow-1 { animation-delay: 1.2s; }
            .rf-arrow-2 { animation-delay: 3.5s; }
            
            .rf-envelope {
              opacity: 0;
              animation: fly-envelope 8s infinite;
              animation-delay: 5s;
            }

            .rf-bracket {
              stroke-dasharray: 400;
              stroke-dashoffset: 400;
              animation: draw-bracket 8s infinite forwards;
            }
            .rf-b-1 { animation-delay: 0.2s; }
            .rf-b-2 { animation-delay: 4s; }

            @keyframes fade-in {
              0%, 10% { opacity: 0; transform: translateY(10px); }
              15%, 85% { opacity: 1; transform: translateY(0); }
              95%, 100% { opacity: 0; transform: translateY(-10px); }
            }

            @keyframes draw-arrow {
              0%, 10% { stroke-dashoffset: 100; }
              20%, 85% { stroke-dashoffset: 0; }
              95%, 100% { stroke-dashoffset: -100; }
            }

            @keyframes draw-bracket {
              0% { stroke-dashoffset: 400; opacity: 0; }
              10%, 85% { stroke-dashoffset: 0; opacity: 0.5; }
              90%, 100% { stroke-dashoffset: 0; opacity: 0; }
            }

            @keyframes fly-envelope {
              0% { opacity: 0; transform: translate(0, 0) scale(0.8); }
              10% { opacity: 1; transform: translate(20px, 0) scale(1); }
              70% { opacity: 1; transform: translate(120px, 0) scale(1.05); }
              85% { opacity: 0; transform: translate(180px, -20px) scale(0.5); }
              100% { opacity: 0; }
            }
            .rf-text { font-family: monospace; fill: #888; font-size: 13px; text-anchor: middle; }
            .rf-title { font-family: sans-serif; fill: white; font-size: 14px; font-weight: bold; text-anchor: middle; }
            .bg-shape { fill: #111; stroke: #333; stroke-width: 1; rx: 12; }
          `}
        </style>

        {/* Brackets */}
        <path d="M 60,35 L 60,20 L 420,20 L 420,35" fill="none" stroke={baseBlue} strokeWidth="2" className="rf-bracket rf-b-1" filter="url(#glow-blue)" />
        <text x="240" y="12" fill={baseBlue} fontSize="14" fontWeight="bold" textAnchor="middle" className="rf-step rf-step-1" filter="url(#glow-blue)">2 Calls: Register</text>

        <path d="M 520,35 L 520,20 L 680,20 L 680,35" fill="none" stroke={baseBlue} strokeWidth="2" className="rf-bracket rf-b-2" filter="url(#glow-blue)" />
        <text x="600" y="12" fill={baseBlue} fontSize="14" fontWeight="bold" textAnchor="middle" className="rf-step rf-step-3" filter="url(#glow-blue)">1 Call: Send</text>


        {/* Step 1: Wallet */}
        <g transform="translate(60, 60)" className="rf-step rf-step-1">
          <rect x="0" y="0" width="100" height="100" className="bg-shape" />
          {/* Wallet Icon */}
          <path d="M 25,35 h 50 c 5,0 10,5 10,10 v 25 c 0,5 -5,10 -10,10 h -50 c -5,0 -10,-5 -10,-10 v -25 c 0,-5 5,-10 10,-10 z M 75,55 a 5,5 0 1 1 0,10 a 5,5 0 1 1 0,-10" fill="none" stroke={baseBlue} strokeWidth="3" filter="url(#glow-blue)" />
          <text x="50" y="120" className="rf-title">Wallet</text>
          <text x="50" y="140" className="rf-text">POST /auth/start</text>
        </g>

        {/* Arrow 1 */}
        <g transform="translate(180, 110)">
          <path d="M 0,0 L 60,0" fill="none" stroke="#444" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 0,0 L 60,0" fill="none" stroke={baseBlue} strokeWidth="3" className="rf-arrow-path rf-arrow-1" filter="url(#glow-blue)" />
          <polygon points="65,0 55,-5 55,5" fill={baseBlue} className="rf-step rf-step-2" filter="url(#glow-blue)" />
        </g>

        {/* Step 2: Sign / Register */}
        <g transform="translate(260, 60)" className="rf-step rf-step-2">
          <rect x="0" y="0" width="160" height="100" className="bg-shape" />
          {/* Key/Signature Icon */}
          <path d="M 60,35 a 15,15 0 1 0 0,30 a 15,15 0 0 0 0,-30 z M 73,50 l 25,0 l 0,10 l -10,0 l 0,-10" fill="none" stroke={baseBlue} strokeWidth="3" filter="url(#glow-blue)" />
          <text x="80" y="120" className="rf-title">Sign + Register</text>
          <text x="80" y="140" className="rf-text">POST /agent-register</text>
        </g>

        {/* Arrow 2 */}
        <g transform="translate(440, 110)">
          <path d="M 0,0 L 60,0" fill="none" stroke="#444" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 0,0 L 60,0" fill="none" stroke={baseBlue} strokeWidth="3" className="rf-arrow-path rf-arrow-2" filter="url(#glow-blue)" />
          <polygon points="65,0 55,-5 55,5" fill={baseBlue} className="rf-step rf-step-3" filter="url(#glow-blue)" />
        </g>

        {/* Step 3: Identity & Send */}
        <g transform="translate(520, 60)" className="rf-step rf-step-3">
          <rect x="0" y="0" width="160" height="100" className="bg-shape" />
          {/* Email/At Icon */}
          <path d="M 80,50 a 15,15 0 1 0 -15,15 h 15 v -25" fill="none" stroke="#fff" strokeWidth="3" />
          <path d="M 95,50 a 30,30 0 1 1 -30,-30 c 15,0 30,10 30,30" fill="none" stroke={baseBlue} strokeWidth="3" filter="url(#glow-blue)" />
          <text x="80" y="120" className="rf-title">@basemail.ai</text>
          <text x="80" y="140" className="rf-text">POST /send</text>
        </g>

        {/* Flying Envelope */}
        <g transform="translate(580, 85)" className="rf-envelope">
          <path d="M 0,0 h 40 v 25 h -40 z L 20,15 L 40,0" fill="#111" stroke={baseBlue} strokeWidth="2" filter="url(#glow-blue)" />
          {/* Motion trails */}
          <path d="M -10,5 h -20 M -5,20 h -15" fill="none" stroke={baseBlue} strokeWidth="2" opacity="0.6" />
        </g>

      </svg>
    </div>
  );
}