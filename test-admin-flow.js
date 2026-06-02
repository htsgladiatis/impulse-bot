'use strict';

/**
 * Тест-скрипт для проверки админ-флоу добавления городов и точек с типами.
 * Эмулирует работу admin-контроллера без Telegram-бота.
 */

const ref = require('./services/refDictionary');

async function test() {
  console.log('=== Тест админ-флоу ===\n');

  // 1. Загрузка ref.json
  await ref.load();
  console.log('1. Загрузка ref.json:', JSON.stringify(await ref.getRef(), null, 2));
  console.log('');

  // 2. getCitiesList
  const citiesList = ref.getCitiesList();
  console.log('2. getCitiesList():', citiesList);
  console.log('');

  // 3. addCity с типом
  console.log('3. addCity("Сочи", "sanatorium"):', ref.addCity('Сочи', 'sanatorium'));
  console.log('   addCity("Москва", "exhibition") (дубль):', ref.addCity('Москва', 'exhibition'));
  console.log('   getCitiesList():', ref.getCitiesList());
  console.log('');

  // 4. findCity и getCityType
  const city = ref.findCity('Сочи');
  console.log('4. findCity("Сочи"):', city);
  console.log('   getCityType("Сочи"):', ref.getCityType('Сочи'));
  console.log('   getCityType("Москва"):', ref.getCityType('Москва'));
  console.log('');

  // 5. addTerminal с городом и типом
  console.log('5. addTerminal("Точка Сочи 1", "Сочи", "sanatorium"):', ref.addTerminal('Точка Сочи 1', 'Сочи', 'sanatorium'));
  console.log('   addTerminal("Точка Москва 1", "Москва", "exhibition"):', ref.addTerminal('Точка Москва 1', 'Москва', 'exhibition'));
  console.log('   addTerminal("Дубль", "Москва", "exhibition"):', ref.addTerminal('Точка Москва 1', 'Москва', 'exhibition'));
  console.log('');

  // 6. getTerminalsList и getTerminalsByCity
  console.log('6. getTerminalsList():', ref.getTerminalsList());
  console.log('   getTerminalsByCity("Москва"):', ref.getTerminalsByCity('Москва'));
  console.log('   getTerminalsByCity("Сочи"):', ref.getTerminalsByCity('Сочи'));
  console.log('');

  // 7. removeCity
  console.log('7. removeCity("Сочи"):', ref.removeCity('Сочи'));
  console.log('   getCitiesList():', ref.getCitiesList());
  console.log('');

  // 8. removeTerminal
  console.log('8. removeTerminal("Точка Сочи 1"):', ref.removeTerminal('Точка Сочи 1'));
  console.log('   getTerminalsList():', ref.getTerminalsList());
  console.log('');

  // 9. TYPE_LABELS
  console.log('9. TYPE_LABELS:', ref.TYPE_LABELS);
  console.log('');

  // 10. Форматирование для отображения
  const data = await ref.getRef();
  const cities = data.cities || [];
  const terminals = data.terminals || [];
  console.log('10. Формат отображения городов:');
  cities.forEach((c, i) => {
    const typeLabel = ref.TYPE_LABELS[c.type] || c.type;
    console.log(`    ${i+1}. ${c.name} (${typeLabel})`);
  });
  console.log('    Формат отображения точек:');
  terminals.forEach((t, i) => {
    const typeLabel = ref.TYPE_LABELS[t.type] || t.type;
    console.log(`    ${i+1}. ${t.name} — ${t.city} (${typeLabel})`);
  });
  console.log('');

  // 11. Проверка getTerminalCityMap (для miniapp)
  console.log('11. getTerminalCityMap():', ref.getTerminalCityMap());
  console.log('');

  // 12. Сохранение итогового состояния
  await ref.save(data);
  console.log('12. Сохранено. Итоговый ref.json:');
  console.log(JSON.stringify(data, null, 2));

  console.log('\n=== ВСЕ ТЕСТЫ ПРОЙДЕНЫ ===');
}

test().catch(e => {
  console.error('ОШИБКА:', e);
  process.exit(1);
});