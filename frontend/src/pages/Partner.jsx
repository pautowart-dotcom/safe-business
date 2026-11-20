import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { Card, Btn, Field, TextInput, C } from '../ui/components.jsx';
import { copyToClipboard } from '../utils/clipboard.js';
import { Link } from 'react-router-dom';

function rub(n) {
  return `${Number(n || 0).toLocaleString('ru-RU')} ₽`;
}

export default function Partner() {
  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('0');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  function load() {
    api.get('/platform/partner/me')
      .then(({ data: next }) => {
        setData(next);
        setCode(next.code || '');
        setDiscount(String(next.discountPercent || 0));
        setError('');
      })
      .catch((err) => setError(err.response?.data?.error || 'Не удалось открыть кабинет'));
  }

  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data: next } = await api.post('/platform/partner/code', {
        code,
        discountPercent: Number(discount),
      });
      setData(next);
      setCode(next.code || '');
    } catch (err) {
      setError(err.response?.data?.error || 'Не удалось сохранить код');
    } finally {
      setSaving(false);
    }
  }

  async function copy(text, label) {
    const ok = await copyToClipboard(text);
    setCopied(ok ? label : '');
  }

  const link = data?.code ? `${window.location.origin}/?ref=${data.code}` : '';

  return (
    <div>
      <div className="ui-page-title" style={{ marginBottom: 8 }}>Партнёрская программа</div>
      <p style={{ fontSize: 14, color: C.secondary, marginTop: 0, marginBottom: 16, lineHeight: 1.45 }}>
        Код ваш, даже если вы сами ничего не покупаете. Своя покупка в долю не идёт.
        {data?.legalStatus === 'person' && ' Вы зарегистрированы как физическое лицо без статуса. Выплату таким партнёрам не делаем. Когда будет самозанятость, ИП или организация, напишите в поддержку.'}
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {!data ? null : (
        <>
          <Card>
            <div style={{ fontSize: 13, color: C.secondary }}>Пришло человек</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{data.arrived}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 13, color: C.secondary }}>Начислено</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{rub(data.earnedRub)}</div>
          </Card>
          <Card>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>
              Оплат по коду: {data.payments}. После {data.holdDays} дней с оплаты к выплате {rub(data.readyRub)}.
              Перевод раз в месяц, когда эта сумма от {rub(data.payoutMinRub)}. Пока нет чека самозанятого или счёта, сумма остаётся в кабинете.
            </div>
          </Card>
          <Card>
            <form onSubmit={save}>
              <Field label={data.code ? 'Ваш промокод' : 'Придумайте промокод'}>
                <TextInput
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="НАПРИМЕР ANNA"
                  maxLength={32}
                  autoCapitalize="characters"
                />
              </Field>
              <Field label="Скидка покупателю, %">
                <TextInput
                  value={discount}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
                    setDiscount(digits === '' ? '' : String(Math.min(data.sharePercent, Number(digits))));
                  }}
                  inputMode="numeric"
                  placeholder="0"
                />
              </Field>
              <div style={{ fontSize: 13, color: C.secondary, marginTop: -6, marginBottom: 12, lineHeight: 1.45 }}>
                Ваши {data.sharePercent}%. Скидка вычитается из них. Больше {data.sharePercent}% поставить нельзя.
                {data.examples && (
                  <div style={{ marginTop: 8 }}>
                    {data.examples.map((row) => {
                      const pct = Math.min(data.sharePercent, Math.max(0, Number(discount) || 0));
                      const pool = Math.round((row.listRub * data.sharePercent) / 100);
                      const off = Math.min(pool, Math.round((row.listRub * pct) / 100));
                      return (
                        <div key={row.label}>
                          {row.label}: покупатель {rub(row.listRub - off)}, вам {rub(pool - off)}
                        </div>
                      );
                    })}
                  </div>
                )}
                {data.code ? ' Если сменить код, старая ссылка считаться не будет.' : ''}
              </div>
              <Btn type="submit" disabled={saving || !code.trim()}>{saving ? 'Сохраняем…' : data.code ? 'Сохранить код' : 'Включить код'}</Btn>
            </form>
            {data.code && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: C.secondary, marginBottom: 6 }}>Ссылка</div>
                <div style={{ fontSize: 14, wordBreak: 'break-all', marginBottom: 10 }}>{link}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="secondary" small onClick={() => copy(link, 'ссылку')}>Скопировать ссылку</Btn>
                  <Btn variant="secondary" small onClick={() => copy(data.code, 'код')}>Скопировать код</Btn>
                </div>
                {copied && <div style={{ fontSize: 12, color: C.green, marginTop: 8 }}>Скопировали {copied}</div>}
              </div>
            )}
          </Card>
          <Card>
            <div style={{ fontSize: 14, lineHeight: 1.45 }}>
              Как рассказывать о сервисе и когда ждать деньги — в <a href="/partner/instrukciya/">инструкции</a>.
              Если что-то не сходится, напишите в <Link to="/support">поддержку</Link>: оттуда же видно ответ.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
