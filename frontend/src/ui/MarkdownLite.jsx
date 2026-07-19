import { C } from './theme.js';

// Минимальный рендер markdown под юридические документы (только то, что
// реально встречается в текстах оферты/политики): # и ## заголовки,
// абзацы, разделённые пустой строкой, и списки "- ...". Без внешней
// библиотеки — формат нужен только для двух статичных документов.
export default function MarkdownLite({ text }) {
  const blocks = [];
  let listItems = null;

  function flushList() {
    if (listItems) {
      blocks.push(<ul key={`ul-${blocks.length}`} style={{ margin: '0 0 14px', paddingLeft: 20 }}>{listItems}</ul>);
      listItems = null;
    }
  }

  const lines = text.split('\n');
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length > 0) {
      blocks.push(
        <p key={`p-${blocks.length}`} style={{ margin: '0 0 14px', lineHeight: 1.6, color: C.secondary, fontSize: 14 }}>
          {paragraph.join(' ')}
        </p>
      );
      paragraph = [];
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={`h3-${blocks.length}`} style={{ fontSize: 16, fontWeight: 800, margin: '20px 0 8px', color: C.primary }}>{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      blocks.push(<h2 key={`h2-${blocks.length}`} style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px', color: C.primary }}>{line.slice(2)}</h2>);
    } else if (line.startsWith('- ')) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(<li key={listItems.length} style={{ fontSize: 14, lineHeight: 1.6, color: C.secondary, marginBottom: 4 }}>{line.slice(2)}</li>);
    } else if (line === '') {
      flushParagraph();
      flushList();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();

  return <div>{blocks}</div>;
}
