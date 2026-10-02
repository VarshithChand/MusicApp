import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";

/**
 * A horizontally scrolling row with arrow buttons (shown on desktop when there is more to see) and a slim
 * scrollbar that matches the dark theme. On phones the row is swiped, so the arrows stay hidden.
 */
export function ScrollRow({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update, children]);

  const scroll = (direction: -1 | 1) => ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="scroll-row">
      {canLeft && (
        <button className="scroll-btn left" onClick={() => scroll(-1)} aria-label={`Scroll ${label} left`}>
          <Icon name="back" size={22} />
        </button>
      )}
      <div ref={ref} className="hscroll" role="list" aria-label={label}>
        {children}
      </div>
      {canRight && (
        <button className="scroll-btn right" onClick={() => scroll(1)} aria-label={`Scroll ${label} right`}>
          <span className="flip">
            <Icon name="back" size={22} />
          </span>
        </button>
      )}
    </div>
  );
}
