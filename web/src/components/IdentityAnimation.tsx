import React from 'react';

export default function IdentityAnimation() {
  const blue = "#0052FF";
  const amber = "#F59E0B";
  const emerald = "#10B981";
  const lime = "#84CC16";

  return (
    <div className="w-full max-w-4xl mx-auto my-8 overflow-hidden rounded-xl bg-gradient-to-r from-[#050505] to-[#0a0f1a] border border-gray-800 p-6 shadow-2xl">
      <svg
        viewBox="0 0 900 300"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
      >
        <defs>
          <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
          <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
          <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
          <filter id="glow-lime" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
        </defs>

        <style>
          {`
            .ia-glitch {
              animation: glitch 4s infinite alternate;
              transform-origin: center;
            }
            .ia-pulse-blue { animation: pulse 3s infinite alternate; }
            .ia-pulse-amber { animation: pulse 3s infinite alternate 0.5s; }
            .ia-pulse-emerald { animation: pulse 3s infinite alternate 1s; }
            .ia-pulse-lime { animation: pulse 3s infinite alternate 1.5s; }

            .ia-conn-line {
              stroke-dasharray: 15;
              animation: flow-line 20s linear infinite;
            }

            .ia-particle {
              opacity: 0;
              animation: fly-particle 3s infinite;
            }
            .ia-p-1 { animation-delay: 0s; }
            .ia-p-2 { animation-delay: 1s; }
            .ia-p-3 { animation-delay: 2s; }

            @keyframes glitch {
              0%, 80% { opacity: 0.8; transform: skewX(0deg); filter: blur(0px); }
              85% { opacity: 0.4; transform: skewX(5deg) scale(1.02); filter: blur(2px); }
              90% { opacity: 0.7; transform: skewX(-5deg) translate(2px, -2px); }
              95% { opacity: 0.3; transform: skewX(0deg) scale(0.95); }
              100% { opacity: 0.8; }
            }

            @keyframes pulse {
              0% { transform: scale(0.95); filter: brightness(0.8); }
              100% { transform: scale(1.05); filter: brightness(1.2); }
            }

            @keyframes flow-line {
              to { stroke-dashoffset: -200; }
            }

            @keyframes fly-particle {
              0% { transform: translate(180px, 150px) scale(0); opacity: 0; }
              20% { opacity: 1; transform: translate(250px, 150px) scale(1.5); }
              80% { opacity: 1; transform: translate(320px, 150px) scale(1); }
              100% { transform: translate(450px, 150px) scale(0); opacity: 0; }
            }

            .text-sm { font-family: sans-serif; font-size: 13px; font-weight: 500; fill: #aaa; text-anchor: middle; }
            .text-lg { font-family: sans-serif; font-size: 16px; font-weight: bold; fill: #fff; text-anchor: middle; }
            .node-bg { fill: #111; stroke-width: 2; }
          `}
        </style>

        {/* Left Side: Traditional Email */}
        <g transform="translate(60, 100)" className="ia-glitch" stroke="#666" fill="none" strokeWidth="2">
          <path d="M 0,0 h 100 v 70 h -100 z M 0,0 l 50,40 l 50,-40" />
          <line x1="20" y1="80" x2="80" y2="80" stroke="#444" strokeWidth="8" strokeDasharray="10 5" />
          <text x="50" y="-20" className="text-lg" fill="#888" stroke="none">Traditional Email</text>
          <text x="50" y="110" className="text-sm" fill="#555" stroke="none">Siloed & Disposable</text>
        </g>

        {/* Center Morph Flow */}
        <circle cx="0" cy="0" r="3" fill={blue} filter="url(#glow-blue)" className="ia-particle ia-p-1" />
        <circle cx="0" cy="0" r="4" fill={emerald} filter="url(#glow-emerald)" className="ia-particle ia-p-2" />
        <circle cx="0" cy="0" r="3" fill={amber} filter="url(#glow-amber)" className="ia-particle ia-p-3" />
        
        <path d="M 200,150 Q 280,150 400,150" fill="none" stroke="#222" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M 380,145 l 20,5 l -20,5" fill="none" stroke="#444" strokeWidth="2" />

        {/* Right Side: Identity Mesh */}
        <g transform="translate(450, 0)">
          
          <text x="200" y="30" className="text-lg" filter="url(#glow-blue)">BaseMail Identity</text>
          
          {/* Connections */}
          <path d="M 200,150 L 80,80" fill="none" stroke={blue} strokeWidth="2" className="ia-conn-line" opacity="0.5" />
          <path d="M 200,150 L 320,80" fill="none" stroke={amber} strokeWidth="2" className="ia-conn-line" opacity="0.5" />
          <path d="M 200,150 L 80,240" fill="none" stroke={emerald} strokeWidth="2" className="ia-conn-line" opacity="0.5" />
          <path d="M 200,150 L 320,240" fill="none" stroke={lime} strokeWidth="2" className="ia-conn-line" opacity="0.5" />

          {/* Central Email Identity Node */}
          <g transform="translate(160, 110)" className="ia-pulse-blue">
            <circle cx="40" cy="40" r="45" fill="#000" stroke={blue} strokeWidth="3" filter="url(#glow-blue)" opacity="0.2" />
            <circle cx="40" cy="40" r="35" fill="#111" stroke={blue} strokeWidth="2" />
            <path d="M 20,30 l 20,15 l 20,-15 m -40,0 h 40 v 25 h -40 z" fill="none" stroke="#fff" strokeWidth="2" />
            <text x="40" y="-15" className="text-sm" fill="#fff">@basemail.ai</text>
          </g>

          {/* Wallet Node (Top Left) */}
          <g transform="translate(50, 50)" className="ia-pulse-blue">
            <rect x="0" y="0" width="60" height="60" rx="10" className="node-bg" stroke={blue} filter="url(#glow-blue)" />
            <path d="M 15,20 h 30 c 2,0 4,2 4,4 v 12 c 0,2 -2,4 -4,4 h -30 c -2,0 -4,-2 -4,-4 v -12 c 0,-2 2,-4 4,-4 z m 25,12 a 2,2 0 1 1 0,4 a 2,2 0 1 1 0,-4" fill="none" stroke={blue} strokeWidth="2" />
            <text x="30" y="80" className="text-sm" fill={blue}>Wallet</text>
          </g>

          {/* Bonds Node (Top Right) */}
          <g transform="translate(290, 50)" className="ia-pulse-amber">
            <rect x="0" y="0" width="60" height="60" rx="30" className="node-bg" stroke={amber} filter="url(#glow-amber)" />
            <path d="M 30,15 l 15,8 v 12 c 0,10 -15,15 -15,15 c 0,0 -15,-5 -15,-15 v -12 z" fill="none" stroke={amber} strokeWidth="2" />
            <text x="30" y="80" className="text-sm" fill={amber}>Bonds</text>
          </g>

          {/* Reputation Node (Bottom Left) */}
          <g transform="translate(50, 210)" className="ia-pulse-emerald">
            <polygon points="30,0 60,15 60,45 30,60 0,45 0,15" className="node-bg" stroke={emerald} filter="url(#glow-emerald)" />
            <path d="M 30,15 l 5,10 l 10,2 l -8,7 l 2,11 l -9,-5 l -9,5 l 2,-11 l -8,-7 l 10,-2 z" fill="none" stroke={emerald} strokeWidth="2" />
            <text x="30" y="80" className="text-sm" fill={emerald}>Reputation</text>
          </g>

          {/* Social Graph Node (Bottom Right) */}
          <g transform="translate(290, 210)" className="ia-pulse-lime">
            <rect x="0" y="0" width="60" height="60" rx="15" className="node-bg" stroke={lime} filter="url(#glow-lime)" />
            <circle cx="30" cy="20" r="6" fill="none" stroke={lime} strokeWidth="2" />
            <circle cx="20" cy="40" r="5" fill="none" stroke={lime} strokeWidth="2" />
            <circle cx="40" cy="40" r="5" fill="none" stroke={lime} strokeWidth="2" />
            <line x1="28" y1="25" x2="22" y2="35" stroke={lime} strokeWidth="1.5" />
            <line x1="32" y1="25" x2="38" y2="35" stroke={lime} strokeWidth="1.5" />
            <line x1="25" y1="40" x2="35" y2="40" stroke={lime} strokeWidth="1.5" />
            <text x="30" y="80" className="text-sm" fill={lime}>Social Graph</text>
          </g>

        </g>
      </svg>
    </div>
  );
}