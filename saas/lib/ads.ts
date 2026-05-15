// saas/lib/ads.ts

// Example: static map now, replace with DB/API later
export async function getLatestAdCopy(lang: string): Promise<string> {
  const ads: Record<string, string> = {
    EN: 'Boost your reach with SignalBoost today!',
    ES: '¡Aumenta tu alcance con SignalBoost hoy!',
    PT: 'Amplie seu alcance com SignalBoost hoje!',
    PL: 'Zwiększ swój zasięg dzięki SignalBoost już dziś!',
    RU: 'Увеличьте охват с SignalBoost уже сегодня!',
    JP: '今すぐSignalBoostでリーチを拡大しましょう！',
  }
  return ads[lang] || ads['EN']
}
