import { CaretLeft } from '@phosphor-icons/react';

// icon Phosphor đi kèm chữ, mặc định cao bằng chữ
export function Ic({ icon: Icon, weight = 'duotone', className = '', ...rest }) {
  return <Icon weight={weight} size="1.15em" className={`inline-block align-[-0.2em] ${className}`} {...rest} />;
}

export function Screen({ children, className = '' }) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden ${className}`}
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {children}
    </div>
  );
}

// Nút về menu chọn trò, góc trên trái
export function MenuButton({ onClick, dark }) {
  return (
    <button
      onClick={onClick}
      className={`press absolute left-3 top-3 z-20 flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold shadow ${dark ? 'bg-white/10 text-white/90 border border-white/15 backdrop-blur' : 'bg-white/80 text-heart'}`}
      style={{ marginTop: 'env(safe-area-inset-top)' }}
    >
      <CaretLeft weight="bold" /> Menu
    </button>
  );
}
