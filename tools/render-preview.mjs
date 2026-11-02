// Generates a clean top-down 2D verification preview of the Gate 2 to C1/C2 area
// matching the user's hand-drawn reference map.
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = '/Users/faraaz/.gemini/antigravity/brain/64207226-b59c-44e5-9bd5-91c66dd8008c';
const SVG_PATH = path.join(ARTIFACT_DIR, 'gate2-c-block-preview.svg');

// Sector bounds: x from 140 to 530, z from -310 to 90
const minX = 140, maxX = 530;
const minZ = -310, maxZ = 90;
const width = 1200, height = Math.round(1200 * (maxZ - minZ) / (maxX - minX));

function toSvg(x, z) {
  const sx = ((x - minX) / (maxX - minX)) * width;
  const sy = ((z - minZ) / (maxZ - minZ)) * height;
  return [sx.toFixed(1), sy.toFixed(1)];
}

function polyToSvg(poly) {
  return poly.map(([x, z]) => toSvg(x, z).join(',')).join(' ');
}

// Generate the 2D layout geometry matching the hand-drawn map
export function generateLayout() {
  const roads = [
    // 1. Ludhiana-Chandigarh Highway
    { id: 'highway', name: 'Ludhiana–Chandigarh Highway', width: 22, points: [[140, -295], [275, -290], [435, -282], [530, -278]] },
    // 2. Gate 2 North-South Corridor
    { id: 'gate2-corridor', name: 'Gate 2 Corridor', width: 10, points: [[275, -290], [275, -220], [275, -145], [275, -120], [275, -74]] },
    // 3. Curved link from Gate 2 to south of A1
    { id: 'gate2-a1-curve', name: 'A1 Approach Curve', width: 8, points: [[275, -220], [285, -226], [305, -234], [330, -238]] },
    // 4. A1 loop roads (north, west, south, east)
    { id: 'a1-south', name: 'A1 South Road', width: 8, points: [[330, -238], [425, -238]] },
    { id: 'a1-west', name: 'A1 West Link', width: 7, points: [[330, -238], [330, -272]] },
    { id: 'a1-north', name: 'A1 North Road', width: 7, points: [[330, -272], [425, -272]] },
    { id: 'a1-east', name: 'A1 East Link', width: 7, points: [[425, -272], [435, -238]] },
    // 5. Gate 1 Link to Roundabout
    { id: 'gate1-link', name: 'Gate 1 Access', width: 9, points: [[448, -282], [435, -238]] },
    // 6. Eastern Roundabout
    { id: 'roundabout-east', name: 'East Parking Access', width: 8, points: [[435, -238], [475, -238]] },
    // 7. Sweeping curved avenue (Roundabout -> west of A2/A3 -> south of Central Parking)
    { id: 'curved-avenue', name: 'East Campus Avenue', width: 10, points: [
      [435, -238], [430, -200], [422, -155], [412, -120], [395, -95], [360, -82], [320, -78], [275, -74]
    ] },
    // 8. Fountain Plaza cross links
    { id: 'fountain-west-link', name: 'Fountain West Access', width: 8, points: [[275, -145], [308, -145]] },
    { id: 'fountain-east-link', name: 'Fountain East Access', width: 8, points: [[336, -145], [375, -145]] },
    { id: 'fountain-south-link', name: 'Fountain South Access', width: 8, points: [[322, -131], [320, -78]] },
    // 9. B1 road loop
    { id: 'b1-loop', name: 'B1 Access Loop', width: 7, points: [
      [275, -165], [245, -165], [205, -165], [170, -165], [160, -150], [160, -130], [200, -120], [275, -120]
    ] },
    // 10. Roads around B2 and B4
    { id: 'b2-north', name: 'B2 North Road', width: 8, points: [[200, -120], [275, -120]] },
    { id: 'b4-west', name: 'B4 Access Road', width: 7, points: [[200, -120], [200, -74]] },
    { id: 'b2-south', name: 'B2 South Road', width: 9, points: [[200, -74], [275, -74], [284, -74]] },
    // 11. Road past Basketball court to Main Ground and Gate 4
    { id: 'gate4-road', name: 'Gate 4 Corridor', width: 9, points: [
      [275, -74], [215, -74], [212, -55], [212, -15], [212, 35], [212, 65]
    ] },
    // 12. Road east of Main Ground (between Main Ground and C1/FR/C2)
    { id: 'east-mg-road', name: 'C-Block Academic Way', width: 8, points: [
      [284, -74], [284, -45], [284, -15], [284, 15], [284, 50]
    ] },
    // 13. Road south of Main Ground (connecting Gate 4 to C1/C2 road)
    { id: 'south-mg-road', name: 'Main Ground South Road', width: 8, points: [
      [212, 50], [250, 50], [284, 50]
    ] }
  ];

  const buildings = [
    // A1
    { id: 'a1', name: 'A1', type: 'academic', label: 'A1', poly: [[340, -266], [415, -268], [420, -248], [340, -244]] },
    // Sukhna Girls Hostel (2 blocks)
    { id: 'sukhna-1', name: 'Sukhna Girls Hostel (W)', type: 'hostel', label: 'SUKHNA\nGIRLS HOSTEL', poly: [[330, -204], [365, -200], [362, -178], [328, -182]] },
    { id: 'sukhna-2', name: 'Sukhna Girls Hostel (E)', type: 'hostel', label: 'SUKHNA\nGIRLS HOSTEL', poly: [[366, -218], [384, -215], [378, -192], [360, -195]] },
    // A2 & A3
    { id: 'a2', name: 'A2', type: 'academic', label: 'A2', poly: [[460, -195], [495, -195], [495, -165], [460, -165]] },
    { id: 'a3', name: 'A3', type: 'academic', label: 'A3', poly: [[448, -145], [492, -145], [492, -98], [448, -98]] },
    // B1 (hook shape)
    { id: 'b1', name: 'B1', type: 'academic', label: 'B1', poly: [
      [172, -178], [235, -178], [235, -162], [202, -162], [202, -135], [172, -135]
    ] },
    // B4
    { id: 'b4', name: 'B4', type: 'academic', label: 'B4', poly: [[184, -114], [202, -114], [202, -80], [184, -80]] },
    // B2 (two parallel blocks)
    { id: 'b2-north', name: 'B2 (North)', type: 'academic', label: 'B2', poly: [[215, -114], [270, -114], [270, -100], [215, -100]] },
    { id: 'b2-south', name: 'B2 (South)', type: 'academic', label: 'B2', poly: [[215, -96], [270, -96], [270, -82], [215, -82]] },
    // C3 & Staff Quarters
    { id: 'c3', name: 'C3', type: 'academic', label: 'C3', poly: [[184, -36], [206, -36], [206, 2], [184, 2]] },
    { id: 'staff-quarters', name: 'Staff Quarters', type: 'residential', label: 'Staff Qtrs', poly: [[184, 10], [206, 10], [206, 32], [184, 32]] },
    // C1, Food Republic, C2
    { id: 'c1', name: 'C1', type: 'academic', label: 'C1', poly: [[296, -44], [320, -44], [320, -16], [296, -16]] },
    { id: 'fr', name: 'Food Republic', type: 'food', label: 'FR', poly: [[296, -10], [320, -10], [320, 8], [296, 8]] },
    { id: 'c2', name: 'C2', type: 'academic', label: 'C2', poly: [[296, 14], [320, 14], [320, 42], [296, 42]] },
    // Tagore Hostel
    { id: 'tagore', name: 'Tagore Hostel', type: 'hostel', label: 'Tagore Hostel', poly: [[296, 56], [335, 56], [335, 80], [296, 80]] }
  ];

  const facilities = [
    // Basketball court
    { id: 'basketball', name: 'Basketball Court', type: 'court', label: 'BASKETBALL', poly: [[228, -70], [262, -70], [262, -50], [228, -50]] },
    // Main Ground
    { id: 'main-ground', name: 'Main Ground', type: 'cricket', label: 'MAIN\nGROUND', poly: [[222, -38], [272, -38], [272, 32], [222, 32]] },
    // Fountain Plaza
    { id: 'fountain', name: 'Fountain Plaza', type: 'fountain', label: 'FOUNTAIN\nPLAZA', cx: 322, cz: -145, r: 14 }
  ];

  const parkings = [
    // North parking near Gate 1
    { id: 'p-north', name: 'Parking (Gate 1)', poly: [[428, -276], [465, -276], [455, -252], [425, -252]] },
    // Eastern parking
    { id: 'p-east', name: 'Parking (East)', poly: [[472, -248], [512, -246], [498, -212], [464, -216]] },
    // Central parking
    { id: 'p-central', name: 'Parking (Central)', poly: [[382, -212], [415, -212], [402, -150], [376, -150]] }
  ];

  const greenAreas = [
    // Large lawn west of A1
    { id: 'lawn-a1-west', poly: [[285, -282], [325, -282], [325, -242], [285, -228]] },
    // Lawn southeast of Fountain Plaza
    { id: 'lawn-fountain-se', poly: [[338, -135], [372, -135], [365, -92], [332, -92]] },
    // Lawn east of Main Ground approach
    { id: 'lawn-mg-east', poly: [[335, -72], [420, -72], [420, -45], [335, -45]] }
  ];

  const gates = [
    { id: 'gate-2', name: 'GATE 2', x: 275, z: -290 },
    { id: 'gate-1', name: 'GATE 1', x: 448, z: -282 },
    { id: 'gate-4', name: 'GATE 4', x: 212, z: 65 }
  ];

  return { roads, buildings, facilities, parkings, greenAreas, gates };
}

export function renderSvg() {
  const data = generateLayout();
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#eef3eb;font-family:system-ui,-apple-system,sans-serif;">\n`;
  svg += `<defs>
    <filter id="shadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.22"/>
    </filter>
  </defs>\n`;

  // Title block
  svg += `<rect x="20" y="20" width="460" height="70" rx="8" fill="#ffffff" filter="url(#shadow)"/>
  <text x="35" y="48" font-size="20" font-weight="bold" fill="#1b365d">CHANDIGARH UNIVERSITY MOHALI</text>
  <text x="35" y="72" font-size="13" fill="#4a5568">Gate 2 to C1/C2 &amp; Main Ground — Reconstructed Road Geometry</text>\n`;

  // 1. Green areas
  for (const g of data.greenAreas) {
    svg += `<polygon points="${polyToSvg(g.poly)}" fill="#c2e4be" stroke="#a6d4a1" stroke-width="1.5"/>\n`;
  }

  // 2. Parking areas
  for (const p of data.parkings) {
    const pts = polyToSvg(p.poly);
    svg += `<polygon points="${pts}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="2" filter="url(#shadow)"/>\n`;
    const cx = p.poly.reduce((s, pt) => s + pt[0], 0) / p.poly.length;
    const cz = p.poly.reduce((s, pt) => s + pt[1], 0) / p.poly.length;
    const [scx, scy] = toSvg(cx, cz);
    svg += `<circle cx="${scx}" cy="${scy - 6}" r="10" fill="#1e293b"/>
    <text x="${scx}" cy="${scy - 2}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">P</text>
    <text x="${scx}" cy="${scy + 14}" font-size="11" font-weight="bold" fill="#1e293b" text-anchor="middle">PARKING</text>\n`;
  }

  // 3. Roads
  for (const r of data.roads) {
    const pts = r.points.map(([x, z]) => toSvg(x, z).join(',')).join(' ');
    const pxWidth = (r.width / (maxX - minX)) * width;
    // Road kerb / border
    svg += `<polyline points="${pts}" fill="none" stroke="#64748b" stroke-width="${pxWidth + 3}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    // Road surface
    svg += `<polyline points="${pts}" fill="none" stroke="#334155" stroke-width="${pxWidth}" stroke-linecap="round" stroke-linejoin="round"/>\n`;
    // Dashed center line
    svg += `<polyline points="${pts}" fill="none" stroke="#f8fafc" stroke-width="1.5" stroke-dasharray="8 6" stroke-linecap="round"/>\n`;
  }

  // 4. Roundabouts
  // Roundabout near Gate 1
  const [rbX, rbY] = toSvg(435, -238);
  svg += `<circle cx="${rbX}" cy="${rbY}" r="18" fill="#334155" stroke="#64748b" stroke-width="3"/>
  <circle cx="${rbX}" cy="${rbY}" r="7" fill="#c2e4be" stroke="#64748b" stroke-width="2"/>\n`;

  // 5. Facilities
  // Basketball
  const bball = data.facilities.find(f => f.id === 'basketball');
  svg += `<polygon points="${polyToSvg(bball.poly)}" fill="#d97706" stroke="#92400e" stroke-width="2" filter="url(#shadow)"/>
  <text x="${toSvg(245, -61)[0]}" y="${toSvg(245, -61)[1] + 4}" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">BASKETBALL</text>\n`;

  // Main Ground
  const mg = data.facilities.find(f => f.id === 'main-ground');
  const [mgX, mgY] = toSvg(247, -3);
  svg += `<polygon points="${polyToSvg(mg.poly)}" fill="#86efac" stroke="#22c55e" stroke-width="2.5" rx="8" filter="url(#shadow)"/>
  <circle cx="${mgX}" cy="${mgY}" r="36" fill="none" stroke="#15803d" stroke-width="1.5" stroke-dasharray="4 3"/>
  <rect x="${mgX - 5}" y="${mgY - 14}" width="10" height="28" fill="#fde68a" stroke="#d97706" stroke-width="1"/>
  <text x="${mgX}" y="${mgY + 4}" font-size="13" font-weight="bold" fill="#14532d" text-anchor="middle">MAIN GROUND</text>\n`;

  // Fountain Plaza
  const fp = data.facilities.find(f => f.id === 'fountain');
  const [fpX, fpY] = toSvg(fp.cx, fp.cz);
  svg += `<circle cx="${fpX}" cy="${fpY}" r="26" fill="#334155" stroke="#64748b" stroke-width="3"/>
  <circle cx="${fpX}" cy="${fpY}" r="15" fill="#38bdf8" stroke="#0284c7" stroke-width="2"/>
  <circle cx="${fpX}" cy="${fpY}" r="4" fill="#ffffff"/>
  <text x="${fpX}" y="${fpY + 36}" font-size="11" font-weight="bold" fill="#0369a1" text-anchor="middle">FOUNTAIN PLAZA</text>\n`;

  // 6. Buildings
  for (const b of data.buildings) {
    const pts = polyToSvg(b.poly);
    let fill = '#e2e8f0', stroke = '#475569';
    if (b.type === 'hostel') { fill = '#fed7aa'; stroke = '#c2410c'; }
    else if (b.type === 'food') { fill = '#fef08a'; stroke = '#a16207'; }
    else if (b.type === 'residential') { fill = '#e9d5ff'; stroke = '#7e22ce'; }
    svg += `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#shadow)"/>\n`;
    
    // Building label
    const cx = b.poly.reduce((s, pt) => s + pt[0], 0) / b.poly.length;
    const cz = b.poly.reduce((s, pt) => s + pt[1], 0) / b.poly.length;
    const [scx, scy] = toSvg(cx, cz);
    const lines = b.label.split('\n');
    const startY = Number(scy) - ((lines.length - 1) * 7);
    for (let i = 0; i < lines.length; i++) {
      svg += `<text x="${scx}" y="${startY + i * 14}" font-size="${lines.length > 1 ? 11 : 13}" font-weight="bold" fill="#0f172a" text-anchor="middle">${lines[i]}</text>\n`;
    }
  }

  // 7. Gates
  for (const gt of data.gates) {
    const [gx, gy] = toSvg(gt.x, gt.z);
    svg += `<g transform="translate(${gx - 18}, ${gy - 12})">
      <rect x="0" y="0" width="36" height="24" rx="4" fill="#1e3a8a" filter="url(#shadow)"/>
      <path d="M 6,4 L 6,20 M 30,4 L 30,20 M 6,8 L 30,8 M 6,16 L 30,16 M 12,8 L 12,16 M 18,8 L 18,16 M 24,8 L 24,16" stroke="#ffffff" stroke-width="1.8"/>
    </g>
    <text x="${gx}" y="${Number(gy) + 26}" font-size="12" font-weight="bold" fill="#1e3a8a" text-anchor="middle">${gt.name}</text>\n`;
  }

  svg += `</svg>`;
  return svg;
}

const svg = renderSvg();
fs.writeFileSync(SVG_PATH, svg);
console.log(`Rendered clean top-down 2D SVG preview: ${SVG_PATH} (${svg.length} bytes)`);
