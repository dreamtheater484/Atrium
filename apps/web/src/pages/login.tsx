import { LogoMark } from '../components/shell/logo';

export function LoginPage() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3">
      <LogoMark className="size-10" />
      <h1 className="text-base font-semibold">Sign in to Atrium</h1>
    </div>
  );
}
