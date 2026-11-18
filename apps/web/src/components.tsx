import { useEffect, useRef, type ReactNode, type FormEvent } from 'react';
import { X } from 'lucide-react';
export function Modal({
  title,
  children,
  onClose,
  error,
  dismissible = true,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  error?: string;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        if (dismissible) onClose();
        else e.preventDefault();
      }}
      className="modal"
    >
      <header>
        <h2>{title}</h2>
        <button
          disabled={!dismissible}
          aria-label="Close dialog"
          className="icon-button"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {children}
    </dialog>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export const formData = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
export const value = (data: FormData, key: string) => String(data.get(key) ?? '');
export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>;
}
