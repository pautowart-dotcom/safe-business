import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Card, ST, Badge, C } from '../ui/components.jsx';
import Icon from '../ui/Icon.jsx';

// Полная справка (12.08.2026) — вступительная модалка (OnboardingModal.jsx)
// осталась короткой для первого входа, здесь — развёрнутая версия с
// примерами экранов, доступная в любой момент из "Ещё". Макеты ниже — не
// настоящие скриншоты (нет доступа ни к локальной БД, ни к боевому логину
// владельца), а точные по цветам/компонентам воспроизведения реальных
// экранов теми же токенами дизайна (ui/theme.js: C.*) — обновляются вместе
// с остальным приложением, а не стареют как отдельно сохранённые картинки.

// Обёртка "как это выглядит в приложении" — рамка под экран телефона.
function Mock({ children }) {
  return (
    <div style={{ marginTop: 10, marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.subtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Так это выглядит в приложении</div>
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 16, padding: 14, background: C.bg }}>
        {children}
      </div>
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: 13, color: C.secondary, lineHeight: 1.7 }}>
      {items.map((s, i) => <li key={i}>{s}</li>)}
    </ol>
  );
}

function MockRow({ icon, label, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      {icon && (
        <div style={{ width: 32, height: 32, borderRadius: 9, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon name={icon} size={16} color={C.primary} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.subtle }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function MockPill({ children }) {
  return (
    <span style={{ display: 'inline-block', background: C.surface, borderRadius: 8, padding: '5px 10px', fontSize: 12, marginRight: 6, marginBottom: 6 }}>
      {children}
    </span>
  );
}

function MockButton({ children, variant = 'secondary' }) {
  const isPrimary = variant === 'primary';
  return (
    <span style={{ display: 'inline-block', background: isPrimary ? C.primary : 'transparent', color: isPrimary ? '#FFF' : C.primary, border: isPrimary ? 'none' : `1px solid ${C.border}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700 }}>
      {children}
    </span>
  );
}

// ---------- Разделы ----------

function VisitsSection() {
  return (
    <Card>
      <ST>Визиты</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Каждый визит клиента фиксируется здесь: услуга, сумма, кто из мастеров выполнял, какие расходники ушли. На основе этого сам считаются заработок мастера и выручка студии — вручную ничего сводить не нужно.
      </p>
      <Mock>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.subtle, marginBottom: 8 }}>Новый визит</div>
        <MockPill>Клиент: Иванова Мария</MockPill>
        <MockPill>Мастер: Анна</MockPill>
        <div style={{ fontSize: 12, color: C.secondary, margin: '10px 0 4px' }}>Услуга</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>Маникюр с покрытием — 2 500 ₽</div>
        <div style={{ fontSize: 12, color: C.secondary, marginBottom: 4 }}>Расходники</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span>Гель-лак «Красный №12»</span><span style={{ fontWeight: 700 }}>2 мл</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.subtle }}>Категория: Гель-лак ▾</div>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '6px 10px', fontSize: 12, color: C.subtle }}>Расходник ▾</div>
        </div>
        <div style={{ fontSize: 12, color: C.secondary, marginBottom: 4 }}>Фото до / после</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['до', 'после'].map((l) => (
            <div key={l} style={{ flex: 1, height: 54, borderRadius: 10, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: C.subtle, fontSize: 11 }}>
              <Icon name="camera" size={16} color={C.subtle} />{l}
            </div>
          ))}
        </div>
      </Mock>
      <Steps items={[
        'Нажмите «+» на экране «Визиты».',
        'Начните вводить фамилию — если клиент уже есть в базе, система найдёт его сама, иначе создастся новый.',
        'Укажите услугу и сумму, при желании — мастера (если ведёте за нескольких).',
        'В «Расходники» — сначала выберите категорию (например «Гель-лак»), потом сам расходник и количество, нажмите «+». Норма расхода может подставиться сама.',
        'Прикрепите фото до/после — по желанию, но полезно для портфолио и разбора претензий.',
        'Сохраните — заработок мастера и остатки склада пересчитаются автоматически.',
      ]} />
    </Card>
  );
}

function ClientsSection() {
  return (
    <Card>
      <ST>Клиенты</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        База клиентов собирается сама по мере записи визитов — заводить карточки вручную не обязательно. Здесь же можно продать абонемент — пакет визитов со скидкой, из которого потом просто списываются визиты.
      </p>
      <Mock>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Иванова Мария</div>
        <div style={{ fontSize: 12, color: C.subtle, marginBottom: 10 }}>+7 900 000-00-00 · 12 визитов</div>
        <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Абонемент «10 визитов»</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>7 / 10</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: 'hidden' }}>
            <div style={{ width: '70%', height: '100%', background: C.green }} />
          </div>
        </div>
      </Mock>
      <Steps items={[
        'Откройте карточку клиента (из списка или прямо из визита).',
        '«Продать абонемент» — укажите число визитов и общую сумму пакета (например 10 визитов за 20 000 ₽ вместо 2 500 ₽ по разовой цене).',
        'При следующих визитах этого клиента выбирайте способ оплаты «Списать с абонемента» — стоимость визита посчитается сама (сумма пакета ÷ число визитов).',
      ]} />
    </Card>
  );
}

function FinanceSection() {
  return (
    <Card>
      <ST>Финансы</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Выручка и расходы собираются из визитов и склада автоматически, вручную заносить нужно только то, что не связано с визитом напрямую (аренда, реклама и т.д.). Итоговую чистую прибыль видит только владелец — администратор и мастер видят выручку и расходы, но не маржу.
      </p>
      <Mock>
        <div style={{ display: 'flex', gap: 16 }}>
          {[['184 500 ₽', 'Выручка'], ['52 000 ₽', 'Расходы'], ['132 500 ₽', 'Прибыль']].map(([v, l]) => (
            <div key={l}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{v}</div>
              <div style={{ fontSize: 11, color: C.subtle }}>{l}</div>
            </div>
          ))}
        </div>
      </Mock>
      <Steps items={[
        'Выручка и списания на расходники подтягиваются из «Визитов» сами.',
        '«Добавить расход» — для всего остального: аренда, коммуналка, реклама, закупка оборудования.',
        'Фильтр по периоду вверху экрана — неделя/месяц/произвольный диапазон.',
      ]} />
    </Card>
  );
}

function SecuritySection() {
  return (
    <Card>
      <ST>Безопасность</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Самый насыщенный раздел, доступен только владельцу. Отвечает на вопрос «что мне грозит и что с этим делать» — не заменяет юриста, но показывает конкретную картину по вашему бизнесу вместо общих статей в интернете.
      </p>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Вкладка «Обзор» — тест и индекс</div>
      <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>34 вопроса о вашем бизнесе (бесплатно, один раз, можно пройти заново) — по итогам показывается индекс безопасности и зона (зелёная/жёлтая/красная).</p>
      <Mock>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.orangeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: C.orange }}>67%</div>
          <div>
            <Badge color={C.orange} bg={C.orangeBg}>Жёлтая зона</Badge>
            <div style={{ fontSize: 12, color: C.subtle, marginTop: 6 }}>3 нарушения найдено</div>
          </div>
        </div>
      </Mock>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Вкладка «Нарушения»</div>
      <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Конкретный список того, что не так, с риском, возможным штрафом и что сделать для устранения — отмечаете устранённым по мере решения.</p>
      <Mock>
        <MockRow label="Нет журнала стерилизации" sub="Риск 8/10 · штраф до 20 000 ₽" right={<MockButton>Устранено</MockButton>} />
        <MockRow label="Нет договора на вывоз отходов" sub="Риск 6/10 · штраф до 10 000 ₽" right={<MockButton>Устранено</MockButton>} />
      </Mock>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Вкладка «Документы»</div>
      <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Справочник — какие документы вообще нужны по вашей нише, плюс место загрузить уже имеющиеся (фото/скан/PDF) или сгенерированные в «Шаблонах документов».</p>

      <div style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 4px' }}>Вкладка «Если проверка»</div>
      <p style={{ fontSize: 13, color: C.secondary, margin: 0 }}>Что делать, если пришёл конкретный контролирующий орган (Роспотребнадзор, пожарный надзор и т.д.) — права, что подготовить, куда обжаловать. Черновик, юрист не проверял.</p>

      <Steps items={[
        'Сначала заполните профиль (юрформа, модель работы, ниша) — от этого зависит, какие вопросы и документы вам покажут.',
        'Пройдите тест — 34 вопроса, займёт несколько минут.',
        'Разбирайте нарушения по одному, начиная с самых рискованных (риск 9-10).',
        'В «Документах» отмечайте, что уже есть, и держите под рукой «Если проверка» на случай реального визита контролёра.',
      ]} />
    </Card>
  );
}

function TeamSection() {
  return (
    <Card>
      <ST>Команда</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Приглашение мастеров и администраторов, роли и доступ. Мастер видит только свои визиты и заработок, администратор — всё, кроме «Безопасности» и итоговой прибыли.
      </p>
      <Mock>
        <MockRow icon="team" label="Анна Смирнова" sub="Мастер · активна" />
        <MockRow icon="team" label="Ольга Петрова" sub="Администратор · активна" />
        <MockRow icon="team" label="anna2@mail.ru" sub="Мастер · приглашение отправлено" />
      </Mock>
      <Steps items={[
        '«Пригласить» — укажите email и роль (мастер/администратор).',
        'Сотрудник получит ссылку-приглашение на email, по ней создаст пароль.',
        'Роль можно изменить или удалить сотрудника из компании в любой момент.',
      ]} />
    </Card>
  );
}

function SuppliesSection() {
  return (
    <Card>
      <ST>Склад расходников</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Остатки расходников считаются сами — списываются при визите (см. раздел «Визиты»), пополняются, когда вы вносите закупку. Категории — свои, можно назвать как удобно (например «Гель-лак», «Бар», «Одноразовое»).
      </p>
      <Mock>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <MockPill>Все</MockPill><MockPill>Гель-лак</MockPill><MockPill>Бар</MockPill>
        </div>
        <MockRow icon="supply" label="Гель-лак «Красный №12»" sub="Осталось: 8 мл" right={<Badge color={C.orange} bg={C.orangeBg}>мало</Badge>} />
        <MockRow icon="supply" label="Пилка одноразовая" sub="Осталось: 240 шт" />
      </Mock>
      <Steps items={[
        '«Категории» — заведите свои (необязательно, можно оставить «Без категории»).',
        '«Добавить расходник» — название, единица измерения, при желании — норма расхода на визит (тогда количество будет подставляться само при списании).',
        'При закупке — «Пополнить», остаток увеличится; при визите остаток списывается автоматически.',
        'Порог «мало на складе» настраивается на каждом расходнике отдельно — ниже него появляется предупреждение.',
      ]} />
    </Card>
  );
}

function SettingsSection() {
  return (
    <Card>
      <ST>Настройки и подписка</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Название компании, профиль и оплата подписки на платформу — только у владельца. Администратор и мастер видят здесь только выход из аккаунта.
      </p>
      <Mock>
        <MockRow label="Название компании" sub="Студия «Ноготок»" />
        <MockRow label="Подписка" sub="Оплачено до 12.09.2026" right={<Badge color={C.green} bg={C.greenBg}>активна</Badge>} />
      </Mock>
      <Steps items={[
        'Смена названия компании — сразу применяется везде (шапка приложения, документы).',
        '«Оформить подписку» — переход на оплату через ЮKassa, банковской картой.',
        'Отдельные платные функции (например «Шаблоны документов») оплачиваются один раз и отдельно от подписки — своя кнопка внутри самого раздела.',
      ]} />
    </Card>
  );
}

function SupportSection() {
  return (
    <Card>
      <ST>Поддержка</ST>
      <p style={{ fontSize: 13, color: C.secondary, margin: '4px 0 0' }}>
        Если что-то не работает, непонятно или просто есть идея — пишите сюда напрямую, читает и отвечает разработчик, не бот.
      </p>
      <Mock>
        <div style={{ background: C.surface, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.subtle, marginBottom: 8 }}>
          Опишите, что случилось — можно приложить фото или скриншот проблемы
        </div>
        <MockButton variant="primary">Отправить</MockButton>
      </Mock>
      <Steps items={[
        'Опишите проблему своими словами — не обязательно точная техническая формулировка.',
        'Можно приложить до 3 фото/скриншотов.',
        'Ответ приходит в этот же раздел — история переписки сохраняется.',
      ]} />
    </Card>
  );
}

// moduleKey/roleCheck — та же логика видимости, что и в More.jsx (OWNER_ITEMS)
// и App.jsx (PrivateRoute ownerOnly/managementOnly) — раздел справки не
// должен рассказывать про экран, к которому у этой роли нет доступа.
const SECTIONS = [
  { key: 'visits', label: 'Визиты', Component: VisitsSection, moduleKey: 'visits' },
  { key: 'clients', label: 'Клиенты', Component: ClientsSection, moduleKey: 'clients' },
  { key: 'finance', label: 'Финансы', Component: FinanceSection },
  { key: 'security', label: 'Безопасность', Component: SecuritySection, roleCheck: 'owner' },
  { key: 'team', label: 'Команда', Component: TeamSection, roleCheck: 'management' },
  { key: 'supplies', label: 'Склад расходников', Component: SuppliesSection },
  { key: 'settings', label: 'Настройки и подписка', Component: SettingsSection },
  { key: 'support', label: 'Поддержка', Component: SupportSection },
];

const WELCOME_TEXT = {
  owner: 'Вы видите все разделы и управляете компанией целиком — от визитов до подписки.',
  admin: 'Вам доступно почти всё, кроме раздела «Безопасность» и итоговой чистой прибыли — это видит только владелец.',
  master: 'Вам доступны визиты, ваш заработок и общая сводка компании (без итоговой прибыли).',
};

export default function Help() {
  const [openKey, setOpenKey] = useState(null);
  const { isOwner, isManagement, hasModule } = useAuth();

  const sections = SECTIONS.filter((s) => {
    if (s.moduleKey && !hasModule(s.moduleKey)) return false;
    if (s.roleCheck === 'owner' && !isOwner) return false;
    if (s.roleCheck === 'management' && !isManagement) return false;
    return true;
  });

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Как пользоваться</div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 4 }}>
        Сервис для управления студией и снижения рисков — учёт визитов и финансов вместе с бесплатным аудитом безопасности бизнеса, чтобы штрафы и проверки не были сюрпризом.
      </div>
      <div style={{ fontSize: 13, color: C.secondary, marginBottom: 16 }}>
        {WELCOME_TEXT[isOwner ? 'owner' : isManagement ? 'admin' : 'master']} Ниже — каждый доступный вам раздел с примерами экранов и пошаговыми действиями, нажмите, чтобы развернуть.
      </div>

      {sections.map(({ key, label, Component }) => (
        <div key={key}>
          {openKey !== key ? (
            <Card style={{ cursor: 'pointer' }} onClick={() => setOpenKey(key)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{label}</span>
                <span style={{ fontSize: 20, color: C.border }}>›</span>
              </div>
            </Card>
          ) : (
            <div>
              <div onClick={() => setOpenKey(null)} style={{ cursor: 'pointer', fontSize: 12, color: C.subtle, marginBottom: -6, paddingLeft: 4 }}>
                ‹ Свернуть
              </div>
              <Component />
            </div>
          )}
        </div>
      ))}

      <div style={{ fontSize: 12, color: C.subtle, textAlign: 'center', marginTop: 8 }}>
        Не нашли ответ? Напишите в «Поддержку» — раздел в «Ещё».
      </div>
    </div>
  );
}
