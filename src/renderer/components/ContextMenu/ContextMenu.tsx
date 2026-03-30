import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MenuItem {
  label: string;
  shortcut?: string;
  action: () => void;
  separator?: false;
}

interface Separator {
  separator: true;
}

type MenuEntry = MenuItem | Separator;

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', keyHandler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  // Clamp position to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 28),
    zIndex: 50,
  };

  return createPortal(
    <div
      ref={menuRef}
      style={{
        ...style,
        padding: 4,
        background: 'rgba(26, 26, 26, 0.3)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 10,
        boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 16px 70px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
      }}
      className="min-w-[180px] text-[13px] flex flex-col"
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} style={{ margin: '3px 4px', borderTop: '1px solid rgba(255,255,255,0.06)' }} />;
        }
        return (
          <button
            key={i}
            className="ctx-item flex items-center justify-between cursor-default text-left"
            style={{ color: 'rgba(255,255,255,0.9)', padding: '6px 10px', borderRadius: 6 }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            onClick={() => {
              item.action();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && (
              <span className="ml-4" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export type { MenuEntry };
