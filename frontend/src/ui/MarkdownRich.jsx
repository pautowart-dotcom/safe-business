import { C } from './theme.js';

// Рендер markdown для подробных инструкций «как сделать» (25.10.2026,
// backend/src/modules/security/content/instructions/*.md). Шире, чем
// MarkdownLite: заголовки #/##/###, списки «- » и «1. », цитаты «> »,
// таблицы «| … |», линия «---», **жирный** и *курсив* внутри строки. Без
// внешней библиотеки и без HTML из текста — только React-элементы.

function inline(text, keyBase) {
  const parts = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] !== undefined
      ? <strong key={`${keyBase}-${m.index}`} style={{ color: C.primary }}>{m[1]}</strong>
      : <em key={`${keyBase}-${m.index}`}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const TEXT = { fontSize: 14, lineHeight: 1.6, color: C.secondary };

function cells(line) {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

export default function MarkdownRich({ text }) {
  const blocks = [];
  const lines = text.split('\n');
  let i = 0;
  const key = () => `b-${blocks.length}`;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line === '') { i++; continue; }

    if (line === '---') {
      blocks.push(<hr key={key()} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '16px 0' }} />);
      i++;
    } else if (line.startsWith('### ')) {
      blocks.push(<h4 key={key()} style={{ fontSize: 15, fontWeight: 800, margin: '16px 0 6px', color: C.primary }}>{inline(line.slice(4), key())}</h4>);
      i++;
    } else if (line.startsWith('## ')) {
      blocks.push(<h3 key={key()} style={{ fontSize: 17, fontWeight: 800, margin: '22px 0 8px', color: C.primary }}>{inline(line.slice(3), key())}</h3>);
      i++;
    } else if (line.startsWith('# ')) {
      blocks.push(<h2 key={key()} style={{ fontSize: 20, fontWeight: 800, margin: '0 0 12px', color: C.primary }}>{inline(line.slice(2), key())}</h2>);
      i++;
    } else if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const l = lines[i].trim();
        if (!/^\|[\s|:-]+\|$/.test(l)) rows.push(cells(l));
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={key()} style={{ overflowX: 'auto', margin: '0 0 14px' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, lineHeight: 1.45 }}>
            <thead>
              <tr>{head.map((c, j) => <th key={j} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: `2px solid ${C.border}`, color: C.primary }}>{inline(c, `h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j} style={{ padding: '6px 8px', borderBottom: `1px solid ${C.border}`, color: C.secondary, verticalAlign: 'top' }}>{inline(c, `c${ri}-${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (line.startsWith('> ')) {
      const quote = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) { quote.push(lines[i].trim().replace(/^>\s?/, '')); i++; }
      blocks.push(
        <blockquote key={key()} style={{ ...TEXT, margin: '0 0 14px', padding: '8px 12px', borderLeft: `3px solid ${C.blue}`, background: C.surface, borderRadius: 6 }}>
          {inline(quote.join(' '), key())}
        </blockquote>
      );
    } else if (/^- /.test(line) || /^\d+\. /.test(line)) {
      const ordered = /^\d+\. /.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i].trim()) : /^- /.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(ordered ? /^\d+\. / : /^- /, ''));
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={key()} style={{ margin: '0 0 14px', paddingLeft: 22 }}>
          {items.map((it, j) => <li key={j} style={{ ...TEXT, marginBottom: 4 }}>{inline(it, `${key()}-${j}`)}</li>)}
        </Tag>
      );
    } else {
      const para = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (l === '' || l === '---' || /^(#{1,3} |\||> |- |\d+\. )/.test(l)) break;
        para.push(l);
        i++;
      }
      blocks.push(<p key={key()} style={{ ...TEXT, margin: '0 0 14px' }}>{inline(para.join(' '), key())}</p>);
    }
  }

  return <div>{blocks}</div>;
}
