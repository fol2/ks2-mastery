import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets', 'monsters');

const branches = ['b1', 'b2'];
const stages = [0, 1, 2, 3, 4];
const sizes = [320, 640, 1280];
const baseSize = 1280;

const outline = '#1D2B3A';
const silver = '#E8E4F7';
const cream = '#F9E8B8';
const gold = '#E8C45A';
const burntGold = '#C89A30';
const offWhite = '#F6F5F1';

const palettes = {
  lorequill: {
    b1: { base: '#2F70B8', base2: '#244F8F', mid: '#9FC7F2', pale: '#E8F2FF', accent: '#D7B85E', accent2: '#F4E9CC', dark: '#183D73' },
    b2: { base: '#315A9D', base2: '#243C78', mid: '#A8B7F2', pale: '#EEF0FF', accent: '#CDAFE1', accent2: '#F4E9CC', dark: '#1E2F66' },
  },
  arithon: {
    b1: { base: '#2F70B8', base2: '#1F5F9A', mid: '#9FC7F2', pale: '#E8F2FF', accent: '#E8C45A', accent2: '#F29A42', dark: '#193C71' },
    b2: { base: '#2E8479', base2: '#215F66', mid: '#8FD6C7', pale: '#E5F3EF', accent: '#E8C45A', accent2: '#C06B3E', dark: '#173E49' },
  },
  measuron: {
    b1: { base: '#4B7A4A', base2: '#2E5D48', mid: '#AACF93', pale: '#E8F0E6', accent: '#D7B85E', accent2: '#8FD6C7', dark: '#244537' },
    b2: { base: '#2E8479', base2: '#236762', mid: '#8FD6C7', pale: '#E5F3EF', accent: '#E8C45A', accent2: '#AACF93', dark: '#173F42' },
  },
  strategon: {
    b1: { base: '#263E78', base2: '#1C2C5C', mid: '#9FC7F2', pale: '#E8F2FF', accent: '#E8C45A', accent2: '#8A5A9D', dark: '#16234D' },
    b2: { base: '#4D3F91', base2: '#312A6B', mid: '#CDAFE1', pale: '#F1E9F4', accent: '#9FC7F2', accent2: '#E8C45A', dark: '#211C58' },
  },
};

const branchVariantMonsterIds = [
  'readbloom',
  'readrill',
  'inferane',
  'structurillon',
  'sumkrab',
  'carryfin',
  'fractail',
  'perciva',
  'numdrake',
  'fractalon',
  'georune',
  'proofwyrm',
];

const branchVariantTintByMonster = {
  readbloom: { hue: 8, saturation: 1.05, brightness: 1.01 },
  readrill: { hue: -10, saturation: 1.04, brightness: 1.01 },
  inferane: { hue: 6, saturation: 1.06, brightness: 1 },
  structurillon: { hue: -8, saturation: 1.03, brightness: 1.01 },
  sumkrab: { hue: 10, saturation: 1.04, brightness: 1.01 },
  carryfin: { hue: -12, saturation: 1.05, brightness: 1 },
  fractail: { hue: 8, saturation: 1.04, brightness: 1.01 },
  perciva: { hue: -10, saturation: 1.03, brightness: 1.01 },
  numdrake: { hue: 12, saturation: 1.04, brightness: 1 },
  fractalon: { hue: -8, saturation: 1.05, brightness: 1.01 },
  georune: { hue: 6, saturation: 1.04, brightness: 1.01 },
  proofwyrm: { hue: -12, saturation: 1.05, brightness: 1 },
};

function svgWrap(inner, palette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${baseSize}" height="${baseSize}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="body" x1="25%" y1="10%" x2="75%" y2="95%">
      <stop offset="0%" stop-color="${palette.mid}"/>
      <stop offset="42%" stop-color="${palette.base}"/>
      <stop offset="100%" stop-color="${palette.base2}"/>
    </linearGradient>
    <linearGradient id="belly" x1="30%" y1="10%" x2="70%" y2="100%">
      <stop offset="0%" stop-color="${palette.pale}"/>
      <stop offset="100%" stop-color="${palette.mid}"/>
    </linearGradient>
    <linearGradient id="warm" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="${cream}"/>
      <stop offset="54%" stop-color="${palette.accent}"/>
      <stop offset="100%" stop-color="${burntGold}"/>
    </linearGradient>
    <linearGradient id="secondary" x1="25%" y1="0%" x2="75%" y2="100%">
      <stop offset="0%" stop-color="${palette.accent2}"/>
      <stop offset="100%" stop-color="${palette.accent}"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g stroke="${outline}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    ${inner}
  </g>
</svg>`;
}

function eyePair(cx, cy, scale = 1, iris = gold) {
  const dx = 34 * scale;
  const r = 28 * scale;
  const pupil = 10 * scale;
  return `
    <circle cx="${cx - dx}" cy="${cy}" r="${r}" fill="${offWhite}"/>
    <circle cx="${cx + dx}" cy="${cy}" r="${r}" fill="${offWhite}"/>
    <circle cx="${cx - dx}" cy="${cy + 2 * scale}" r="${r * 0.48}" fill="${iris}" stroke-width="${7 * scale}"/>
    <circle cx="${cx + dx}" cy="${cy + 2 * scale}" r="${r * 0.48}" fill="${iris}" stroke-width="${7 * scale}"/>
    <circle cx="${cx - dx + 5 * scale}" cy="${cy - 4 * scale}" r="${pupil}" fill="${outline}" stroke="none"/>
    <circle cx="${cx + dx + 5 * scale}" cy="${cy - 4 * scale}" r="${pupil}" fill="${outline}" stroke="none"/>
    <circle cx="${cx - dx - 6 * scale}" cy="${cy - 12 * scale}" r="${pupil * 0.35}" fill="${offWhite}" stroke="none"/>
    <circle cx="${cx + dx - 6 * scale}" cy="${cy - 12 * scale}" r="${pupil * 0.35}" fill="${offWhite}" stroke="none"/>`;
}

function smallGlyphs(points, colour = silver, radius = 8) {
  return points.map(([x, y, r = radius]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}" stroke-width="5"/>`).join('');
}

function tickRing(cx, cy, rx, ry, colour = silver, count = 10) {
  const marks = [];
  for (let i = 0; i < count; i += 1) {
    const t = (Math.PI * 2 * i) / count;
    const x1 = cx + Math.cos(t) * rx * 0.82;
    const y1 = cy + Math.sin(t) * ry * 0.82;
    const x2 = cx + Math.cos(t) * rx;
    const y2 = cy + Math.sin(t) * ry;
    marks.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${colour}" stroke-width="7"/>`);
  }
  return marks.join('');
}

function lorequill(palette, stage, branch) {
  const tilt = branch === 'b2' ? -5 : 4;
  if (stage === 0) {
    return `
      <g transform="rotate(${tilt} 512 520)">
        <path d="M512 182 C640 260 713 408 690 552 C662 728 552 820 512 820 C472 820 360 728 334 552 C312 408 384 260 512 182 Z" fill="url(#body)"/>
        <path d="M392 364 C456 326 568 318 634 366 C588 406 458 414 392 364 Z" fill="${palette.accent2}" opacity="0.9"/>
        <path d="M410 438 C465 466 552 470 618 438" fill="none" stroke="${silver}" stroke-width="9"/>
        <path d="M414 505 C477 535 552 535 610 508" fill="none" stroke="${silver}" stroke-width="8"/>
        <path d="M512 244 C526 308 522 364 494 430" fill="none" stroke="${cream}" stroke-width="15" filter="url(#glow)"/>
        <path d="M562 223 C624 260 656 316 660 386" fill="none" stroke="${palette.accent}" stroke-width="8" opacity="0.8"/>
        ${smallGlyphs([[438, 292, 7], [604, 314, 7], [466, 602, 8], [570, 642, 8]], gold)}
      </g>`;
  }
  if (stage === 1) {
    return `
      <g transform="translate(0 12) rotate(${tilt} 512 560)">
        <path d="M512 290 C605 342 640 450 606 556 C578 644 520 698 512 760 C504 698 446 644 418 556 C384 450 420 342 512 290 Z" fill="url(#body)"/>
        <path d="M396 444 C326 436 280 472 252 540 C320 526 370 560 418 606 Z" fill="${palette.accent2}"/>
        <path d="M628 444 C704 432 754 468 782 538 C708 530 656 562 606 606 Z" fill="${palette.pale}"/>
        <path d="M510 270 C534 214 596 184 662 184 C626 236 582 286 522 326 Z" fill="url(#warm)"/>
        <path d="M472 632 C506 654 546 650 576 626" fill="none" stroke="${cream}" stroke-width="7"/>
        ${eyePair(512, 456, 0.82, palette.accent)}
        ${smallGlyphs([[390, 532, 5], [638, 526, 5], [684, 584, 5]], silver, 5)}
      </g>`;
  }
  if (stage === 2) {
    return `
      <g transform="translate(0 8) rotate(${tilt} 512 548)">
        <path d="M398 438 C286 370 190 398 132 514 C264 510 342 570 430 642 Z" fill="${palette.accent2}"/>
        <path d="M626 422 C746 342 850 366 910 492 C774 498 700 564 590 644 Z" fill="${palette.pale}"/>
        <path d="M512 260 C628 330 666 486 610 622 C572 714 516 736 512 806 C508 736 452 714 414 622 C358 486 396 330 512 260 Z" fill="url(#body)"/>
        <path d="M432 620 C472 662 548 666 590 622" fill="none" stroke="${cream}" stroke-width="8"/>
        <path d="M510 244 C560 178 646 150 726 172 C662 234 600 298 526 360 Z" fill="url(#warm)"/>
        <path d="M188 500 C260 458 336 486 400 550 M646 538 C714 478 786 458 864 484" fill="none" stroke="${silver}" stroke-width="8"/>
        ${eyePair(512, 438, 0.92, palette.accent)}
        <path d="M492 504 L524 504 L508 528 Z" fill="${palette.accent}" stroke-width="8"/>
        ${smallGlyphs([[330, 464, 6], [744, 438, 6], [586, 326, 6], [474, 688, 5]], gold)}
      </g>`;
  }
  if (stage === 3) {
    return `
      <g transform="rotate(${tilt} 512 532)">
        <path d="M356 388 C222 282 112 304 70 466 C228 440 326 526 426 640 Z" fill="${palette.accent2}"/>
        <path d="M666 384 C808 268 924 292 964 456 C804 438 704 526 594 648 Z" fill="${palette.pale}"/>
        <path d="M512 198 C642 276 700 442 654 612 C620 734 552 804 512 862 C472 804 404 734 370 612 C324 442 382 276 512 198 Z" fill="url(#body)"/>
        <path d="M410 626 C462 690 566 696 624 630" fill="url(#belly)" opacity="0.9"/>
        <path d="M508 188 C566 98 686 82 790 134 C692 204 616 294 534 388 Z" fill="url(#warm)"/>
        <path d="M136 444 C250 404 342 478 430 580 M618 582 C718 474 808 420 930 438" fill="none" stroke="${silver}" stroke-width="9"/>
        <path d="M430 708 C474 744 548 750 598 708" fill="none" stroke="${cream}" stroke-width="8"/>
        ${eyePair(512, 414, 1.05, palette.accent)}
        <path d="M488 490 L532 490 L510 526 Z" fill="${palette.accent}" stroke-width="9"/>
        ${smallGlyphs([[238, 392, 7], [824, 384, 7], [638, 206, 6], [456, 776, 6], [584, 776, 6]], gold)}
      </g>`;
  }
  return `
    <g transform="rotate(${tilt} 512 510)">
      <path d="M338 324 C192 174 68 204 42 422 C198 382 306 476 426 626 Z" fill="${palette.accent2}"/>
      <path d="M688 320 C842 160 970 194 990 414 C830 382 718 480 594 630 Z" fill="${palette.pale}"/>
      <path d="M512 142 C664 230 732 420 686 610 C650 756 562 826 512 902 C462 826 374 756 338 610 C292 420 360 230 512 142 Z" fill="url(#body)"/>
      <path d="M410 600 C462 686 566 696 622 604 C594 768 542 826 512 862 C482 826 430 768 410 600 Z" fill="url(#belly)"/>
      <path d="M506 132 C586 30 724 42 840 102 C728 184 638 294 536 416 Z" fill="url(#warm)"/>
      <path d="M178 388 C284 394 358 470 430 572 M848 380 C742 392 666 474 596 574" fill="none" stroke="${silver}" stroke-width="10"/>
      <path d="M414 700 C472 758 558 764 620 704" fill="none" stroke="${cream}" stroke-width="8"/>
      ${eyePair(512, 386, 1.1, palette.accent)}
      <path d="M486 466 L536 466 L510 506 Z" fill="${palette.accent}" stroke-width="10"/>
      ${smallGlyphs([[154, 330, 8], [858, 330, 8], [690, 126, 8], [338, 214, 7], [512, 836, 7]], gold)}
      <path d="M358 246 C414 214 464 214 514 246 M508 246 C572 204 650 188 736 208" fill="none" stroke="${cream}" stroke-width="7"/>
    </g>`;
}

function arithon(palette, stage, branch) {
  const tilt = branch === 'b2' ? 5 : -4;
  const beadColour = branch === 'b2' ? palette.mid : gold;
  if (stage === 0) {
    return `
      <g transform="rotate(${tilt} 512 520)">
        <path d="M512 184 C636 256 704 406 676 570 C650 724 552 818 512 818 C472 818 374 724 348 570 C320 406 388 256 512 184 Z" fill="url(#body)"/>
        <path d="M424 394 L512 294 L604 394 L566 626 L458 626 Z" fill="url(#belly)" opacity="0.82"/>
        <path d="M424 394 L604 394 M458 626 L566 626 M512 294 L512 698" fill="none" stroke="${silver}" stroke-width="8"/>
        ${smallGlyphs([[392, 346, 8], [632, 348, 8], [392, 590, 8], [632, 590, 8], [512, 716, 9]], beadColour)}
        <path d="M392 706 C470 756 554 758 632 706" fill="none" stroke="${cream}" stroke-width="8"/>
      </g>`;
  }
  if (stage === 1) {
    return `
      <g transform="translate(0 18) rotate(${tilt} 512 552)">
        <path d="M512 292 C614 348 646 472 604 586 C572 674 518 706 512 768 C506 706 452 674 420 586 C378 472 410 348 512 292 Z" fill="url(#body)"/>
        <path d="M430 564 C472 610 552 612 596 566" fill="url(#belly)" opacity="0.85"/>
        <path d="M404 662 C330 676 286 724 270 786 C336 754 394 736 472 736" fill="none" stroke="url(#warm)" stroke-width="22"/>
        <path d="M596 334 C668 346 724 394 754 476 C682 466 630 492 594 554 Z" fill="${palette.pale}"/>
        <path d="M468 270 L512 210 L558 270" fill="url(#warm)"/>
        ${eyePair(512, 444, 0.82, palette.accent)}
        <path d="M490 508 L532 508 L512 538 Z" fill="${palette.accent2}" stroke-width="8"/>
        ${smallGlyphs([[332, 678, 7], [392, 656, 7], [452, 690, 7], [690, 418, 7]], beadColour)}
      </g>`;
  }
  if (stage === 2) {
    return `
      <g transform="translate(0 8) rotate(${tilt} 512 540)">
        <path d="M388 398 C272 352 180 394 138 520 C266 500 350 554 438 642 Z" fill="${palette.pale}"/>
        <path d="M632 398 C748 352 842 394 886 520 C754 500 668 554 582 642 Z" fill="${palette.accent2}"/>
        <path d="M512 240 C640 318 672 492 616 646 C584 734 524 760 512 826 C500 760 440 734 408 646 C352 492 384 318 512 240 Z" fill="url(#body)"/>
        <path d="M432 610 C480 662 544 664 590 612" fill="url(#belly)" opacity="0.9"/>
        <path d="M466 236 L512 152 L562 236 L532 332 L494 332 Z" fill="url(#warm)"/>
        <path d="M208 504 C302 478 370 524 438 590 M816 504 C722 478 654 524 586 590" fill="none" stroke="${silver}" stroke-width="8"/>
        <path d="M392 726 C300 740 248 796 236 862 C322 816 406 800 512 806" fill="none" stroke="url(#warm)" stroke-width="24"/>
        ${eyePair(512, 430, 0.95, palette.accent)}
        <path d="M486 502 L538 502 L512 540 Z" fill="${palette.accent2}" stroke-width="9"/>
        ${smallGlyphs([[302, 486, 7], [722, 486, 7], [310, 742, 7], [386, 728, 7], [472, 756, 7]], beadColour)}
      </g>`;
  }
  if (stage === 3) {
    return `
      <g transform="rotate(${tilt} 512 526)">
        <path d="M352 354 C210 270 100 322 76 492 C240 456 338 538 434 658 Z" fill="${palette.pale}"/>
        <path d="M672 354 C814 270 924 322 948 492 C784 456 686 538 590 658 Z" fill="${palette.accent2}"/>
        <path d="M512 178 C670 270 712 460 654 638 C614 760 546 810 512 884 C478 810 410 760 370 638 C312 460 354 270 512 178 Z" fill="url(#body)"/>
        <path d="M414 602 C464 704 560 704 610 604 C594 744 546 800 512 846 C478 800 430 744 414 602 Z" fill="url(#belly)" opacity="0.9"/>
        <path d="M458 174 L512 70 L570 174 L538 304 L488 304 Z" fill="url(#warm)"/>
        <path d="M160 472 C270 430 350 506 434 596 M864 472 C754 430 674 506 590 596" fill="none" stroke="${silver}" stroke-width="9"/>
        <path d="M350 748 C262 762 210 820 198 894 C296 844 396 822 512 830" fill="none" stroke="url(#warm)" stroke-width="26"/>
        ${eyePair(512, 394, 1.04, palette.accent)}
        <path d="M482 474 L542 474 L512 520 Z" fill="${palette.accent2}" stroke-width="10"/>
        ${smallGlyphs([[258, 440, 8], [766, 440, 8], [292, 764, 8], [384, 746, 8], [478, 782, 8], [616, 230, 7]], beadColour)}
      </g>`;
  }
  return `
    <g transform="rotate(${tilt} 512 512)">
      <path d="M332 314 C176 176 54 232 44 452 C218 400 332 514 436 666 Z" fill="${palette.pale}"/>
      <path d="M692 314 C848 176 970 232 980 452 C806 400 692 514 588 666 Z" fill="${palette.accent2}"/>
      <path d="M512 126 C690 228 742 446 678 642 C632 788 562 842 512 914 C462 842 392 788 346 642 C282 446 334 228 512 126 Z" fill="url(#body)"/>
      <path d="M404 580 C466 718 558 720 620 584 C604 764 554 838 512 886 C470 838 420 764 404 580 Z" fill="url(#belly)" opacity="0.9"/>
      <path d="M452 124 L512 36 L574 124 L544 290 L484 290 Z" fill="url(#warm)"/>
      <path d="M132 420 C260 412 352 500 436 614 M892 420 C764 412 672 500 588 614" fill="none" stroke="${silver}" stroke-width="10"/>
      <path d="M320 770 C226 786 168 844 152 924 C274 866 394 848 512 856" fill="none" stroke="url(#warm)" stroke-width="28"/>
      ${eyePair(512, 370, 1.1, palette.accent)}
      <path d="M480 454 L546 454 L512 504 Z" fill="${palette.accent2}" stroke-width="10"/>
      ${smallGlyphs([[210, 374, 9], [812, 374, 9], [252, 786, 8], [346, 760, 8], [448, 792, 8], [604, 176, 8], [420, 176, 8]], beadColour)}
      <path d="M420 238 L604 238 M398 606 L626 606 M512 286 L512 814" fill="none" stroke="${cream}" stroke-width="7" opacity="0.75"/>
    </g>`;
}

function measuron(palette, stage, branch) {
  const tilt = branch === 'b2' ? -4 : 4;
  if (stage === 0) {
    return `
      <g transform="rotate(${tilt} 512 524)">
        <path d="M512 190 C634 252 704 400 682 564 C656 724 552 820 512 820 C472 820 368 724 342 564 C320 400 390 252 512 190 Z" fill="url(#body)"/>
        <ellipse cx="512" cy="512" rx="122" ry="144" fill="url(#belly)" opacity="0.88"/>
        ${tickRing(512, 512, 108, 128, palette.accent, 12)}
        <path d="M512 418 L512 512 L578 558" fill="none" stroke="${cream}" stroke-width="11"/>
        <path d="M402 670 C470 718 554 718 624 670" fill="none" stroke="${palette.accent2}" stroke-width="8"/>
        ${smallGlyphs([[424, 332, 7], [606, 336, 7], [512, 690, 8]], gold)}
      </g>`;
  }
  if (stage === 1) {
    return `
      <g transform="translate(0 20) rotate(${tilt} 512 560)">
        <path d="M512 318 C616 342 672 434 654 548 C638 650 566 712 512 712 C458 712 386 650 370 548 C352 434 408 342 512 318 Z" fill="url(#body)"/>
        <ellipse cx="512" cy="516" rx="108" ry="118" fill="url(#belly)" opacity="0.9"/>
        ${tickRing(512, 516, 88, 98, palette.accent, 10)}
        <path d="M390 590 C312 602 268 662 270 736 C330 694 392 682 462 690" fill="none" stroke="url(#warm)" stroke-width="22"/>
        <path d="M620 390 C696 392 754 438 784 512 C710 504 654 532 618 594 Z" fill="${palette.pale}"/>
        ${eyePair(512, 438, 0.78, palette.accent)}
        <path d="M492 500 L532 500 L512 530 Z" fill="${palette.accent}" stroke-width="8"/>
        ${smallGlyphs([[332, 614, 6], [392, 596, 6], [462, 632, 6], [706, 458, 6]], gold)}
      </g>`;
  }
  if (stage === 2) {
    return `
      <g transform="translate(0 8) rotate(${tilt} 512 544)">
        <path d="M356 470 C268 428 190 468 164 578 C266 554 332 594 404 660 Z" fill="${palette.pale}"/>
        <path d="M668 470 C756 428 834 468 860 578 C758 554 692 594 620 660 Z" fill="${palette.accent2}"/>
        <path d="M512 258 C644 294 720 420 696 570 C674 716 574 800 512 800 C450 800 350 716 328 570 C304 420 380 294 512 258 Z" fill="url(#body)"/>
        <ellipse cx="512" cy="548" rx="138" ry="160" fill="url(#belly)" opacity="0.88"/>
        ${tickRing(512, 548, 116, 136, palette.accent, 12)}
        <path d="M512 442 L512 548 L588 604" fill="none" stroke="${cream}" stroke-width="11"/>
        <path d="M386 710 C298 724 236 780 220 854 C330 812 420 798 512 806" fill="none" stroke="url(#warm)" stroke-width="24"/>
        ${eyePair(512, 430, 0.9, palette.accent)}
        <path d="M486 500 L538 500 L512 538 Z" fill="${palette.accent}" stroke-width="9"/>
        ${smallGlyphs([[244, 548, 7], [780, 548, 7], [314, 734, 7], [408, 712, 7], [610, 342, 7]], gold)}
      </g>`;
  }
  if (stage === 3) {
    return `
      <g transform="rotate(${tilt} 512 528)">
        <path d="M330 438 C204 372 104 426 94 588 C248 548 340 612 430 710 Z" fill="${palette.pale}"/>
        <path d="M694 438 C820 372 920 426 930 588 C776 548 684 612 594 710 Z" fill="${palette.accent2}"/>
        <path d="M512 202 C682 250 762 416 724 600 C692 758 590 854 512 854 C434 854 332 758 300 600 C262 416 342 250 512 202 Z" fill="url(#body)"/>
        <ellipse cx="512" cy="546" rx="176" ry="196" fill="url(#belly)" opacity="0.9"/>
        ${tickRing(512, 546, 150, 168, palette.accent, 14)}
        <path d="M512 400 L512 546 L610 620" fill="none" stroke="${cream}" stroke-width="12"/>
        <path d="M396 224 C444 150 580 150 628 224" fill="none" stroke="url(#warm)" stroke-width="22"/>
        <path d="M348 744 C246 760 180 828 164 914 C286 860 400 838 512 846" fill="none" stroke="url(#warm)" stroke-width="26"/>
        ${eyePair(512, 382, 1, palette.accent)}
        <path d="M480 466 L544 466 L512 514 Z" fill="${palette.accent}" stroke-width="10"/>
        ${smallGlyphs([[210, 536, 8], [814, 536, 8], [286, 764, 8], [392, 742, 8], [628, 232, 8], [396, 232, 8]], gold)}
      </g>`;
  }
  return `
    <g transform="rotate(${tilt} 512 512)">
      <path d="M306 400 C158 286 44 348 54 566 C222 506 338 600 442 736 Z" fill="${palette.pale}"/>
      <path d="M718 400 C866 286 980 348 970 566 C802 506 686 600 582 736 Z" fill="${palette.accent2}"/>
      <path d="M512 154 C704 208 800 404 760 606 C724 796 604 908 512 908 C420 908 300 796 264 606 C224 404 320 208 512 154 Z" fill="url(#body)"/>
      <ellipse cx="512" cy="548" rx="200" ry="228" fill="url(#belly)" opacity="0.92"/>
      ${tickRing(512, 548, 170, 194, palette.accent, 16)}
      <path d="M512 362 L512 548 L638 634" fill="none" stroke="${cream}" stroke-width="13"/>
      <path d="M366 200 C430 94 594 94 658 200" fill="none" stroke="url(#warm)" stroke-width="26"/>
      <path d="M312 766 C204 786 132 854 108 944 C250 876 386 854 512 862" fill="none" stroke="url(#warm)" stroke-width="30"/>
      ${eyePair(512, 360, 1.1, palette.accent)}
      <path d="M476 444 L548 444 L512 500 Z" fill="${palette.accent}" stroke-width="10"/>
      ${smallGlyphs([[176, 502, 9], [848, 502, 9], [248, 786, 8], [364, 758, 8], [480, 794, 8], [664, 210, 9], [360, 210, 9]], gold)}
      <path d="M362 548 H662 M512 346 V752" fill="none" stroke="${silver}" stroke-width="7" opacity="0.7"/>
    </g>`;
}

function strategon(palette, stage, branch) {
  const tilt = branch === 'b2' ? 4 : -5;
  if (stage === 0) {
    return `
      <g transform="rotate(${tilt} 512 520)">
        <path d="M512 184 C638 250 712 404 686 566 C658 728 552 820 512 820 C472 820 366 728 338 566 C312 404 386 250 512 184 Z" fill="url(#body)"/>
        <path d="M408 382 L512 300 L620 382 L620 602 L512 704 L404 602 Z" fill="url(#belly)" opacity="0.86"/>
        <path d="M408 382 H620 M404 602 H620 M512 300 V704 M456 424 H568 M456 496 H568 M456 568 H568" fill="none" stroke="${silver}" stroke-width="8"/>
        <path d="M412 698 C474 742 552 744 616 700" fill="none" stroke="${cream}" stroke-width="8"/>
        ${smallGlyphs([[424, 326, 7], [602, 328, 7], [414, 650, 7], [610, 650, 7]], gold)}
      </g>`;
  }
  if (stage === 1) {
    return `
      <g transform="translate(0 16) rotate(${tilt} 512 552)">
        <path d="M512 292 C622 344 664 468 620 594 C586 686 524 718 512 780 C500 718 438 686 404 594 C360 468 402 344 512 292 Z" fill="url(#body)"/>
        <path d="M430 580 C480 626 548 628 594 582" fill="url(#belly)" opacity="0.9"/>
        <path d="M392 426 C316 390 250 420 216 506 C306 494 368 532 424 592 Z" fill="${palette.pale}"/>
        <path d="M632 426 C708 390 774 420 808 506 C718 494 656 532 600 592 Z" fill="${palette.accent2}"/>
        <path d="M460 276 L512 210 L568 276 L540 336 L486 336 Z" fill="url(#warm)"/>
        ${eyePair(512, 444, 0.82, palette.accent)}
        <path d="M488 508 L536 508 L512 540 Z" fill="${palette.accent2}" stroke-width="8"/>
        <path d="M330 484 H416 M608 484 H694 M466 642 H560" fill="none" stroke="${silver}" stroke-width="7"/>
        ${smallGlyphs([[300, 456, 6], [724, 456, 6], [512, 678, 6]], gold)}
      </g>`;
  }
  if (stage === 2) {
    return `
      <g transform="translate(0 8) rotate(${tilt} 512 542)">
        <path d="M366 390 C244 302 146 340 116 492 C260 468 350 544 438 652 Z" fill="${palette.pale}"/>
        <path d="M658 390 C780 302 878 340 908 492 C764 468 674 544 586 652 Z" fill="${palette.accent2}"/>
        <path d="M512 232 C650 306 696 484 638 648 C596 764 530 790 512 858 C494 790 428 764 386 648 C328 484 374 306 512 232 Z" fill="url(#body)"/>
        <path d="M424 600 C476 676 552 678 600 604" fill="url(#belly)" opacity="0.9"/>
        <path d="M452 226 L512 130 L576 226 L540 340 L486 340 Z" fill="url(#warm)"/>
        <path d="M178 468 H288 V530 H388 M846 468 H736 V530 H636 M430 708 H594" fill="none" stroke="${silver}" stroke-width="8"/>
        ${eyePair(512, 424, 0.95, palette.accent)}
        <path d="M482 498 L542 498 L512 540 Z" fill="${palette.accent2}" stroke-width="9"/>
        ${smallGlyphs([[238, 436, 7], [786, 436, 7], [634, 220, 7], [390, 720, 7]], gold)}
      </g>`;
  }
  if (stage === 3) {
    return `
      <g transform="rotate(${tilt} 512 528)">
        <path d="M334 350 C184 220 76 266 58 456 C226 430 330 536 438 674 Z" fill="${palette.pale}"/>
        <path d="M690 350 C840 220 948 266 966 456 C798 430 694 536 586 674 Z" fill="${palette.accent2}"/>
        <path d="M512 178 C676 260 736 456 670 646 C628 768 552 820 512 888 C472 820 396 768 354 646 C288 456 348 260 512 178 Z" fill="url(#body)"/>
        <path d="M408 598 C468 708 558 710 616 602 C600 762 552 824 512 864 C472 824 424 762 408 598 Z" fill="url(#belly)" opacity="0.9"/>
        <path d="M440 170 L512 62 L586 170 L548 324 L476 324 Z" fill="url(#warm)"/>
        <path d="M136 422 H292 V500 H414 M888 422 H732 V500 H610 M390 732 H634" fill="none" stroke="${silver}" stroke-width="9"/>
        <path d="M386 220 C456 184 568 184 638 220" fill="none" stroke="${cream}" stroke-width="8"/>
        ${eyePair(512, 386, 1.04, palette.accent)}
        <path d="M478 468 L546 468 L512 518 Z" fill="${palette.accent2}" stroke-width="10"/>
        ${smallGlyphs([[198, 386, 8], [826, 386, 8], [628, 140, 8], [396, 140, 8], [512, 814, 8]], gold)}
      </g>`;
  }
  return `
    <g transform="rotate(${tilt} 512 510)">
      <path d="M314 310 C158 126 36 180 34 412 C208 372 332 502 446 678 Z" fill="${palette.pale}"/>
      <path d="M710 310 C866 126 988 180 990 412 C816 372 692 502 578 678 Z" fill="${palette.accent2}"/>
      <path d="M512 126 C696 216 768 430 700 640 C650 792 566 848 512 920 C458 848 374 792 324 640 C256 430 328 216 512 126 Z" fill="url(#body)"/>
      <path d="M398 584 C468 728 558 730 626 588 C610 776 558 842 512 894 C466 842 414 776 398 584 Z" fill="url(#belly)" opacity="0.9"/>
      <path d="M428 122 L512 30 L598 122 L558 300 L466 300 Z" fill="url(#warm)"/>
      <path d="M104 376 H286 V470 H424 M920 376 H738 V470 H600 M360 750 H664" fill="none" stroke="${silver}" stroke-width="10"/>
      <path d="M360 206 C442 146 582 146 664 206" fill="none" stroke="${cream}" stroke-width="9"/>
      ${eyePair(512, 362, 1.1, palette.accent)}
      <path d="M474 444 L550 444 L512 502 Z" fill="${palette.accent2}" stroke-width="10"/>
      ${smallGlyphs([[166, 328, 9], [858, 328, 9], [638, 98, 8], [386, 98, 8], [512, 844, 8], [310, 730, 8], [714, 730, 8]], gold)}
      <path d="M448 594 H576 M420 644 H604 M462 694 H562" fill="none" stroke="${cream}" stroke-width="7" opacity="0.78"/>
    </g>`;
}

const renderers = {
  lorequill,
  arithon,
  measuron,
  strategon,
};

async function writeAssetSet(monsterId, branch, stage) {
  const palette = palettes[monsterId][branch];
  const inner = renderers[monsterId](palette, stage, branch);
  const svg = svgWrap(inner, palette);
  const outDir = path.join(assetsDir, monsterId, branch);
  await mkdir(outDir, { recursive: true });
  const baseBuffer = await sharp(Buffer.from(svg))
    .resize(baseSize, baseSize, { fit: 'contain' })
    .png()
    .toBuffer();

  for (const size of sizes) {
    const outFile = path.join(outDir, `${monsterId}-${branch}-${stage}.${size}.webp`);
    await sharp(baseBuffer)
      .resize(size, size, { fit: 'contain' })
      .webp({ quality: 88, alphaQuality: 100, effort: 4 })
      .toFile(outFile);
  }
}

async function writeBranchVariant(monsterId, stage, size) {
  const sourceFile = path.join(assetsDir, monsterId, 'b1', `${monsterId}-b1-${stage}.${size}.webp`);
  const outDir = path.join(assetsDir, monsterId, 'b2');
  const outFile = path.join(outDir, `${monsterId}-b2-${stage}.${size}.webp`);
  const tint = branchVariantTintByMonster[monsterId];
  await mkdir(outDir, { recursive: true });
  await sharp(sourceFile)
    .flop()
    .modulate(tint)
    .webp({ quality: 88, alphaQuality: 100, effort: 4 })
    .toFile(outFile);
}

let written = 0;
for (const monsterId of Object.keys(renderers)) {
  for (const branch of branches) {
    for (const stage of stages) {
      await writeAssetSet(monsterId, branch, stage);
      written += sizes.length;
    }
  }
}

let branchVariants = 0;
for (const monsterId of branchVariantMonsterIds) {
  for (const stage of stages) {
    for (const size of sizes) {
      await writeBranchVariant(monsterId, stage, size);
      branchVariants += 1;
    }
  }
}

console.log(`Generated ${written} distinct subject monster WebP assets and ${branchVariants} branch variants.`);
