// 像素风小组件：logo / 空状态 / 加载动画 / 点阵数字（Kimi 蓝像素点缀）

// 5x7 点阵字模
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '+': ['00000', '00100', '00100', '01110', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '件': ['10010', '10010', '11111', '10010', '10110', '11010', '10010'],
};

/** 点阵数字/符号（LED 点阵屏效果），value 支持 0-9 % + - / */
export function PixelNumber({
  value,
  size = 3,
  color = '#3375F6',
  dimColor = '#DFEAFD',
}: {
  value: string;
  size?: number; // 每个点阵点的边长(px)
  color?: string;
  dimColor?: string; // 未点亮点的颜色（null 则不渲染）
}) {
  const chars = value.split('');
  const gap = size; // 字符间距
  const w = chars.length * 5 * size + (chars.length - 1) * gap;
  const h = 7 * size;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className="pixelated inline-block align-middle"
      aria-label={value}
    >
      {chars.map((ch, ci) => {
        const glyph = GLYPHS[ch];
        if (!glyph) return null;
        const ox = ci * (5 * size + gap);
        return glyph.map((row, y) =>
          row.split('').map((cell, x) => (
            <rect
              key={`${ci}-${x}-${y}`}
              x={ox + x * size + size * 0.12}
              y={y * size + size * 0.12}
              width={size * 0.76}
              height={size * 0.76}
              rx={size * 0.2}
              fill={cell === '1' ? color : dimColor}
            />
          )),
        );
      })}
    </svg>
  );
}

export function AvatarLogo({ size = 32 }: { size?: number }) {
  // 用户头像 logo（裁剪自 视觉风格参考图/头像.jpg）
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/avatar.png"
      width={size}
      height={size}
      alt="三金"
      className="rounded-full border border-line object-cover"
      style={{ width: size, height: size }}
    />
  );
}

export function PixelLogo({ size = 28 }: { size?: number }) {
  // 5x5 像素「工」字，Kimi 蓝
  const rows = ['11111', '00100', '00100', '00100', '11111'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className="pixelated"
      aria-label="工作OS"
    >
      {rows.map((row, y) =>
        row.split('').map((cell, x) =>
          cell === '1' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#3375F6" />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function PixelBottle({ size = 48 }: { size?: number }) {
  // 8x10 像素漂流瓶
  const rows = [
    '00111100',
    '00111100',
    '00011000',
    '00111100',
    '01111110',
    '01100110',
    '01111110',
    '01100110',
    '01111110',
    '00111100',
  ];
  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 8 10"
      shapeRendering="crispEdges"
      className="pixelated"
      aria-label="漂流瓶"
    >
      {rows.map((row, y) =>
        row.split('').map((cell, x) =>
          cell === '1' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#00237C" />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function PixelStar({ size = 14, color = '#F5A623' }: { size?: number; color?: string }) {
  // 5x5 像素星星
  const rows = ['00100', '01110', '11111', '01110', '01010'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      shapeRendering="crispEdges"
      className="pixelated inline-block"
      aria-label="今日"
    >
      {rows.map((row, y) =>
        row.split('').map((cell, x) =>
          cell === '1' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function PixelLoader() {
  // 3 个像素块跳跃加载动画
  return (
    <span className="inline-flex gap-1 items-end h-4" aria-label="加载中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-kimi-500 pixel-blink"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </span>
  );
}

export function PixelEmpty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3 text-ink-faint">
      <PixelBottle size={32} />
      <p className="text-[10px] font-mono tracking-[0.2em]">{text}</p>
    </div>
  );
}
