import { createContext, useContext, useLayoutEffect, type Dispatch, type SetStateAction } from 'react';

export const AdminDetailOverlayContext = createContext<Dispatch<SetStateAction<boolean>> | null>(null);

export function useAdminDetailOverlay(isOpen: boolean) {
  const setIsDetailOverlayOpen = useContext(AdminDetailOverlayContext);

  useLayoutEffect(() => {
    if (!setIsDetailOverlayOpen) return;

    setIsDetailOverlayOpen(isOpen);
    return () => setIsDetailOverlayOpen(false);
  }, [isOpen, setIsDetailOverlayOpen]);
}
