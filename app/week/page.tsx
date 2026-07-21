// 周视图已并入首页（components/WeekView.tsx），老路由重定向
import { redirect } from 'next/navigation';

export default function WeekPage() {
  redirect('/');
}
