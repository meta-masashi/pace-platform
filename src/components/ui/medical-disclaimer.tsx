import { ShieldAlert } from "lucide-react";

interface MedicalDisclaimerProps {
  variant?: "inline" | "banner" | "minimal";
}

export function MedicalDisclaimer({
  variant = "inline",
}: MedicalDisclaimerProps) {
  if (variant === "minimal") {
    return (
      <p className="text-2xs text-slate-400">
        ※ 臨床判断の補助ツールであり、医療行為の代替ではありません
      </p>
    );
  }

  if (variant === "banner") {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-blue-700">医療免責事項</p>
          <p className="text-xs text-blue-600 mt-0.5">
            本システムは臨床判断の補助ツールであり、医療行為の代替ではありません。
            AI による推奨はすべて有資格スタッフの承認を必要とします。
            最終的な臨床判断は担当医師・AT・PT が行ってください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-2xs text-slate-400">
      <ShieldAlert className="w-3 h-3 shrink-0" />
      <span>
        臨床判断の補助ツールです。最終判断は有資格者が行ってください。
      </span>
    </div>
  );
}
