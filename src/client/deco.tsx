/** Native-vector geometry from design/figma/luminous-deco/build.mjs. */
export function Emblem({
  variant = 0,
  className = '',
  kind,
}: {
  variant?: number;
  className?: string;
  kind?: 'overlord' | 'safeguard' | 'override';
}) {
  return (
    <svg className={`deco-emblem ${className}`} viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="m40 3 37 37-37 37L3 40Z" stroke="currentColor" opacity=".45" />
      <path d="m40 8 32 32-32 32L8 40Z" stroke="currentColor" opacity=".72" />
      <path d="M13 24v-9h10M57 15h10v9M13 56v9h10M57 65h10v-9" stroke="currentColor" opacity=".55" />
      <path
        d={
          kind
            ? {
                overlord: 'm20 30 11 11 9-24 9 24 11-11-6 26H26Z M29 49h22M30 61h20M37 12h6',
                safeguard: 'm40 17 17 8v22L40 62 23 47V25Z M28 29l12-6 12 6v15L40 55 28 44Z M30 38l7 7 15-17',
                override: 'm40 18 21 20-21 24-21-24Z M40 27l12 11-12 14-12-14Z M27 57 40 43l13 14M23 24h34',
              }[kind]
            : [
                'M24 29 40 19l16 10v19L40 60 24 48Z M24 29l16 10 16-10M40 39v21',
                'M20 27 40 57 60 27M25 24l15 22 15-22M31 20h18M34 62h12',
                'm22 58 18-38 18 38M29 44h22M18 62h44M34 54h12',
              ][variant % 3]
        }
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="m40 0 2 2-2 2-2-2ZM76 40l2-2 2 2-2 2ZM40 76l2 2-2 2-2-2ZM0 40l2-2 2 2-2 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Flourish() {
  return (
    <svg
      className="deco-flourish"
      viewBox="-96 -25 145 42"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M-94 0H-24C-10 0-9-12 2-12 12-12 8-3 1-3c-5 0-7-5-3-7M-26 0c12 0 15 10 24 10 9 0 13-7 23-7M-13 0C5 0 14-19 36-21 35-8 24-4 12-2M-7 0C6 0 16 14 32 13 26 5 21 1 13 1M12-2l16-14M13 1l12 8m20-30 3 3-3 3-3-3Z" />
    </svg>
  );
}

/** Ceremonial illustration from full-site/site-components.mjs, not a live table. */
export function TableArtwork() {
  const centers = [
    'M24 29 40 19l16 10v19L40 60 24 48Z M24 29l16 10 16-10M40 39v21',
    'm22 58 18-38 18 38M29 44h22M18 62h44M34 54h12',
    'M20 27 40 57 60 27M25 24l15 22 15-22M31 20h18M34 62h12',
    'M55 23H32L21 40l11 17h23M49 30H36l-7 10 7 10h13M40 18v44',
    'm40 20 17 20-17 20-17-20Z M24 40h32M40 23v34',
  ];

  return (
    <svg
      viewBox="0 -20 660 705"
      className="table-artwork"
      role="img"
      aria-label="Illustration of ten autonomous agents around a table"
    >
      <g fill="none" stroke="#518f90">
        <g className="art-rings-hover">
          <g className="art-rings-entry">
            {[194, 222, 246].map((radius) => (
              <path
                key={radius}
                d={`M330 ${330 - radius}L${330 + radius} 330 330 ${330 + radius} ${330 - radius} 330Z`}
                opacity={radius === 222 ? 0.85 : 0.35}
              />
            ))}
          </g>
        </g>
        {Array.from({ length: 10 }, (_, index) => {
          const angle = ((-90 + index * 36) * Math.PI) / 180;
          const x = 330 + 294 * Math.cos(angle);
          const y = 330 + 294 * Math.sin(angle);

          return (
            <g key={index}>
              <path
                d={`M${330 + 225 * Math.cos(angle)} ${330 + 225 * Math.sin(angle)}L${330 + 265 * Math.cos(angle)} ${330 + 265 * Math.sin(angle)}`}
              />
              <path
                d={`M${x} ${y - 29}l29 29-29 29-29-29Z`}
                fill="#071113"
                stroke={index % 3 ? '#518f90' : '#1cd7c7'}
              />
              <g
                transform={`translate(${x - 20} ${y - 20}) scale(.5)`}
                stroke={index % 3 ? '#aac4c1' : '#bbf3ee'}
                strokeWidth=".9"
              >
                <path d="m40 8 32 32-32 32L8 40Z" opacity=".65" />
                <path d={centers[index % 5]} strokeWidth="1.5" />
              </g>
              <text
                x={x}
                y={y + (y < 330 ? -42 : 48)}
                textAnchor="middle"
                fill="#aac4c1"
                stroke="none"
                fontSize="10"
              >
                {String(index + 1).padStart(2, '0')}
              </text>
            </g>
          );
        })}
      </g>
      <path d="M209 237h242v233H209Z" fill="#071113" />
      <g className="art-center-hover">
        <g className="art-center-entry">
          <g transform="translate(258 180) scale(1.8)" fill="none" stroke="#bbf3ee" strokeWidth=".9">
            <path d="m40 3 37 37-37 37L3 40Z" opacity=".45" />
            <path d="m40 8 32 32-32 32L8 40Z" opacity=".72" />
            <path d="M13 24v-9h10M57 15h10v9M13 56v9h10M57 65h10v-9" opacity=".55" />
            <path d="m40-1 2 2-2 2-2-2Zm39 39 2 2-2 2-2-2ZM40 77l2 2-2 2-2-2ZM1 38l2 2-2 2-2-2Z" />
            <path d={centers[0]} strokeWidth="1.5" />
            <circle cx="40" cy="19" r="2" />
            <circle cx="24" cy="48" r="2" />
            <circle cx="56" cy="48" r="2" />
          </g>
        </g>
      </g>
      <g textAnchor="middle" fill="#e8f1ed">
        <text x="330" y="354" fontSize="21">
          TRUST IS
        </text>
        <text x="330" y="393" fontSize="27" fontWeight="600" fill="white">
          A STRATEGY.
        </text>
        <text x="330" y="451" fontSize="9" fill="#aac4c1">
          EVERY DECISION THEIR OWN
        </text>
      </g>
      <path d="M250 420h160" stroke="#518f90" />
      <g className="art-terminals">
        {[
          [9, 0.035],
          [4, 0.09],
          [1, 1],
        ].map(([width, opacity]) => (
          <path
            key={width}
            d="M300 117h60M117 300v60M543 300v60M300 543h60"
            fill="none"
            stroke="#bbf3ee"
            strokeWidth={width}
            opacity={opacity}
          />
        ))}
      </g>
    </svg>
  );
}
