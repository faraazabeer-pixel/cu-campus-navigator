// Generates a clean top-down 2D verification preview of the D-Block region
// strictly matching the user's hand-drawn reference map (media_1793470159928_273828b0.jpg).
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const SVG_PATH = path.join(ARTIFACT_DIR, 'd-block-preview.svg');

// Sector bounds: x from -260 to 240, z from -335 to 135
const minX = -260, maxX = 240;
const minZ = -335, maxZ = 135;
const width = 1200, height = Math.round(1200 * (maxZ - minZ) / (maxX - minX));

function toSvg(x, z) {
  const sx = ((x - minX) / (maxX - minX)) * width;
  const sy = ((z - minZ) / (maxZ - minZ)) * height;
  return [sx.toFixed(1), sy.toFixed(1)];
}

function polyToSvg(poly) {
  return poly.map(([x, z]) => toSvg(x, z).join(',')).join(' ');
}

export function generateLayout() {
  const roads = [
    // 1. Ludhiana–Chandigarh Highway
    {
      id: 'highway',
      name: 'Ludhiana–Chandigarh Highway',
      width: 18,
      points: [[-260, -345], [-130, -332], [-51, -284], [50, -272], [240, -252]]
    },
    // 2. Gate 3 Access Road
    {
      id: 'gate3-road',
      name: 'Gate 3 Access Road',
      width: 9,
      points: [[-51, -284], [-51, -233]]
    },
    // 3. Northern Internal Road (Gobind, TB1, D8, DD)
    {
      id: 'd-north-road',
      name: 'North Internal Road',
      width: 8,
      points: [
        [-51, -233], [-85, -233], [-135, -233], [-135, -310]
      ]
    },
    // 4. DD Blocks Access Spur & Footpath
    {
      id: 'dd-access',
      name: 'DD Blocks Access',
      width: 7,
      points: [[-135, -276], [-155, -276]]
    },
    // 5. Outer East Road (around D-Block cluster & beside Parking)
    {
      id: 'd-east-road',
      name: 'D-Block East Road',
      width: 8,
      points: [
        [-85, -233], [-85, -222], [-50, -218], [-20, -206], [-15, -170], [-15, -130], [-15, -118]
      ]
    },
    // 6. Inner D-Block Loop Road
    {
      id: 'd-inner-loop',
      name: 'D-Block Inner Loop',
      width: 7,
      points: [
        [-85, -222], [-124, -222], [-132, -205], [-132, -150], [-115, -130],
        [-70, -125], [-20, -118], [-15, -118]
      ]
    },
    // 6b. Gate 7 North Approach Road (from D4 merge to Gate 7)
    {
      id: 'd-south-approach',
      name: 'Gate 7 North Approach Road',
      width: 8,
      points: [[-15, -118], [-15, -90]]
    },
    // 7. Shivalik Hostel Loop Road
    {
      id: 'shivalik-loop',
      name: 'Shivalik Hostel Loop',
      width: 7,
      points: [
        [-124, -222], [-168, -228], [-205, -200], [-215, -168], [-195, -142], [-140, -140], [-132, -150]
      ]
    },
    // 8. Road towards B5, LC Hostel & B4
    {
      id: 'b5-b4-road',
      name: 'Gate 7 – B5 – LC Hostel – B4 Road',
      width: 8,
      points: [
        [-15, -90], [50, -90], [130, -90], [170, -90], [170, -115], [205, -115], [205, -74]
      ]
    },
    // 9. Road towards Gate 8 & Sports Complex
    {
      id: 'gate8-road',
      name: 'Gate 7 – Gate 8 Road',
      width: 8,
      points: [
        [-15, -90], [-70, -85], [-150, -78], [-205, -72], [-268, -68]
      ]
    },
    // 10. Sports Complex Spur
    {
      id: 'sports-spur',
      name: 'Sports Complex Access',
      width: 8,
      points: [[-205, -72], [-205, -60]]
    },
    // 11. Diagonal Road: Gate 7 to Gate 4 & Boys Hostel
    {
      id: 'gate7-gate4-road',
      name: 'Gate 7 to Gate 4 Diagonal Avenue',
      width: 9,
      points: [
        [-15, -90], [35, -55], [85, -22], [140, 12], [190, 45], [212, 65]
      ]
    },
    // 12. Road past Gate 4 to Boys Hostel
    {
      id: 'boys-hostel-road',
      name: 'Boys Hostel Access',
      width: 8,
      points: [[212, 65], [245, 95], [265, 120]]
    }
  ];

  const buildings = [
    // DD1 Block
    {
      id: 'dd1',
      name: 'DD1 Block',
      type: 'academic',
      label: 'DD1',
      poly: [
        [-205, -299], [-165, -299], [-165, -281], [-182, -281],
        [-182, -288], [-194, -288], [-194, -281], [-205, -281]
      ]
    },
    // DD2 Block
    {
      id: 'dd2',
      name: 'DD2 Block',
      type: 'academic',
      label: 'DD2',
      poly: [[-198, -270], [-162, -270], [-162, -254], [-198, -254]]
    },
    // Unnamed square building northwest of Gobind
    {
      id: 'north-square',
      name: 'Unnamed Facility',
      type: 'admin',
      label: '', // Unnamed per reference map
      poly: [[-164, -310], [-146, -310], [-146, -292], [-164, -292]]
    },
    // Gobind Hostel
    {
      id: 'gobind',
      name: 'Gobind Hostel',
      type: 'hostel',
      label: 'GOBIND\nHOSTEL',
      poly: [[-113, -288], [-77, -288], [-77, -274], [-113, -274]]
    },
    // TB1
    {
      id: 'tb1',
      name: 'TB1',
      type: 'academic',
      label: 'TB1',
      poly: [[-108, -271], [-82, -271], [-82, -261], [-108, -261]]
    },
    // D8 Block
    {
      id: 'd8',
      name: 'D8 Block',
      type: 'academic',
      label: 'D8',
      poly: [[-125, -258], [-65, -258], [-65, -242], [-125, -242]]
    },
    // Unnamed large block east of Gate 3
    {
      id: 'orientation-venue',
      name: 'Unnamed Large Building',
      type: 'academic',
      label: '', // Unnamed per reference map
      poly: [[-27, -265], [27, -265], [27, -225], [-27, -225]]
    },
    // D1 Block (North) - Separate rectangular footprint matching reference
    {
      id: 'd1-north',
      name: 'D1 Block (North)',
      type: 'academic',
      label: 'D1 BLOCK',
      poly: [[-92, -212], [-48, -212], [-48, -198], [-92, -198]]
    },
    // D1 Block (West) - Separate rectangular footprint matching reference
    {
      id: 'd1-west',
      name: 'D1 Block (West)',
      type: 'academic',
      label: 'D1\nBLOCK',
      poly: [[-119, -202], [-105, -202], [-105, -178], [-119, -178]]
    },
    // D1 Connector corridor
    {
      id: 'd1-link',
      name: 'D1 Connector',
      type: 'academic',
      label: '',
      poly: [[-105, -204], [-92, -204], [-92, -198], [-105, -198]]
    },
    // D2 Block
    {
      id: 'd2',
      name: 'D2 Block',
      type: 'academic',
      label: 'D2\nBLOCK',
      poly: [[-45, -200], [-27, -200], [-27, -184], [-45, -184]]
    },
    // D3 Block
    {
      id: 'd3',
      name: 'D3 Block',
      type: 'academic',
      label: 'D3\nBLOCK',
      poly: [[-55, -178], [-33, -178], [-33, -162], [-55, -162]]
    },
    // D4 Block
    {
      id: 'd4',
      name: 'D4 Block',
      type: 'academic',
      label: 'D4\nBLOCK',
      poly: [[-60, -155], [-36, -155], [-36, -137], [-60, -137]]
    },
    // D5 Block
    {
      id: 'd5',
      name: 'D5 Block',
      type: 'academic',
      label: 'D5\nBLOCK',
      poly: [[-119, -173], [-105, -173], [-105, -151], [-119, -151]]
    },
    // D7 Block (northwest of D-block cluster)
    {
      id: 'd7',
      name: 'D7 Block',
      type: 'academic',
      label: 'D7\nBLOCK',
      poly: [[-157, -217], [-139, -217], [-139, -193], [-157, -193]]
    },
    // D6 Block (with STAR icon)
    {
      id: 'd6',
      name: 'D6 Block',
      type: 'library',
      label: 'D6 ★',
      poly: [[-162, -187], [-142, -187], [-142, -169], [-162, -169]]
    },
    // Shivalik Hostel
    {
      id: 'shivalik',
      name: 'Shivalik Hostel',
      type: 'hostel',
      label: 'SHIVALIK\nHOSTEL',
      poly: [
        [-199, -181], [-171, -181], [-171, -155], [-186, -155],
        [-186, -166], [-199, -166]
      ]
    },
    // Chimney / Narrow tower west of Shivalik
    {
      id: 'chimney',
      name: 'Tower / Chimney',
      type: 'admin',
      label: '',
      poly: [[-234, -178], [-230, -178], [-230, -142], [-234, -142]]
    },
    // B5 Block
    {
      id: 'b5',
      name: 'B5 Block',
      type: 'academic',
      label: 'B5 BLOCK',
      poly: [
        [27, -114], [47, -114], [47, -122], [73, -122],
        [73, -98], [27, -98]
      ]
    },
    // LC Hostel Girls
    {
      id: 'lc-hostel',
      name: 'LC Hostel Girls',
      type: 'hostel',
      label: 'LC\nHOSTEL\nGIRLS',
      poly: [[98, -134], [142, -134], [142, -98], [98, -98]]
    },
    // B4 Block
    {
      id: 'b4',
      name: 'B4 Block',
      type: 'academic',
      label: 'B4',
      poly: [[182, -109], [198, -109], [198, -79], [182, -79]]
    },
    // Boys Hostel
    {
      id: 'boys-hostel',
      name: 'Boys Hostel',
      type: 'hostel',
      label: 'BOYS\nHOSTEL',
      poly: [[252, 125], [307, 125], [307, 165], [252, 165]]
    }
  ];

  const facilities = [
    // Sports Complex
    {
      id: 'sports-complex',
      name: 'Sports Complex',
      type: 'sports',
      label: 'SPORTS\nCOMPLEX',
      poly: [
        [-243, -54], [-167, -54], [-160, -44], [-160, -26],
        [-167, -16], [-243, -16], [-250, -26], [-250, -44]
      ]
    }
  ];

  const parkings = [
    // Parking along the east of D-Block
    {
      id: 'p-d-block',
      name: 'Parking',
      poly: [[-5, -195], [15, -195], [15, -105], [-5, -105]],
      label: 'PARKING'
    }
  ];

  const gates = [
    { id: 'gate-3', name: 'GATE 3', x: -51, z: -284, rot: 0 },
    { id: 'gate-7', name: 'GATE 7', x: -15, z: -90, rot: 0 },
    { id: 'gate-8', name: 'GATE 8', x: -268, z: -68, rot: 0 },
    { id: 'gate-4', name: 'GATE 4', x: 212, z: 65, rot: 32 }
  ];

  const greenAreas = [
    // Lawn around Gobind / TB1 / D8
    [[-122, -295], [-68, -295], [-68, -238], [-122, -238]],
    // Green area north of D1 / Orientation venue
    [[-60, -238], [15, -232], [-20, -210], [-60, -225]],
    // Green belt between D-Block and Gate 8 road
    [[-195, -135], [-130, -135], [-130, -85], [-195, -85]],
    // Green area south of B5 towards diagonal
    [[0, -84], [115, -84], [105, -35], [-5, -65]],
    // Sports Complex surrounds
    [[-255, -60], [-155, -60], [-155, -10], [-255, -10]]
  ];

  return { roads, buildings, facilities, parkings, gates, greenAreas };
}

export function renderSvg() {
  const { roads, buildings, facilities, parkings, gates, greenAreas } = generateLayout();

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f4f7f2" />
      <stop offset="100%" stop-color="#e9efe6" />
    </linearGradient>

    <!-- Highway Asphalt Gradient -->
    <linearGradient id="highwayGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a2e33" />
      <stop offset="100%" stop-color="#363b42" />
    </linearGradient>

    <!-- Road Asphalt Gradient -->
    <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#33383f" />
      <stop offset="100%" stop-color="#3e444c" />
    </linearGradient>

    <!-- Building Shadow -->
    <filter id="bldgShadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="3" dy="4" stdDeviation="4" flood-color="#1e293b" flood-opacity="0.35" />
    </filter>

    <!-- Star Glow for D6 -->
    <filter id="starGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#f59e0b" flood-opacity="0.8" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- Green Lawns -->
  <g class="green-areas">
    ${greenAreas.map((poly) => `
      <polygon points="${polyToSvg(poly)}" fill="#d1e7c4" stroke="#b4d7a0" stroke-width="1.5" opacity="0.85" />
    `).join('')}
  </g>

  <!-- Roads: Kerb Outlines -->
  <g class="road-kerbs">
    ${roads.map((r) => {
      const d = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvg(p[0], p[1]).join(' ')}`).join(' ');
      const strokeW = (r.width / (maxX - minX)) * width + 4;
      return `<path d="${d}" fill="none" stroke="#22262a" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join('')}
  </g>

  <!-- Roads: Asphalt Surface -->
  <g class="road-surfaces">
    ${roads.map((r) => {
      const d = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvg(p[0], p[1]).join(' ')}`).join(' ');
      const strokeW = (r.width / (maxX - minX)) * width;
      const fill = r.id === 'highway' ? 'url(#highwayGrad)' : 'url(#roadGrad)';
      return `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${strokeW.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" />`;
    }).join('')}
  </g>

  <!-- Road Dashed Centerline Markings -->
  <g class="road-markings">
    ${roads.filter((r) => r.width >= 8).map((r) => {
      const d = r.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toSvg(p[0], p[1]).join(' ')}`).join(' ');
      return `<path d="${d}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-dasharray="6,6" opacity="0.75" />`;
    }).join('')}
  </g>

  <!-- Parking Areas -->
  <g class="parking-lots">
    ${parkings.map((p) => {
      const pts = polyToSvg(p.poly);
      const [cx, cy] = p.poly.reduce((acc, pt) => [acc[0] + pt[0] / p.poly.length, acc[1] + pt[1] / p.poly.length], [0, 0]);
      const [scx, scy] = toSvg(cx, cy);
      return `
        <polygon points="${pts}" fill="#d1d5db" stroke="#9ca3af" stroke-width="2" filter="url(#bldgShadow)" />
        <g transform="translate(${scx}, ${scy})">
          <text text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800" font-size="14" fill="#374151" letter-spacing="3" transform="rotate(-90)">${p.label}</text>
        </g>
      `;
    }).join('')}
  </g>

  <!-- Facilities (Sports Complex) -->
  <g class="facilities">
    ${facilities.map((f) => {
      const pts = polyToSvg(f.poly);
      const [cx, cy] = f.poly.reduce((acc, pt) => [acc[0] + pt[0] / f.poly.length, acc[1] + pt[1] / f.poly.length], [0, 0]);
      const [scx, scy] = toSvg(cx, cy);
      return `
        <polygon points="${pts}" fill="#cbd5e1" stroke="#64748b" stroke-width="2.5" filter="url(#bldgShadow)" />
        <text x="${scx}" y="${scy}" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="800" font-size="14" fill="#1e293b" letter-spacing="1">
          <tspan x="${scx}" dy="-8">SPORTS</tspan>
          <tspan x="${scx}" dy="16">COMPLEX</tspan>
        </text>
      `;
    }).join('')}
  </g>

  <!-- Buildings -->
  <g class="buildings" filter="url(#bldgShadow)">
    ${buildings.map((b) => {
      const pts = polyToSvg(b.poly);
      const fill = b.id === 'd6' ? '#fed7aa' : (b.type === 'hostel' ? '#e2e8f0' : (b.id === 'd1' ? '#dbeafe' : '#e2e8f0'));
      const stroke = b.id === 'd6' ? '#ea580c' : '#475569';
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" />`;
    }).join('')}
  </g>

  <!-- D6 Star Highlight -->
  ${(() => {
    const [scx, scy] = toSvg(-152, -178);
    return `
      <!-- Star Icon on D6 -->
      <polygon points="${scx},${scy - 14} ${scx + 4},${scy - 4} ${scx + 14},${scy - 4} ${scx + 6},${scy + 3} ${scx + 9},${scy + 13} ${scx},${scy + 7} ${scx - 9},${scy + 13} ${scx - 6},${scy + 3} ${scx - 14},${scy - 4} ${scx - 4},${scy - 4}"
               fill="#f59e0b" stroke="#b45309" stroke-width="1.5" filter="url(#starGlow)" />
    `;
  })()}

  <!-- Building Labels -->
  <g class="building-labels" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" fill="#0f172a">
    ${buildings.filter((b) => b.label).map((b) => {
      const [cx, cy] = b.poly.reduce((acc, pt) => [acc[0] + pt[0] / b.poly.length, acc[1] + pt[1] / b.poly.length], [0, 0]);
      const [scx, scy] = toSvg(cx, cy);
      const lines = b.label.split('\n');
      const fontSize = b.id === 'd8' ? 18 : (b.id.startsWith('d') ? 11 : (b.type === 'hostel' ? 10 : 12));
      const lineH = fontSize * 1.15;
      const startY = Number(scy) - ((lines.length - 1) * lineH) / 2;
      return `
        <text x="${scx}" y="${startY}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}">
          ${lines.map((l, i) => `<tspan x="${scx}" dy="${i === 0 ? 0 : lineH}">${l}</tspan>`).join('')}
        </text>
      `;
    }).join('')}
  </g>

  <!-- Gates & Landmarks -->
  <g class="gates" font-family="-apple-system, BlinkMacSystemFont, sans-serif">
    ${gates.map((g) => {
      const [gx, gy] = toSvg(g.x, g.z);
      return `
        <g transform="translate(${gx}, ${gy}) rotate(${g.rot})">
          <!-- Gate Posts & Barrier -->
          <rect x="-14" y="-5" width="28" height="10" rx="3" fill="#0f172a" />
          <rect x="-12" y="-3" width="7" height="6" fill="#f8fafc" />
          <rect x="5" y="-3" width="7" height="6" fill="#f8fafc" />
          <line x1="-5" y1="0" x2="5" y2="0" stroke="#ef4444" stroke-width="2" />
          <!-- Gate Label Badge -->
          <rect x="-35" y="-28" width="70" height="18" rx="4" fill="#0f172a" opacity="0.9" />
          <text x="0" y="-16" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="800" fill="#ffffff" letter-spacing="0.5">${g.name}</text>
        </g>
      `;
    }).join('')}
  </g>

  <!-- Road Labels -->
  <g class="road-labels" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-weight="700">
    <!-- Highway Label -->
    ${(() => {
      const [hx, hy] = toSvg(-10, -290);
      return `
        <g transform="translate(${hx}, ${hy}) rotate(5.5)">
          <text text-anchor="middle" fill="#ffffff" opacity="0.95">
            <tspan font-size="14" letter-spacing="1">लुधियाना चंडीगढ़ HIGHWAY</tspan>
            <tspan dx="15" font-size="13" letter-spacing="1.5">LUDHIANA–CHANDIGARH HIGHWAY</tspan>
          </text>
        </g>
      `;
    })()}
  </g>

  <!-- Title & Legend Card -->
  <g transform="translate(30, 30)">
    <rect width="360" height="110" rx="10" fill="#ffffff" opacity="0.95" stroke="#cbd5e1" stroke-width="1.5" filter="url(#bldgShadow)" />
    <text x="18" y="28" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="15" font-weight="800" fill="#0f172a">D-Block Campus Area Layout Preview</text>
    <text x="18" y="48" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="500" fill="#64748b">Chandigarh University Mohali • 2D Verification Plan</text>
    <line x1="18" y1="58" x2="342" y2="58" stroke="#e2e8f0" stroke-width="1" />
    <g transform="translate(18, 70)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="600" fill="#334155">
      <!-- Legend items -->
      <rect x="0" y="0" width="12" height="12" rx="2" fill="#dbeafe" stroke="#3b82f6" />
      <text x="18" y="10">D-Block Cluster (D1–D5)</text>

      <polygon points="175,-2 178,5 186,5 180,10 182,18 175,13 168,18 170,10 164,5 172,5" fill="#f59e0b" transform="scale(0.7) translate(75, -2)" />
      <text x="198" y="10">D6 Resource Centre</text>

      <rect x="0" y="18" width="12" height="12" rx="2" fill="#e2e8f0" stroke="#475569" />
      <text x="18" y="28">Hostels & Blocks</text>

      <rect x="175" y="18" width="12" height="12" rx="2" fill="#d1d5db" stroke="#9ca3af" />
      <text x="198" y="28">Parking Area</text>
    </g>
  </g>
</svg>
`;

  return svg;
}

const svg = renderSvg();
fs.writeFileSync(SVG_PATH, svg);
console.log('Generated D-Block preview SVG:', SVG_PATH, `(${svg.length} bytes)`);
