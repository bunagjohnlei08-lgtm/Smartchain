import React from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';

interface ProfileLogoutMenuProps {
  children: React.ReactNode;
  profilePath: string;
  triggerLabel: string;
  onConfirmLogout: () => void;
}

export default function ProfileLogoutMenu({ children, profilePath, triggerLabel, onConfirmLogout }: ProfileLogoutMenuProps) {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();
  const titleId = React.useId();
  const descriptionId = React.useId();

  const closeDialog = React.useCallback(() => {
    setIsDialogOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  React.useEffect(() => {
    const closeMenuOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isDialogOpen) closeDialog();
      else if (isMenuOpen) {
        setIsMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeMenuOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenuOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [closeDialog, isDialogOpen, isMenuOpen]);

  return (
    <>
      <div ref={containerRef} className="relative ml-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          className="operations-profile-control flex h-full items-center gap-2 rounded-xl px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800"
          aria-label={triggerLabel}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
        >
          {children}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {isMenuOpen && (
          <div
            id={menuId}
            role="menu"
            className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-[#0d1322] dark:text-slate-200 dark:shadow-black/30"
          >
            <Link
              to={profilePath}
              role="menuitem"
              onClick={() => setIsMenuOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-cyan-500/60 dark:hover:bg-slate-800"
            >
              <UserRound size={18} aria-hidden="true" />
              Profile
            </Link>
            <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMenuOpen(false);
                setIsDialogOpen(true);
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-600 outline-none transition-colors hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:text-rose-400 dark:hover:bg-rose-500/10"
            >
              <LogOut size={18} aria-hidden="true" />
              Logout
            </button>
          </div>
        )}
      </div>

      {isDialogOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-[#0d1322] dark:text-white sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-lg font-semibold">Log out?</h2>
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Are you sure you want to log out?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                autoFocus
                onClick={closeDialog}
                className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmLogout}
                className="min-h-11 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:ring-offset-[#0d1322]"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
