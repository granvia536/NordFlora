import React, {useState} from 'react';
import {Download, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, isAndroid, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span>{compact ? 'Install' : 'Install Widget App'}</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border border-[#D4D8CE] bg-white text-[#18221D] text-sm font-medium hover:bg-[#F0F1EC] transition-colors whitespace-nowrap shrink-0"
      >
        <Smartphone className="w-4 h-4 shrink-0 text-[#1F513B]" />
        <span>{compact ? 'Pin to Phone' : 'Pin to Android Home'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
        >
          <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white border border-[#E4E6DF] p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="install-guide-title" className="text-lg font-semibold text-[#18221D]">
                  Pin NordFlora to Your Phone
                </h2>
                <p className="text-sm text-[#4B5850] mt-1">
                  Launch directly into Today&apos;s Watering Widget from your home screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#4B5850] hover:bg-[#F0F1EC]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-sm text-[#18221D] list-decimal list-inside">
                <li>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> so NordFlora opens straight to your daily widget.</li>
              </ol>
            ) : (
              <ol className="space-y-2.5 text-sm text-[#18221D] list-decimal list-inside">
                <li>
                  In {isAndroid ? 'Chrome on Android' : 'Chrome'}, open the{' '}
                  <strong>⋮ menu</strong> in the top corner.
                </li>
                <li>
                  Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>.
                </li>
                <li>
                  Long-press the NordFlora home-screen icon anytime for quick shortcuts to{' '}
                  <strong>Water Today</strong> or <strong>All Plants</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-[#1F513B] text-white text-sm font-medium hover:bg-[#173E2D] transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
