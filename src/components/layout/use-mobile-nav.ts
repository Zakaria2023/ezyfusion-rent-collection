"use client";

import { useState } from "react";

// Open state of the mobile navigation drawer; following a link closes it.
export const useMobileNav = () => {
  const [open, setOpen] = useState(false);
  const onOpenChange = (next: boolean) => setOpen(next);
  const close = () => setOpen(false);
  return { open, onOpenChange, close };
};
