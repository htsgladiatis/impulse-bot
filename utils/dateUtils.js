'use strict';

// ========== RUSSIAN LOCALIZATION CONSTANTS ==========

const MONTHS_RU = [
  'Январь',    // January
  'Февраль',   // February
  'Март',      // March
  'Апрель',    // April
  'Май',       // May
  'Июнь',      // June
  'Июль',      // July
  'Август',    // August
  'Сентябрь',  // September
  'Октябрь',   // October
  'Ноябрь',    // November
  'Декабрь'    // December
];

const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const DAYS_FULL_RU = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье'
];

const CALENDAR_LABELS = {
  prevYear: '◄◄ Год',
  prevMonth: '◄ Назад',
  nextMonth: 'Вперёд ►',
  nextYear: 'Год ►►',
  today: 'Сегодня',
  selectOther: 'Выбрать другую дату',
  chooseDate: 'Выберите дату отчёта',
  invalidFuture: '❌ Нельзя выбрать будущую дату',
  invalidOld: '❌ Можно выбрать дату не старше 90 дней',
  invalidFormat: '❌ Некорректная дата'
};

// ========== DATE VALIDATOR ==========

class DateValidator {
  /**
   * Validates if date meets business constraints
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Object} { valid: boolean, error: string|null }
   */
  static validate(dateStr) {
    // Check 1: Valid date format
    const isoRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoRegex.test(dateStr)) {
      return { valid: false, error: CALENDAR_LABELS.invalidFormat };
    }

    const date = new Date(dateStr + 'T00:00:00');
    
    // Check 2: Valid date value
    if (isNaN(date.getTime())) {
      return { valid: false, error: CALENDAR_LABELS.invalidFormat };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check 3: Not in future
    if (date > today) {
      return { valid: false, error: CALENDAR_LABELS.invalidFuture };
    }
    
    // Check 4: Not older than 90 days
    const maxPastDate = new Date(today);
    maxPastDate.setDate(maxPastDate.getDate() - 90);
    
    if (date < maxPastDate) {
      return { valid: false, error: CALENDAR_LABELS.invalidOld };
    }
    
    return { valid: true, error: null };
  }
  
  /**
   * Check if date should be disabled in calendar
   * @param {Date} date
   * @returns {boolean}
   */
  static isDisabled(date) {
    const isoDate = this.toISO(date);
    return !this.validate(isoDate).valid;
  }
  
  /**
   * Convert Date to ISO format
   * @param {Date} date
   * @returns {string} YYYY-MM-DD
   */
  static toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

// ========== DATE FORMATTER ==========

class DateFormatter {
  /**
   * Convert ISO date to display format
   * @param {string} isoDate - YYYY-MM-DD
   * @returns {string} DD.MM.YYYY
   */
  static toDisplay(isoDate) {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return `${day}.${month}.${year}`;
  }
  
  /**
   * Convert display format to ISO
   * @param {string} displayDate - DD.MM.YYYY
   * @returns {string} YYYY-MM-DD
   */
  static toISO(displayDate) {
    if (!displayDate) return '';
    const [day, month, year] = displayDate.split('.');
    return `${year}-${month}-${day}`;
  }
  
  /**
   * Get localized date string
   * @param {string} isoDate - YYYY-MM-DD
   * @returns {string} Russian date representation (e.g., "8 января 2025")
   */
  static toRussian(isoDate) {
    if (!isoDate) return '';
    const date = new Date(isoDate + 'T00:00:00');
    const day = date.getDate();
    const month = MONTHS_RU[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month.toLowerCase()} ${year}`;
  }
  
  /**
   * Get current date in ISO format
   * @returns {string} YYYY-MM-DD
   */
  static getCurrentDateISO() {
    const now = new Date();
    return DateValidator.toISO(now);
  }
}

// ========== TIMESTAMP GENERATOR ==========

class TimestampGenerator {
  /**
   * Generate timestamp combining selected date + current time
   * @param {string} reportDate - ISO format YYYY-MM-DD
   * @returns {string} DD.MM.YYYY HH:MM:SS
   */
  static generate(reportDate) {
    if (!reportDate) {
      return this.getCurrentTimestamp();
    }
    
    try {
      const now = new Date();
      const [year, month, day] = reportDate.split('-');
      
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      
      return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
      console.error('Timestamp generation failed:', error);
      return this.getCurrentTimestamp();
    }
  }
  
  /**
   * Get current timestamp (for "Today" flow)
   * @returns {string} DD.MM.YYYY HH:MM:SS
   */
  static getCurrentTimestamp() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  }
}

// ========== EXPORTS ==========

module.exports = {
  DateValidator,
  DateFormatter,
  TimestampGenerator,
  MONTHS_RU,
  DAYS_RU,
  DAYS_FULL_RU,
  CALENDAR_LABELS
};
