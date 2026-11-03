import React from 'react';

// Original illustration: a ridge line with turbines at three depths. Rotors turn at slightly different
// speeds; motion stops for people who ask for reduced motion. Colours come from the theme tokens.

function Blade({ len, w }: { len: number; w: number }) {
  return <path d={`M0 0 C ${w} ${-len * 0.25} ${w * 0.7} ${-len * 0.8} 0 ${-len} C ${-w * 0.25} ${-len * 0.7} ${-w * 0.35} ${-len * 0.3} 0 0Z`} />;
}

function Turbine({ x, base, h, speed, delay, depth }: { x: number; base: number; h: number; speed: number; delay: number; depth: 0 | 1 | 2 }) {
  const hubY = base - h;
  const len = h * 0.46;
  const w = len * 0.09;
  const tw0 = h * 0.035, tw1 = h * 0.018;
  return (
    <g className={`turbine depth-${depth}`}>
      <path d={`M${x - tw0} ${base} L${x - tw1} ${hubY} L${x + tw1} ${hubY} L${x + tw0} ${base} Z`} />
      <rect x={x - tw1 * 1.4} y={hubY - tw1 * 1.6} width={tw1 * 4.2} height={tw1 * 2.4} rx={tw1} />
      <g transform={`translate(${x} ${hubY})`}>
        <g className="rotor" style={{ animationDuration: `${speed}s`, animationDelay: `${-delay}s` }}>
          <Blade len={len} w={w} />
          <g transform="rotate(120)"><Blade len={len} w={w} /></g>
          <g transform="rotate(240)"><Blade len={len} w={w} /></g>
          <circle r={tw1 * 1.3} />
        </g>
      </g>
    </g>
  );
}

export function TurbineScene({ title }: { title: string }) {
  return (
    <svg className="scene" viewBox="0 0 1200 420" role="img" aria-label={title} preserveAspectRatio="xMidYMax slice">
      <circle className="sun" cx="930" cy="110" r="46" />
      <path className="hill hill-far" d="M0 300 C 160 250 300 270 440 245 C 600 215 760 260 900 235 C 1020 215 1120 240 1200 228 L1200 420 L0 420Z" />
      <Turbine x={520} base={262} h={92} speed={9} delay={1.3} depth={0} />
      <Turbine x={610} base={250} h={86} speed={8.2} delay={4.1} depth={0} />
      <Turbine x={1060} base={232} h={88} speed={8.8} delay={2.2} depth={0} />
      <path className="hill hill-mid" d="M0 340 C 140 300 260 320 380 300 C 520 276 640 316 780 300 C 940 282 1060 310 1200 296 L1200 420 L0 420Z" />
      <Turbine x={150} base={322} h={150} speed={7.4} delay={0.6} depth={1} />
      <Turbine x={330} base={306} h={142} speed={6.9} delay={3.3} depth={1} />
      <Turbine x={830} base={298} h={146} speed={7.8} delay={5.0} depth={1} />
      <path className="hill hill-near" d="M0 392 C 180 352 360 372 540 356 C 720 340 900 372 1200 350 L1200 420 L0 420Z" />
      <Turbine x={690} base={364} h={238} speed={6.2} delay={2.7} depth={2} />
      <Turbine x={980} base={360} h={214} speed={5.8} delay={0.9} depth={2} />
    </svg>
  );
}
