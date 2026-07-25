// Баг №5: ссылки в сообщениях открывались только через копирование в
// браузер вручную — текст рендерился как обычная строка. Разбиваем по URL
// и оборачиваем в <a>, остальной текст остаётся обычными React-нодами
// (без dangerouslySetInnerHTML — безопасно для произвольного ввода).
const URL_RE = /(https?:\/\/[^\s]+)/g;

export default function Linkify({ text }) {
  const parts = String(text ?? '').split(URL_RE);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    )
  );
}
