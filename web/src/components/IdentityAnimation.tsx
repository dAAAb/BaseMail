import React from 'react';

export default function IdentityAnimation() {
  return (
    <div className="w-full max-w-lg mx-auto my-8 md:my-16">
      {/* Viewbox tuned for mobile sizing & clarity */}
      <svg aria-hidden="true" focusable="false" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto" style={{overflow: 'visible'}}>
        <style>
          {`
            .ia-track { stroke: #222; stroke-width: 1.5; stroke-dasharray: 4 4; fill: none; }
            .ia-hub { fill: #0052FF; }
            .ia-sat-bg { fill: #0a0a0a; stroke: #333; stroke-width: 1.5; }
            
            .ia-orbit { transform-origin: 200px 150px; animation: spin 40s linear infinite; }
            .ia-orbit-reverse { transform-origin: 200px 150px; animation: spin-rev 40s linear infinite; }
            
            @keyframes spin { 100% { transform: rotate(360deg); } }
            @keyframes spin-rev { 100% { transform: rotate(-360deg); } }
            
            .ia-icon-core { fill: none; stroke: #fff; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
            .ia-icon-sat { fill: none; stroke: #888; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
            
            .ia-lbl { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 11px; font-weight: 500; fill: #9aa0a9; letter-spacing: 0.05em; text-anchor: middle; }
            
            .ia-pulse-ring { 
              fill: none; 
              stroke: #0052FF; 
              stroke-width: 1;
              animation: ripple 3s ease-out infinite; 
            }
            .ia-pr-2 { animation-delay: 1.5s; }
            
            @keyframes ripple {
              0% { r: 30px; opacity: 1; }
              100% { r: 100px; opacity: 0; }
            }
            
            .ia-color-amber { stroke: #d97706; }
            .ia-color-emerald { stroke: #059669; }
            .ia-color-lime { stroke: #65a30d; }
          `}
        </style>

        {/* Connections / Tracks */}
        <circle cx="200" cy="150" r="90" className="ia-track" />
        
        {/* Ripples */}
        <circle cx="200" cy="150" r="30" className="ia-pulse-ring" />
        <circle cx="200" cy="150" r="30" className="ia-pulse-ring ia-pr-2" />
        
        <g className="ia-orbit">
          {/* Node: Wallet (Top Left) */}
          <g transform="translate(136, 86)">
            <g className="ia-orbit-reverse">
              <circle cx="0" cy="0" r="20" className="ia-sat-bg" />
              <path d="M -7,-4 h 14 c 1,0 2,1 2,2 v 6 c 0,1 -1,2 -2,2 h -14 c -1,0 -2,-1 -2,-2 v -6 c 0,-1 1,-2 2,-2 z m 11,3 h 1" className="ia-icon-sat" />
              <text x="0" y="-28" className="ia-lbl">WALLET</text>
            </g>
          </g>
          
          {/* Node: Social (Top Right) */}
          <g transform="translate(264, 86)">
            <g className="ia-orbit-reverse">
              <circle cx="0" cy="0" r="20" className="ia-sat-bg" />
              <circle cx="-4" cy="-3" r="1.5" className="ia-icon-sat ia-color-lime" />
              <circle cx="5" cy="-1" r="1.5" className="ia-icon-sat ia-color-lime" />
              <circle cx="0" cy="5" r="1.5" className="ia-icon-sat ia-color-lime" />
              <path d="M -3,-3 l 7,1 m -4,4 l 2,-3" className="ia-icon-sat ia-color-lime" style={{strokeWidth: 1}} />
              <text x="0" y="-28" className="ia-lbl" style={{fill: '#65a30d'}}>SOCIAL</text>
            </g>
          </g>

          {/* Node: Reputation (Bottom Right) */}
          <g transform="translate(264, 214)">
            <g className="ia-orbit-reverse">
              <circle cx="0" cy="0" r="20" className="ia-sat-bg" />
              <path d="M 0,-6 l 2,4 h 4 l -3,3 l 1,4 l -4,-3 l -4,3 l 1,-4 l -3,-3 h 4 z" className="ia-icon-sat ia-color-emerald" />
              <text x="0" y="36" className="ia-lbl" style={{fill: '#059669'}}>REPUTATION</text>
            </g>
          </g>

          {/* Node: Bonds (Bottom Left) */}
          <g transform="translate(136, 214)">
            <g className="ia-orbit-reverse">
              <circle cx="0" cy="0" r="20" className="ia-sat-bg" />
              <path d="M -5,-3 h 4 v 6 h -4 z m 6,0 h 4 v 6 h -4 z m -4,-2 h 8" className="ia-icon-sat ia-color-amber" />
              <text x="0" y="36" className="ia-lbl" style={{fill: '#d97706'}}>BONDS</text>
            </g>
          </g>
        </g>

        {/* Center Node: BaseMail */}
        <g transform="translate(200, 150)">
          <circle cx="0" cy="0" r="32" className="ia-hub" />
          <path d="M -10,-8 h 20 v 16 h -20 z m 0,0 l 10,8 l 10,-8" className="ia-icon-core" />
          <text x="0" y="4" className="ia-lbl" style={{fill: '#fff', fontSize: 10, fontWeight: 600, transform: 'translateY(16px)'}}>IDENTITY</text>
        </g>

      </svg>
    </div>
  );
}
