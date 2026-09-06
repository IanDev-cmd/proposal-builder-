import { useLocation } from 'wouter';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { HOME_PATH } from '@/lib/homeLanding';

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 text-center">
        <AlertCircle className="h-12 w-12 text-black/20" />
        <h1 className="text-[22px] font-bold text-black">404 — Page not found</h1>
        <p className="text-[13px] text-black/40">
          The page you're looking for doesn't exist.
        </p>
        <button
          onClick={() => navigate(HOME_PATH)}
          className="mt-2 flex items-center gap-2 bg-[#FF5A45] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#F4412A]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Home
        </button>
      </div>
    </div>
  );
}
