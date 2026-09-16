import { createContext, useContext, useLayoutEffect, type Dispatch, type SetStateAction } from 'react';

export const PlantManagerDetailOverlayContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

export function usePlantManagerDetailOverlay(isOpen: boolean) {
  const setIsDetailOverlayOpen = useContext(PlantManagerDetailOverlayContext);

  useLayoutEffect(() => {
    if (!setIsDetailOverlayOpen) return;

    setIsDetailOverlayOpen(isOpen);
    return () => setIsDetailOverlayOpen(false);
  }, [isOpen, setIsDetailOverlayOpen]);
}
