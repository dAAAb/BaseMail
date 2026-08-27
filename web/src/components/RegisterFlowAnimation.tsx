import React from 'react';

export default function RegisterFlowAnimation() {
  return (
    <div className="w-full max-w-lg mx-auto my-8 md:my-16">
      {/* Mobile-first, tightly packed viewBox for large rendering on small screens */}
      <svg aria-hidden="true" focusable="false" viewBox="0 0 400 160" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" style={{overflow: 'visible'}}>
        <style>
          {`
            .rf-track { stroke: #222; stroke-width: 2; stroke-linecap: round; }
            .rf-flow-line { 
              stroke: #0052FF; 
              stroke-width: 2; 
              stroke-linecap: round;
              stroke-dasharray: 60 400;
              animation: slide 3s ease-in-out infinite; 
            }
            .rf-node { fill: #0a0a0a; stroke: #333; stroke-width: 2; transition: all 0.3s; }
            .rf-node-active { fill: #0052FF; stroke: #0052FF; stroke-width: 2; }
            .rf-icon { fill: none; stroke: #888; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
            .rf-icon-active { fill: none; stroke: #fff; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
            .rf-lbl { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; font-weight: 500; fill: #9aa0a9; letter-spacing: 0.05em; text-anchor: middle; }
            .rf-lbl-primary { fill: #0052FF; font-weight: 600; }
            .rf-badge { fill: #111; stroke: #333; stroke-width: 1; rx: 10; }
            .rf-badge-txt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9px; fill: #aaa; text-anchor: middle; }
            
            @keyframes slide {
              0% { stroke-dashoffset: 400; opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { stroke-dashoffset: -100; opacity: 0; }
            }
            
            .rf-pulse { animation: pulsing 3s infinite alternate; }
            @keyframes pulsing {
              0% { transform: scale(0.95); opacity: 0.8; }
              100% { transform: scale(1.05); opacity: 1; }
            }
          `}
        </style>

        {/* Main Track */}
        <line x1="50" y1="80" x2="350" y2="80" className="rf-track" />
        
        {/* Animated Flow */}
        <line x1="50" y1="80" x2="350" y2="80" className="rf-flow-line" />

        {/* Node 1: Wallet */}
        <g transform="translate(50, 80)">
          <circle cx="0" cy="0" r="24" className="rf-node" />
          <path d="M -8,-5 h 16 c 2,0 3,1 3,3 v 4 c 0,2 -1,3 -3,3 h -16 c -2,0 -3,-1 -3,-3 v -4 c 0,-2 1,-3 3,-3 z m 12,3 h 2" className="rf-icon" />
          <text x="0" y="42" className="rf-lbl">WALLET</text>
        </g>
        
        {/* Badge 1 */}
        <g transform="translate(125, 60)">
          <rect x="-35" y="-12" width="70" height="24" className="rf-badge" />
          <text x="0" y="2" className="rf-badge-txt">2 CALLS</text>
        </g>

        {/* Node 2: BaseMail (Center) */}
        <g transform="translate(200, 80)" className="rf-pulse" style={{transformOrigin: '0px 0px'}}>
          <circle cx="0" cy="0" r="28" className="rf-node-active" />
          <path d="M -8,-6 h 16 v 12 h -16 z m 0,0 l 8,6 l 8,-6" className="rf-icon-active" />
          <text x="0" y="42" className="rf-lbl rf-lbl-primary">IDENTITY</text>
        </g>

        {/* Badge 2 */}
        <g transform="translate(275, 60)">
          <rect x="-35" y="-12" width="70" height="24" className="rf-badge" />
          <text x="0" y="2" className="rf-badge-txt">1 CALL</text>
        </g>

        {/* Node 3: Recipient */}
        <g transform="translate(350, 80)">
          <circle cx="0" cy="0" r="24" className="rf-node" />
          <path d="M -6,5 l 14,-8 l -14,-6 v 14 z m 3,-7 l 8,-1" className="rf-icon" />
          <text x="0" y="42" className="rf-lbl">SEND</text>
        </g>
      </svg>
    </div>
  );
}
