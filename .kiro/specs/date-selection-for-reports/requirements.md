# Requirements Document

## Introduction

This document specifies requirements for adding date selection capability to the Impulse Device Sales Bot. Currently, the bot only allows sales reports to be filled for the current date, which enforces daily discipline but prevents entry of missed reports for past dates. This feature will enable users to select a past date when filling out a missed report, while keeping the current date as the default for normal daily workflow.

## Glossary

- **Report_Form**: The step-by-step sales data collection flow in the Telegram bot
- **Session**: User-specific in-memory data structure tracking report progress
- **Date_Selector**: UI component allowing users to choose a report date
- **Timestamp**: Date and time value stored in column A of Google Sheets and Excel
- **Current_Date_Flow**: The normal workflow where users fill reports for today
- **Missed_Report_Flow**: The workflow where users fill reports for past dates
- **Calendar_Picker**: Interactive date selection interface with month/year navigation
- **SessionManager**: Service managing user session state and lifecycle

## Requirements

### Requirement 1: Date Selection Prompt

**User Story:** As a sales manager, I want to be prompted about the report date at the start of the flow, so that I can choose whether to fill a report for today or a past date.

#### Acceptance Criteria

1. WHEN a user invokes /start, THE Report_Form SHALL display a date selection prompt before requesting the terminal number
2. THE Date_Selector SHALL offer two options: "Today" and "Select Other Date"
3. WHEN the user selects "Today", THE Report_Form SHALL proceed with the current date and continue to terminal number input
4. WHEN the user selects "Select Other Date", THE Report_Form SHALL display the Calendar_Picker
5. THE Date_Selector SHALL display the current date in readable format (e.g., "08.01.2026") alongside the "Today" option

### Requirement 2: Calendar Picker Interface

**User Story:** As a sales manager, I want to use an interactive calendar to select a past date, so that I can easily navigate to the date of my missed report.

#### Acceptance Criteria

1. THE Calendar_Picker SHALL display the current month and year by default
2. THE Calendar_Picker SHALL show a grid of dates for the displayed month
3. THE Calendar_Picker SHALL provide navigation buttons to move to previous and next months
4. THE Calendar_Picker SHALL provide navigation buttons to move to previous and next years
5. WHEN a user selects a date, THE Report_Form SHALL store the selected date in the Session and close the Calendar_Picker
6. WHEN a user selects a date, THE Report_Form SHALL proceed to terminal number input
7. THE Calendar_Picker SHALL disable selection of future dates (dates after today)
8. THE Calendar_Picker SHALL highlight the current date for visual reference

### Requirement 3: Date Storage and Display

**User Story:** As a sales manager, I want to see the selected date throughout the report flow, so that I can confirm I'm filling the report for the correct date.

#### Acceptance Criteria

1. WHEN a report date is selected, THE Session SHALL store the date value in ISO 8601 format (YYYY-MM-DD)
2. THE Report_Form SHALL display the selected date at the top of each step message
3. THE Report_Form SHALL format the displayed date as "DD.MM.YYYY" for readability
4. WHEN creating a new Session, THE SessionManager SHALL initialize the report date to the current date by default
5. THE Report_Form SHALL include the selected date in the preview summary before final submission

### Requirement 4: Timestamp Generation

**User Story:** As a system administrator, I want the selected date to be properly formatted and stored, so that reports are correctly organized in Google Sheets and Excel.

#### Acceptance Criteria

1. WHEN saving a sale record, THE Report_Form SHALL generate a Timestamp using the selected report date
2. THE Report_Form SHALL set the time component of the Timestamp to the actual submission time
3. THE Report_Form SHALL format the Timestamp as "DD.MM.YYYY HH:MM:SS" for storage
4. THE Report_Form SHALL prefix the Timestamp with a single quote character (') when writing to Google Sheets column A to force text format
5. THE Report_Form SHALL use the same Timestamp format for both Google Sheets and local Excel storage

### Requirement 5: Date Validation

**User Story:** As a sales manager, I want the system to validate my date selection, so that I cannot create reports with invalid dates.

#### Acceptance Criteria

1. THE Calendar_Picker SHALL reject selection of dates in the future (after current date)
2. THE Calendar_Picker SHALL reject selection of dates more than 90 days in the past
3. IF a user attempts to select an invalid date, THEN THE Calendar_Picker SHALL display an error message explaining the date restriction
4. THE Report_Form SHALL validate that the stored date is a valid calendar date
5. IF the stored date is invalid, THEN THE Report_Form SHALL reset the date to the current date and log a warning

### Requirement 6: Session State Management

**User Story:** As a system developer, I want the report date to be properly managed in the session lifecycle, so that it integrates seamlessly with the existing flow.

#### Acceptance Criteria

1. THE SessionManager SHALL add a reportDate field to the Session structure
2. WHEN a Session is created, THE SessionManager SHALL initialize reportDate to the current date
3. WHEN a user selects a custom date, THE Report_Form SHALL update the Session.reportDate field
4. WHEN a Session is cleared, THE SessionManager SHALL reset reportDate to null
5. THE Session.reportDate SHALL persist across all steps of the report flow until submission

### Requirement 7: Backwards Compatibility

**User Story:** As a system administrator, I want the new date selection feature to be backwards compatible, so that existing data structures and integrations remain functional.

#### Acceptance Criteria

1. THE Report_Form SHALL continue to support the existing timestamp field in Session
2. THE Report_Form SHALL generate timestamps in the same format as the current implementation
3. THE Report_Form SHALL maintain the same Google Sheets column layout (column A for timestamp)
4. THE Report_Form SHALL maintain the same Excel worksheet structure
5. WHEN a report is submitted without selecting a custom date, THE Report_Form SHALL behave identically to the current implementation

### Requirement 8: Edit Mode Integration

**User Story:** As a sales manager, I want to be able to change the report date during preview/edit mode, so that I can correct date mistakes before final submission.

#### Acceptance Criteria

1. WHEN a user enters edit mode from the preview screen, THE Report_Form SHALL include "📅 Date" as an editable field option
2. WHEN a user selects to edit the date, THE Report_Form SHALL display the Calendar_Picker with the current report date highlighted
3. WHEN a user changes the date in edit mode, THE Report_Form SHALL update the Session.reportDate
4. WHEN a user changes the date in edit mode, THE Report_Form SHALL update all displayed date references
5. THE Report_Form SHALL reflect the updated date in the preview summary after edit

### Requirement 9: Multi-Platform Consistency

**User Story:** As a system administrator, I want the date selection feature to work consistently across platforms, so that users have the same experience in Telegram, Webchat, and Miniapp.

#### Acceptance Criteria

1. THE Date_Selector SHALL be implemented in the shared bot controller logic
2. THE Calendar_Picker interface SHALL adapt to platform capabilities (inline keyboards for Telegram, HTML controls for Webchat)
3. THE Report_Form SHALL use the same date storage format across all platforms
4. THE Report_Form SHALL validate dates consistently across all platforms
5. WHEN a Webchat or Miniapp user selects a date, THE Report_Form SHALL format and store the date identically to Telegram

### Requirement 10: Localization

**User Story:** As a Russian-speaking sales manager, I want the date selector to use Russian language and locale, so that I can read dates in my familiar format.

#### Acceptance Criteria

1. THE Calendar_Picker SHALL display month names in Russian (e.g., "Январь", "Февраль")
2. THE Calendar_Picker SHALL display day names in Russian (e.g., "Пн", "Вт", "Ср")
3. THE Report_Form SHALL format displayed dates using Russian locale conventions (DD.MM.YYYY)
4. THE Calendar_Picker SHALL use Russian labels for navigation buttons (e.g., "← Назад", "Вперёд →")
5. THE Calendar_Picker SHALL display error messages in Russian
