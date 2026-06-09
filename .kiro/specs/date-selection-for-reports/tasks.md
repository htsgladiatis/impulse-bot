# Implementation Plan: Date Selection for Reports

## Overview

This implementation adds date selection capability to the Impulse Device Sales Bot, enabling users to fill reports for past dates while maintaining current date as default. The implementation extends the existing bot.js state machine with a new initial step (date_select), adds a calendar picker using Telegram inline keyboards, integrates date validation and formatting utilities, and modifies timestamp generation to use the selected report date.

**Key changes:**
- Add `reportDate` field to session structure (ISO 8601 format: YYYY-MM-DD)
- Create new utils/dateUtils.js with validation, formatting, and timestamp generation
- Insert date selection prompt before terminal number input (new step: date_select)
- Build interactive calendar picker with month/year navigation
- Update all step messages to display selected date
- Maintain backwards compatibility with existing Google Sheets/Excel storage

## Tasks

- [ ] 1. Create date utilities module
  - [-] 1.1 Create utils/dateUtils.js with DateValidator, DateFormatter, and TimestampGenerator
    - Implement DateValidator class with validate() and isDisabled() methods
    - Implement DateFormatter class with toDisplay(), toISO(), and toRussian() methods
    - Implement TimestampGenerator class with generate() and getCurrentTimestamp() methods
    - Add Russian localization constants (MONTHS_RU, DAYS_RU, CALENDAR_LABELS)
    - Validate dates against constraints: not in future, not older than 90 days
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ]* 1.2 Write unit tests for date utilities
    - Test DateValidator with valid dates, future dates, and dates older than 90 days
    - Test DateFormatter conversions between ISO and display formats
    - Test TimestampGenerator date+time combinations
    - Test edge cases: leap years, month boundaries, timezone handling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2. Extend session structure and initialization
  - [ ] 2.1 Modify createInitialSession() in bot.js to add reportDate field
    - Initialize reportDate to current date in ISO format (YYYY-MM-DD)
    - Change initial step from 'terminal_number' to 'date_select'
    - Add calendar state fields: _calendarMonth, _calendarYear (temporary, cleared after selection)
    - _Requirements: 6.1, 6.2, 3.1, 3.4_
  
  - [~] 2.2 Implement session validation and repair function
    - Create validateAndRepairSession() to ensure reportDate exists
    - Handle missing or invalid reportDate by resetting to current date
    - Log warnings for corrupted sessions
    - _Requirements: 6.4, 5.5_

- [ ] 3. Implement date selection prompt
  - [~] 3.1 Create showDatePrompt() method in bot.js
    - Display two inline keyboard buttons: "📅 Сегодня (DD.MM.YYYY)" and "📆 Выбрать другую дату"
    - Use callback data protocol: 'date|today' and 'date|custom'
    - Show current date in Russian format alongside "Today" option
    - _Requirements: 1.1, 1.2, 1.3, 1.5_
  
  - [~] 3.2 Implement handleDateCallback() method in bot.js
    - Handle 'date|today': keep current date, advance to terminal_number step
    - Handle 'date|custom': initialize calendar state, show calendar picker
    - _Requirements: 1.3, 1.4_

- [ ] 4. Build calendar picker component
  - [~] 4.1 Create buildCalendarKeyboard() function in bot.js
    - Generate header row with month/year and navigation buttons (◄◄, ◄, ►, ►►)
    - Generate day header row (Пн, Вт, Ср, Чт, Пт, Сб, Вс)
    - Generate date grid (6 weeks maximum, Monday-first week start)
    - Highlight current date with brackets [DD]
    - Disable future dates and dates older than 90 days
    - Use callback data protocol: 'cal|prev_month', 'cal|next_month', 'cal|prev_year', 'cal|next_year', 'cal|select|YYYY-MM-DD'
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7, 2.8, 10.1, 10.2, 10.4_
  
  - [~] 4.2 Create showCalendar() method in bot.js
    - Retrieve calendar state from session (_calendarYear, _calendarMonth)
    - Call buildCalendarKeyboard() with current state
    - Display calendar with month/year title
    - _Requirements: 2.1, 2.2_
  
  - [~] 4.3 Implement handleCalendarNavigation() method in bot.js
    - Handle 'cal|prev_month', 'cal|next_month': update _calendarMonth, handle year wrap
    - Handle 'cal|prev_year', 'cal|next_year': update _calendarYear
    - Handle 'cal|select|YYYY-MM-DD': validate date, update session.reportDate, clear calendar state, advance to terminal_number
    - Show validation errors as Telegram callback query alerts
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3_
  
  - [ ]* 4.4 Write integration tests for calendar picker
    - Test calendar navigation flows (month/year changes, wraparound)
    - Test date selection with valid and invalid dates
    - Test error handling for future dates and dates older than 90 days
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3_

- [~] 5. Checkpoint - Ensure date selection works end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Update step messages to display selected date
  - [~] 6.1 Create formatMessageWithDate() utility function
    - Format date as "📅 Дата отчёта: DD.MM.YYYY" header
    - Prepend header to all step messages
    - _Requirements: 3.2, 3.3, 3.5_
  
  - [~] 6.2 Update all step prompts to use formatMessageWithDate()
    - Modify showTerminalNumberPrompt, showManagerPrompt, showChannelPrompt, etc.
    - Ensure date header appears consistently across all steps
    - _Requirements: 3.2, 3.3_

- [ ] 7. Modify handleCallback() to route date callbacks
  - [~] 7.1 Add date callback routing in handleCallback()
    - Route callbacks starting with 'date|' to handleDateCallback()
    - Route callbacks starting with 'cal|' to handleCalendarNavigation()
    - Maintain existing callback routing for other flows
    - _Requirements: 1.1, 1.3, 1.4, 2.5, 2.6_

- [ ] 8. Update timestamp generation for final submission
  - [~] 8.1 Modify finalSubmit() method in bot.js
    - Replace direct Date() usage with TimestampGenerator.generate(session.reportDate)
    - Combine selected reportDate with current time (HH:MM:SS)
    - Format as 'DD.MM.YYYY HH:MM:SS' (with quote prefix for Google Sheets)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [~] 8.2 Update Google Sheets service to handle prefixed timestamps
    - Modify services/googleSheets.js appendSale() to prefix timestamp with single quote (')
    - Ensure column A receives text-formatted timestamp: 'DD.MM.YYYY HH:MM:SS
    - _Requirements: 4.4, 7.3_
  
  - [~] 8.3 Update Excel service to use new timestamp format
    - Modify services/dataService.js appendSaleRow() to use TimestampGenerator
    - Maintain same format as Google Sheets (without quote prefix for Excel)
    - _Requirements: 4.5, 7.4_
  
  - [ ]* 8.4 Write integration tests for timestamp generation and storage
    - Test timestamp combines reportDate + current time correctly
    - Test Google Sheets receives prefixed timestamp in column A
    - Test Excel receives unquoted timestamp in same format
    - Test backwards compatibility with existing timestamp format
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 7.1, 7.2, 7.3_

- [~] 9. Checkpoint - Verify timestamp generation and storage
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Add date editing in preview/edit mode
  - [~] 10.1 Update edit menu to include "📅 Дата отчёта" option
    - Modify handleEditCallback() to add date edit button
    - Use callback data: 'edit|date'
    - _Requirements: 8.1_
  
  - [~] 10.2 Implement date editing flow in edit mode
    - When 'edit|date' is clicked, initialize calendar with current reportDate highlighted
    - Set _calendarYear and _calendarMonth from current reportDate
    - Show calendar picker for date change
    - _Requirements: 8.2, 8.3_
  
  - [~] 10.3 Update preview display after date edit
    - When date is changed in edit mode, update session.reportDate
    - Regenerate preview message with new date
    - Update all date references in preview summary
    - _Requirements: 8.4, 8.5, 3.5_
  
  - [ ]* 10.4 Write integration tests for date editing
    - Test date can be changed from preview/edit mode
    - Test preview updates correctly after date change
    - Test edited date persists through submission
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 11. Implement backwards compatibility layer
  - [~] 11.1 Add session compatibility check in bot initialization
    - Implement ensureSessionCompatibility() to handle sessions without reportDate
    - Call on session retrieval to add missing reportDate field (default to today)
    - Ensure existing sessions continue to work without disruption
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [~] 11.2 Verify existing storage formats remain unchanged
    - Test that timestamp format matches existing implementation
    - Verify Google Sheets column A still receives DD.MM.YYYY HH:MM:SS with quote prefix
    - Verify Excel storage maintains same structure
    - _Requirements: 7.2, 7.3, 7.4_
  
  - [ ]* 11.3 Write backwards compatibility tests
    - Test old sessions without reportDate are handled gracefully
    - Test new date selection integrates with existing flow steps
    - Test data storage format matches legacy format exactly
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 12. Final integration and cleanup
  - [~] 12.1 Test complete flow from /start to submission
    - Verify date selection prompt appears first
    - Test "Today" flow maintains existing behavior
    - Test "Select Other Date" flow with calendar picker
    - Verify selected date persists through all steps
    - Verify timestamp generation uses selected date
    - _Requirements: 1.1, 1.3, 1.4, 2.5, 2.6, 3.2, 4.1, 4.2, 6.5_
  
  - [~] 12.2 Clean up calendar state after date selection
    - Ensure _calendarMonth and _calendarYear are deleted after date selection
    - Verify calendar state doesn't persist beyond date selection step
    - _Requirements: 2.5, 2.6_
  
  - [~] 12.3 Add error handling for date selection failures
    - Implement try-catch in handleDateSelection with fallback to current date
    - Log errors and notify user if date selection fails
    - Ensure flow continues gracefully on error
    - _Requirements: 5.5, 6.4_
  
  - [ ]* 12.4 Write end-to-end integration tests
    - Test complete report flow with custom date selection
    - Test complete report flow with "Today" selection
    - Test date editing in preview mode
    - Test error scenarios and recovery
    - _Requirements: All requirements_

- [~] 13. Final checkpoint - Complete feature verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The design uses JavaScript, so all implementation will use JavaScript (Node.js)
- Calendar picker uses Telegram inline keyboards for interactive date selection
- Date storage uses ISO 8601 format (YYYY-MM-DD) internally for consistency
- Display format uses Russian locale (DD.MM.YYYY) for user-facing messages
- Timestamp generation combines selected reportDate + current time for submission
- Google Sheets requires single quote prefix (') for text-formatted timestamps
- All existing flows remain unchanged except for the new date selection step at the beginning
- Backwards compatibility is maintained through session validation and repair
- Calendar state (_calendarMonth, _calendarYear) is temporary and cleared after selection

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "6.1"] },
    { "id": 4, "tasks": ["4.4", "6.2", "7.1"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3"] },
    { "id": 7, "tasks": ["8.4", "10.1"] },
    { "id": 8, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 9, "tasks": ["10.4", "11.2"] },
    { "id": 10, "tasks": ["11.3", "12.1"] },
    { "id": 11, "tasks": ["12.2", "12.3"] },
    { "id": 12, "tasks": ["12.4"] }
  ]
}
```
