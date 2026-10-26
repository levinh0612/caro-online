import { useEffect, useState } from 'react';
import { Cat, Rabbit } from '@phosphor-icons/react';
import Mascot from './fireice/Mascot.jsx';
import App from './App.jsx';
import FireIce from './FireIce.jsx';
import { Screen } from './ui.jsx';

const GAMES = {
  caro: { Component: App },
  fireice: { Component: FireIce },
};

// Trò đang chọn nằm ở #hash: tải lại trang vẫn ở đúng trò, nút Back của điện thoại quay về menu
const current = () => {
  const key = location.hash.slice(1);
  return key in GAMES ? key : null;
};

export default function Root() {
  const [game, setGame] = useState(current);

  useEffect(() => {
    const onHash = () => setGame(current());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const open = (key) => { location.hash = key; };
  const exit = () => { location.hash = ''; };

  if (game) {
    const { Component } = GAMES[game];
    return <Component onExit={exit} />;
  }

  return (
    <Screen>
      <div className="flex-1 flex flex-col items-center justify-center px-5 gap-4">
        <h1 className="font-display font-extrabold text-4xl text-heart text-center leading-tight">Chơi gì nè?</h1>
        <p className="text-sm text-heart/70 font-semibold -mt-2 mb-2 text-center">Chọn một trò cho hai đứa</p>

        <button
          onClick={() => open('caro')}
          className="press w-full max-w-sm rounded-3xl bg-white/85 p-5 shadow-lg shadow-pink-200/70 flex items-center gap-4 text-left"
        >
          <span className="flex gap-1">
            <Rabbit size={44} weight="duotone" color="#ff5c8a" />
            <Cat size={44} weight="duotone" color="#4fb0ff" />
          </span>
          <span>
            <span className="block font-display font-extrabold text-2xl text-heart">Cờ Caro</span>
            <span className="block text-sm font-semibold text-heart/70">5 quân liên tiếp là thắng</span>
          </span>
        </button>

        <button
          onClick={() => open('fireice')}
          className="fi-bg press relative w-full max-w-sm overflow-hidden rounded-3xl p-4 pr-5 flex items-center gap-2 text-left"
          style={{ boxShadow: '0 0 0 2px rgba(255,150,80,.45), 0 12px 32px -8px rgba(90,170,255,.55)' }}
        >
          <span className="flex items-end -ml-2 -my-3">
            <Mascot kind="fire" size={56} face={1} />
            <span className="-ml-6"><Mascot kind="ice" size={56} face={-1} /></span>
          </span>
          <span className="-ml-2">
            <span className="fi-title block text-3xl leading-tight">Lửa &amp; Băng</span>
            <span className="block text-sm font-semibold text-white/70">Hợp tác thoát khỏi hang động</span>
          </span>
        </button>
      </div>
    </Screen>
  );
}
