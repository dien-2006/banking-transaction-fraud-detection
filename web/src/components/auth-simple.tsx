import { Brand } from "@/components/brand";
import Link from "next/link";
export function AuthSimple({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-canvas p-5"><section className="card w-full max-w-lg p-7 sm:p-10"><Brand /><h1 className="mt-8 text-3xl font-black">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p><div className="mt-7">{children}</div><Link className="mt-6 block text-center text-sm font-bold text-coral" href="/login">Quay lại đăng nhập</Link></section></main>;
}
