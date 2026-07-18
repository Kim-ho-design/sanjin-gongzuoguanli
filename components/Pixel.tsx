// 像素风小组件：logo / 空状态 / 加载动画（Kimi 蓝像素点缀）

export function PixelLogo({ size = 28 }: { size?: number }) {
  // 5x5 像素「工」字，Kimi 蓝
  const rows = [
    '11111',
    '00100',
    '00100',
    '00100',
    '11111',
  ];
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
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#4D6BFE" />
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
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#A5B4FC" />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function PixelStar({ size = 14, color = '#F59E0B' }: { size?: number; color?: string }) {
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
      <PixelBottle size={36} />
      <p className="text-xs font-mono tracking-wide">{text}</p>
    </div>
  );
}
