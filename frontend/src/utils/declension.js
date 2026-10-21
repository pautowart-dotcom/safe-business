import petrovich from 'petrovich';

// Склонение названия для документов (21.10.2026, план 20.10 §2): из поля
// «ФИО ИП или название ООО» — родительный и дательный падеж для полей
// legalNameGen / legalNameDat. Только подсказка: человек видит и правит.
//
// «ИП Соколова Мария Андреевна» → «ИП Соколовой Марии Андреевны» — petrovich,
// род по отчеству. Аббревиатуры (ООО, АО…) и название в кавычках не
// склоняются; полная форма «Общество с ограниченной ответственностью» —
// склоняется первое слово. Не распознали — возвращаем null, поле не трогаем.

// (?![а-яё]) вместо \b: \b в JS не видит границ кириллических слов.
const ABBR = /^(ООО|АО|ПАО|НАО|ЗАО|ОАО|АНО|НКО)(?![а-яёА-ЯЁ])/;
const FULL_FORMS = [
  [/^Общество(?![а-яё])/, { genitive: 'Общества', dative: 'Обществу' }],
  [/^Индивидуальный предприниматель(?![а-яё])/, { genitive: 'Индивидуального предпринимателя', dative: 'Индивидуальному предпринимателю', person: true }],
];

function declinePerson(fio, gcase) {
  const parts = fio.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 3) return null;
  const [last, first, middle] = parts;
  try {
    const r = petrovich({ last, first, middle }, gcase);
    return [r.last, r.first, r.middle].filter(Boolean).join(' ');
  } catch {
    return null;
  }
}

export function declineLegalName(name, gcase) {
  const value = String(name || '').trim();
  if (!value) return null;
  if (ABBR.test(value)) return value;
  for (const [re, forms] of FULL_FORMS) {
    if (re.test(value)) {
      const rest = value.replace(re, '').trim();
      // «Индивидуальный предприниматель Иванов Иван Иванович» — склоняем и ФИО.
      const person = forms.person && rest && !/[«"]/.test(rest) ? declinePerson(rest, gcase) : rest;
      if (person === null) return null;
      return `${forms[gcase]}${person ? ` ${person}` : ''}`;
    }
  }
  const ip = value.match(/^ИП\s+(.+)$/);
  if (ip) {
    const person = declinePerson(ip[1], gcase);
    return person ? `ИП ${person}` : null;
  }
  return null;
}

// Обновление анкеты: при вводе legalName подставляем падежи, если поле пустое
// или в нём наша прежняя подсказка (не затираем то, что человек поправил сам).
export function withDeclensions(prev, key, value) {
  const next = { ...prev, [key]: value };
  if (key !== 'legalName') return next;
  for (const [field, gcase] of [['legalNameGen', 'genitive'], ['legalNameDat', 'dative']]) {
    const previousAuto = declineLegalName(prev.legalName, gcase);
    if (!prev[field] || prev[field] === previousAuto) {
      const auto = declineLegalName(value, gcase);
      if (auto) next[field] = auto;
      else if (prev[field] === previousAuto) next[field] = '';
    }
  }
  return next;
}
