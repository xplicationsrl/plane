/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { forwardRef, memo, useCallback, useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useOutsideClickDetector } from "@plane/hooks";

function useToggleBody() {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const handleOutsideClick = useCallback(() => {
    if (isOpen) setIsOpen(false);
  }, [isOpen]);
  useOutsideClickDetector(ref, handleOutsideClick);

  return (
    <div>
      <div ref={ref}>
        <button data-testid="open" onClick={() => setIsOpen(true)} />
      </div>
      <span data-testid="state">{isOpen ? "open" : "closed"}</span>
      <main data-testid="outside" />
    </div>
  );
}

function Plain() {
  return useToggleBody();
}
const Memoized = memo(function Memoized() {
  return useToggleBody();
});
const Forwarded = forwardRef(function Forwarded() {
  return useToggleBody();
});

describe("useOutsideClickDetector", () => {
  // mobx-react's `observer` wraps components in memo, so these cover every store-connected consumer.
  it.each([
    ["a plain component", Plain],
    ["a memo component", Memoized],
    ["a forwardRef component", Forwarded],
  ])("calls the latest callback in %s", (_name, Component) => {
    render(<Component />);
    fireEvent.click(screen.getByTestId("open"));
    expect(screen.getByTestId("state").textContent).toBe("open");

    act(() => {
      fireEvent.mouseDown(screen.getByTestId("outside"));
    });

    expect(screen.getByTestId("state").textContent).toBe("closed");
  });

  it("does not call back for a press inside the ref", () => {
    render(<Plain />);
    fireEvent.click(screen.getByTestId("open"));

    act(() => {
      fireEvent.mouseDown(screen.getByTestId("open"));
    });

    expect(screen.getByTestId("state").textContent).toBe("open");
  });
});
