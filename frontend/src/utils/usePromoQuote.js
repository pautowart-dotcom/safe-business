import { useEffect, useRef, useState } from 'react';

// Живой пересчёт цены по промокоду (24.10.2026, жалоба клиентки: ввела код,
// а сумма на экране не поменялась — поменялась только в ЮKassa). Код
// проверяется сам, через 0,7 с после того, как перестали печатать, — без
// кнопки «Применить». Ответ — цены сразу трёх вариантов (заключение,
// документы, набор), см. POST /platform/subscription/promo/quote.
// client — axios-инстанс страницы (у гостевого теста свой, guestApi).
// Пока код меняется, quote = null: в оплату не уйдёт код, который ещё не
// проверен.
export function usePromoQuote(client, input) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const code = input.trim();
    const my = ++seq.current;
    setQuote(null);
    setError('');
    if (code.length < 3) {
      setChecking(false);
      return undefined;
    }
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await client.post('/platform/subscription/promo/quote', { code });
        if (my === seq.current) setQuote(data);
      } catch (err) {
        if (my === seq.current) setError(err.response?.data?.error || 'Не удалось проверить промокод');
      } finally {
        if (my === seq.current) setChecking(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [client, input]);

  return { quote, error, checking };
}
