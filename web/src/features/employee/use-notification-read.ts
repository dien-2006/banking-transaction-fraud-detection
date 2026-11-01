"use client";
import { useCallback, useEffect, useState } from "react";

// Share temporary read IDs between the page and header if browser storage is blocked.
const memoryReads = new Map<string, string[]>();

export function useNotificationRead(role: string, id: string) {
  const key = `d4-read-notifications:${role}:${id}`;
  const [readIds, setReadIds] = useState<string[]>([]);
  const stored = useCallback((): string[] => {
    if (memoryReads.has(key)) return memoryReads.get(key)!;
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }, [key]);
  useEffect(() => {
    const sync = () => setReadIds(stored());
    sync();
    window.addEventListener("d4-notifications-read", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("d4-notifications-read", sync);
      window.removeEventListener("storage", sync);
    };
  }, [stored]);
  const markRead = (ids: string[]) => {
    const next = [...new Set([...stored(), ...ids])];
    try {
      localStorage.setItem(key, JSON.stringify(next));
      memoryReads.delete(key);
    } catch {
      memoryReads.set(key, next);
    }
    setReadIds(next);
    window.dispatchEvent(new Event("d4-notifications-read"));
  };
  return { readIds, markRead };
}
