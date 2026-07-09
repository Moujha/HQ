import { useEffect, useState } from "react";

export function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setVisible(false), 1200);
    const removeTimer = window.setTimeout(() => setHidden(true), 1900);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      aria-hidden
      className={`mc-splash ${visible ? "" : "mc-splash--hide"}`}
    >
      <div className="mc-splash__inner">
        <span className="mc-splash__tagline font-display text-2xl font-bold tracking-widest text-foreground">
          BLOU FEET
        </span>
      </div>
    </div>
  );
}
