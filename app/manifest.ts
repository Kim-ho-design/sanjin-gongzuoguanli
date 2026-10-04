import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '三金内容工作台', short_name: '内容工作台', start_url: '/', display: 'standalone',
    background_color: '#FAF9F6', theme_color: '#FAF9F6',
    icons: [{ src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' }],
  };
}
