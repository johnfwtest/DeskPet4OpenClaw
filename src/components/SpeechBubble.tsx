import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";

interface SpeechBubbleProps {
  text: string;
  visible: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  duration?: number;
  position?: { x: number; y: number };
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const MAX_LINES = 20;

const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  text,
  visible,
  pinned,
  onTogglePin,
  position,
  onMouseEnter,
  onMouseLeave,
}) => {
  const { t } = useI18n();
  const [displayedText, setDisplayedText] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  // Draggable anchor
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ── Typewriter animation ────────────────────────────────────
  // Stale-closure guard: when text is empty or changes, cancel
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (!visible || !text) {
      setDisplayedText("");
      setIsAnimating(false);
      return;
    }
    setIsAnimating(true);
    setDisplayedText("");

    // Immediately render a quick preview so short text appears fast
    if (text.length <= 60) {
      setDisplayedText(text);
      setIsAnimating(false);
      return undefined;
    }

    let idx = 0;
    const timer = setInterval(() => {
      idx++;
      if (idx > textRef.current.length) {
        clearInterval(timer);
        setIsAnimating(false);
        setDisplayedText(textRef.current);
        return;
      }
      setDisplayedText(textRef.current.slice(0, idx));
    }, 20);
    return () => clearInterval(timer);
  }, [text, visible]);

  // Auto-scroll to bottom whenever displayedText changes
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "21");
    const maxH = lineHeight * MAX_LINES;
    const scrolling = el.scrollHeight > maxH + 4;
    setNeedsScroll(scrolling);
    if (scrolling) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayedText]);

  // Draggable anchor — useEffect must be before early return (Rules of Hooks)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragOffset.current.x;
      const dy = e.clientY - dragOffset.current.y;
      dragOffset.current = { x: e.clientX, y: e.clientY };
      setDragPos(prev => ({ x: (prev ?? dragOffset.current).x + dx, y: (prev ?? dragOffset.current).y + dy }));
    };
    const onUp = () => { isDragging.current = false; document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!visible || !text) return null;

  const posX = dragPos ? dragPos.x : (position?.x ?? window.innerWidth / 2);
  const posY = dragPos ? dragPos.y : ((position?.y ?? window.innerHeight * 0.35) - 10);

  const handleAnchorDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    dragOffset.current = { x: e.clientX, y: e.clientY };
    document.body.style.userSelect = "none";
  };

  const maxHeightPx = 14 * 1.5 * MAX_LINES;

  const bubble = (
    <div
      className="speech-bubble"
      style={{
        position: "fixed",
        left: posX,
        top: posY,
        transform: "translate(-50%, -100%)",
        background: "rgba(255, 255, 255, 0.92)",
        borderRadius: "16px",
        padding: "10px 18px",
        maxWidth: "640px",
        maxHeight: `${maxHeightPx}px`,
        overflowX: "hidden",
        overflowY: needsScroll ? "auto" : "visible",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        fontSize: "14px",
        lineHeight: "1.5",
        color: "#333",
        zIndex: 1000,
        pointerEvents: "auto",
        animation: "bubbleIn 0.3s ease-out",
      }}
      ref={containerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Anchor — drag to reposition */}
      <div
        onMouseDown={handleAnchorDown}
        title="拖动调整位置"
        style={{
          position: "absolute", top: 2, left: 6,
          cursor: "grab",
          fontSize: 14, padding: 0,
          lineHeight: 1, zIndex: 1, opacity: 0.5,
          userSelect: "none",
        }}
      >✥</div>

      {/* Pin button */}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
        title={pinned ? t("msg.unpin") : t("msg.pin")}
        style={{
          position: "absolute", top: 2, right: 6,
          background: "none", border: "none",
          cursor: "pointer", fontSize: 16, padding: 0,
          lineHeight: 1, zIndex: 1, opacity: 0.7,
        }}
      >
        {pinned ? "📍" : "📌"}
      </button>

      {displayedText}
      {isAnimating && <span className="typewriter-cursor">|</span>}
      {/* Arrow */}
      <div
        style={{
          position: "absolute", bottom: "-8px", left: "50%",
          transform: "translateX(-50%)",
          width: 0, height: 0,
          borderLeft: "8px solid transparent",
          borderRight: "8px solid transparent",
          borderTop: "8px solid rgba(255,255,255,0.92)",
        }}
      />
    </div>
  );

  return createPortal(bubble, document.body);
};

export default SpeechBubble;
