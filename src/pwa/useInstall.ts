import { useEffect, useState } from 'react';
import { installGuidance } from './install-guidance';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useInstall() {
  const [installed, setInstalled] = useState(isStandalone);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [prompting, setPrompting] = useState(false);
  const [error, setError] = useState(false);
  const guidance = installGuidance(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setError(false);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const onDisplayChange = () => setInstalled(isStandalone());
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplayChange);
    return () => {
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplayChange);
    };
  }, []);

  async function install() {
    if (!prompt || prompting) return;
    setPrompting(true);
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setError(true);
    } finally {
      setPrompt(null);
      setPrompting(false);
    }
  }

  return {
    installed,
    canPrompt: !!prompt,
    prompting,
    install,
    guidance,
    error,
  };
}
