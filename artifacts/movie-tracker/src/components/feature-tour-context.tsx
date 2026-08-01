import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type FeatureTourContextValue = {
  open: boolean;
  step: number;
  setStep: (step: number) => void;
  openTour: (atStep?: number) => void;
  closeTour: (markDone?: boolean) => void;
};

const FeatureTourContext = createContext<FeatureTourContextValue | null>(null);

/**
 * App-level tour state so navigating between pages during the spotlight
 * walkthrough does not remount / reset the open step across navigations.
 */
export function FeatureTourProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const openTour = useCallback((atStep = 0) => {
    setStep(atStep);
    setOpen(true);
  }, []);

  const closeTour = useCallback((_markDone = true) => {
    setOpen(false);
  }, []);

  const value = useMemo(
    () => ({ open, step, setStep, openTour, closeTour }),
    [open, step, openTour, closeTour],
  );

  return (
    <FeatureTourContext.Provider value={value}>{children}</FeatureTourContext.Provider>
  );
}

export function useFeatureTour(): FeatureTourContextValue {
  const ctx = useContext(FeatureTourContext);
  if (!ctx) {
    throw new Error("useFeatureTour must be used within FeatureTourProvider");
  }
  return ctx;
}
