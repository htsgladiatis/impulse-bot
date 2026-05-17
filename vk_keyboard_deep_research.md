# Deep research: ошибка `keyboard contains incorrect JSON` в VK-боте Impulse Device

Дата: 2026-05-15

## Executive summary

Наиболее вероятное исправление: **явно сериализовать `KeyboardBuilder` через `.toString()` перед передачей в `messages.send` и `messages.edit`**.

Даже если `vk-io` в штатном `api.messages.send()` умеет неявно привести `KeyboardBuilder` к строке через `URLSearchParams`, явный вызов `.toString()` в адаптере безопаснее и устраняет класс ошибок, когда объект проходит через `JSON.stringify`, логгеры, spread/clone, кастомный транспорт или промежуточный wrapper.

Минимальный патч:

```js
const vkKeyboard = buildVKKeyboard(keyboard);
if (vkKeyboard) {
  params.keyboard = typeof vkKeyboard === 'string'
    ? vkKeyboard
    : vkKeyboard.toString();
}
```

Такой же принцип должен применяться в `editMessage`, если контроллер ожидает обновление inline-клавиатуры при редактировании сообщения.

## Подтверждённые факты

1. VK API ожидает параметр `keyboard` как **JSON-строку**, а не произвольный JS-объект.
2. Некорректный формат клавиатуры приводит к ошибке VK API `911` / `keyboard contains incorrect JSON`.
3. Для inline-клавиатуры в JSON должен быть `inline: true`; для обычной клавиатуры — `one_time` + `buttons`.
4. `vk-io@4.10.1` `KeyboardBuilder.toString()` возвращает корректный JSON:
   - для обычной клавиатуры: `{"buttons":[...],"one_time":false}`;
   - для inline-клавиатуры: `{"buttons":[...],"inline":true}`.
5. `vk-io@4.10.1` сериализует payload кнопки через `JSON.stringify(rawPayload)`. Поэтому строковый payload `'btn|0'` становится валидным JSON-string payload: `"btn|0"`.

## Важная поправка к текущему пониманию

В `vk-io` документация показывает передачу `KeyboardBuilder` напрямую:

```js
await api.messages.send({
  // ...
  keyboard: builder
});
```

Это работает в штатном пути `vk.api.messages.send`, потому что HTTP-тело строится через `URLSearchParams`, а `URLSearchParams` приводит значение к строке, вызывая `KeyboardBuilder.toString()`.

Но если в вашем адаптере где-то используется:

```js
JSON.stringify(vkKeyboard)
```

то получится **не VK-JSON клавиатуры**, а JSON внутренних полей билдера, примерно:

```json
{
  "isOneTime": false,
  "isInline": false,
  "rows": [],
  "currentRow": []
}
```

Это не соответствует схеме VK и способно вызвать `keyboard contains incorrect JSON`.

Именно поэтому финальная рекомендация — не полагаться на неявное приведение, а делать явную нормализацию в одном месте адаптера.

## Рекомендуемый патч адаптера

Добавить helper:

```js
function serializeVKKeyboard(keyboard) {
  if (!keyboard) return undefined;

  // Уже готовая JSON-строка
  if (typeof keyboard === 'string') {
    JSON.parse(keyboard); // fail-fast при невалидной строке
    return keyboard;
  }

  // vk-io KeyboardBuilder
  if (typeof keyboard.toString === 'function') {
    const serialized = keyboard.toString();
    JSON.parse(serialized); // fail-fast
    return serialized;
  }

  // Plain object fallback: только если buildVKKeyboard вернул сырой объект
  const serialized = JSON.stringify(keyboard);
  JSON.parse(serialized);
  return serialized;
}
```

В `sendMessage`:

```js
async sendMessage(peerId, text, keyboard, extra = {}) {
  const params = {
    peer_id: peerId,
    message: text || '',
    random_id: getRandomId(),
    ...extra,
  };

  const vkKeyboard = buildVKKeyboard(keyboard);
  const serializedKeyboard = serializeVKKeyboard(vkKeyboard);

  if (serializedKeyboard) {
    params.keyboard = serializedKeyboard;
  }

  return this.vk.api.messages.send(params);
}
```

В `editMessage`:

```js
async editMessage(peerId, conversationMessageId, text, keyboard, extra = {}) {
  const params = {
    peer_id: peerId,
    conversation_message_id: conversationMessageId,
    message: text || '',
    ...extra,
  };

  const vkKeyboard = buildVKKeyboard(keyboard);
  const serializedKeyboard = serializeVKKeyboard(vkKeyboard);

  if (serializedKeyboard) {
    params.keyboard = serializedKeyboard;
  }

  return this.vk.api.messages.edit(params);
}
```

## Inline-клавиатуры и callback

Если нужны именно inline-кнопки, контроллер или adapter должен передавать признак:

```js
{
  inline: true,
  buttons: [ ... ]
}
```

А `buildVKKeyboard()` должен вызывать:

```js
if (keyboard.inline || keyboard.options?.inline) {
  builder.inline(true);
}
```

Для callback-кнопок в `vk-io` нужно использовать `callbackButton`, а не `textButton`, если требуется событие `message_event` без отправки текстового сообщения пользователем.

- `textButton` → пользователь отправляет обычное сообщение, событие `message_new` / `message`.
- `callbackButton` → событие `message_event`, требуется `sendMessageEventAnswer` / `ctx.answer()`.

## Проверка `normalizeVKPayload()`

Рекомендуемый parser:

```js
function normalizeVKPayload(payload) {
  if (payload == null) return null;

  if (typeof payload !== 'string') {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}
```

Для строкового payload `'btn|0'` после `vk-io` в callback/message может прийти JSON-строка `"btn|0"`, поэтому `JSON.parse()` вернёт исходное `btn|0`.

## Тестовый чеклист

1. Unit smoke test:

```js
const kb = buildVKKeyboard({
  inline: true,
  buttons: [[{ text: 'Test', payload: 'btn|0', color: 'primary' }]]
});

const json = serializeVKKeyboard(kb);
const parsed = JSON.parse(json);

console.assert(typeof json === 'string');
console.assert(parsed.inline === true);
console.assert(Array.isArray(parsed.buttons));
console.assert(parsed.buttons[0][0].action.payload === '"btn|0"');
```

2. Реальный VK test:
   - отправить `/start`;
   - проверить, что первое сообщение с клавиатурой отправилось без `911`;
   - нажать обычную text-кнопку;
   - нажать inline callback-кнопку, если такие есть;
   - проверить, что `message_event` доходит до контроллера;
   - проверить `editMessage` с новой клавиатурой.

3. PM2:

```bash
pm2 restart impulse-vk-bot --update-env
pm2 logs impulse-vk-bot --lines 100
```

Если имя процесса неизвестно:

```bash
pm2 ls
pm2 describe <id-or-name>
```

## Что ещё нужно для точного diff

Нужны актуальные файлы:

- `adapters/vk.js`
- `index.vk.js`
- `controllers/sales.js`
- `ecosystem.config.js` / `pm2.config.js`
- свежие логи PM2 после попытки отправки клавиатуры

Без них можно дать только универсальный patch pattern, но не гарантированный line-by-line diff.
