import { useState } from 'react';
import { Card } from '@/components/ui/card';

interface RegionData {
  id: string;
  name: string;
  coordinates: { x: number; y: number };
  beneficiaries: number;
  path: string;
}

const regionData: RegionData[] = [
  {
    id: 'asia',
    name: '亚洲',
    coordinates: { x: 600, y: 240 },
    beneficiaries: 1523,
    path: 'M500,180 L520,160 L560,150 L600,140 L650,145 L700,160 L730,180 L750,210 L760,250 L750,290 L720,320 L680,340 L650,350 L620,355 L590,350 L560,340 L540,320 L520,300 L510,280 L500,260 L495,240 L490,220 L485,200 Z',
  },
  {
    id: 'europe',
    name: '欧洲',
    coordinates: { x: 420, y: 180 },
    beneficiaries: 892,
    path: 'M380,160 L400,150 L430,148 L460,155 L485,165 L495,180 L500,200 L495,220 L485,235 L470,245 L450,250 L425,248 L400,240 L380,225 L370,205 L365,185 Z',
  },
  {
    id: 'africa',
    name: '非洲',
    coordinates: { x: 450, y: 320 },
    beneficiaries: 1245,
    path: 'M420,230 L440,220 L465,218 L485,225 L495,245 L500,270 L505,300 L510,330 L510,360 L505,390 L495,420 L480,445 L460,460 L435,465 L410,460 L390,445 L375,420 L365,390 L360,360 L360,330 L365,300 L375,270 L390,250 L405,235 Z',
  },
  {
    id: 'north-america',
    name: '北美洲',
    coordinates: { x: 180, y: 200 },
    beneficiaries: 678,
    path: 'M100,140 L130,130 L160,125 L190,128 L220,135 L250,145 L275,160 L290,180 L295,205 L290,230 L280,255 L265,275 L245,290 L220,295 L195,290 L170,275 L150,255 L135,230 L125,205 L120,180 L110,160 Z',
  },
  {
    id: 'south-america',
    name: '南美洲',
    coordinates: { x: 240, y: 370 },
    beneficiaries: 534,
    path: 'M220,310 L240,305 L260,308 L275,318 L285,335 L290,360 L290,385 L285,410 L275,435 L260,455 L240,465 L220,468 L200,462 L185,448 L175,428 L170,405 L170,380 L175,355 L185,335 L200,320 Z',
  },
  {
    id: 'oceania',
    name: '大洋洲',
    coordinates: { x: 700, y: 390 },
    beneficiaries: 239,
    path: 'M650,370 L680,365 L710,368 L735,378 L750,395 L755,415 L750,435 L735,450 L710,458 L680,460 L655,455 L635,442 L625,422 L623,400 L630,382 Z',
  },
];

const EnhancedImpactMap = () => {
  const [hoveredRegion, setHoveredRegion] = useState<RegionData | null>(null);

  return (
    <div className="relative w-full h-[600px] bg-gradient-to-br from-accent/5 via-background to-accent/10 rounded-xl overflow-hidden border border-border/50">
      {/* SVG Map */}
      <svg
        viewBox="0 0 800 500"
        className="w-full h-full"
        style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))' }}
      >
        {/* Grid background */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth="0.5"
              opacity="0.1"
            />
          </pattern>
          <linearGradient id="regionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <rect width="800" height="500" fill="url(#grid)" />

        {/* Regions */}
        {regionData.map((region) => {
          const isHovered = hoveredRegion?.id === region.id;
          return (
            <g key={region.id}>
              {/* Region path */}
              <path
                d={region.path}
                fill={isHovered ? 'url(#regionGradient)' : 'hsl(var(--muted))'}
                stroke={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                strokeWidth={isHovered ? '3' : '1.5'}
                className="transition-all duration-300 cursor-pointer"
                style={{
                  transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: `${region.coordinates.x}px ${region.coordinates.y}px`,
                  filter: isHovered
                    ? 'drop-shadow(0 0 20px hsl(var(--primary) / 0.6))'
                    : 'none',
                }}
                onMouseEnter={() => setHoveredRegion(region)}
                onMouseLeave={() => setHoveredRegion(null)}
              />

              {/* Marker pulse effect */}
              <circle
                cx={region.coordinates.x}
                cy={region.coordinates.y}
                r="8"
                fill="hsl(var(--primary))"
                className={isHovered ? 'animate-ping' : ''}
                opacity={isHovered ? '0.6' : '0.4'}
              />
              <circle
                cx={region.coordinates.x}
                cy={region.coordinates.y}
                r="5"
                fill="hsl(var(--primary))"
              />
            </g>
          );
        })}

        {/* Connection lines */}
        <g opacity="0.15">
          {regionData.slice(0, -1).map((region, i) => {
            const nextRegion = regionData[i + 1];
            return (
              <line
                key={`line-${i}`}
                x1={region.coordinates.x}
                y1={region.coordinates.y}
                x2={nextRegion.coordinates.x}
                y2={nextRegion.coordinates.y}
                stroke="hsl(var(--primary))"
                strokeWidth="1"
                strokeDasharray="5,5"
                className="animate-pulse"
              />
            );
          })}
        </g>
      </svg>

      {/* Global stats overlay */}
      <div className="absolute top-4 left-4 space-y-2 pointer-events-none">
        <Card className="p-4 bg-background/90 backdrop-blur-sm pointer-events-auto">
          <div className="text-sm font-semibold mb-2">全球受助统计</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">总受助人数:</span>
              <span className="font-bold text-primary">
                {regionData.reduce((sum, r) => sum + r.beneficiaries, 0)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">覆盖地区:</span>
              <span className="font-bold">{regionData.length}</span>
            </div>
          </div>
        </Card>

        <Card className="p-3 bg-background/90 backdrop-blur-sm pointer-events-auto">
          <div className="text-xs text-muted-foreground">
            💡 悬停在地区上查看详情
          </div>
        </Card>
      </div>

      {/* Hovered region details */}
      {hoveredRegion && (
        <div className="absolute bottom-4 right-4 w-64 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <Card className="p-4 bg-background/95 backdrop-blur-sm border-primary/50">
            <h3 className="font-bold text-lg mb-1">{hoveredRegion.name}</h3>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-primary">
                  {hoveredRegion.beneficiaries}
                </span>
                <span className="text-sm text-muted-foreground">位受助者</span>
              </div>
              <div className="h-1 bg-gradient-primary rounded-full animate-pulse" />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default EnhancedImpactMap;
