"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-black text-navy">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm leading-5 text-slate-500">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              aria-label="Đóng hộp thoại"
              className="grid size-10 shrink-0 place-items-center rounded-lg hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-coral"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
