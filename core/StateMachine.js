'use strict';

const STEPS = Object.freeze({
  IDLE: 'IDLE',
  AUTH_PENDING: 'AUTH_PENDING',
  STEP_TERMINAL_NUMBER: 'STEP_TERMINAL_NUMBER',
  STEP_MANAGER: 'STEP_MANAGER',
  STEP_CHANNEL: 'STEP_CHANNEL',
  STEP_CITY: 'STEP_CITY',
  STEP_TERMINAL: 'STEP_TERMINAL',
  STEP_CASH: 'STEP_CASH',
  STEP_CASHLESS: 'STEP_CASHLESS',
  STEP_CREDIT: 'STEP_CREDIT',
  STEP_ENCASHMENT: 'STEP_ENCASHMENT',
  STEP_PHOTO: 'STEP_PHOTO',
  STEP_CART: 'STEP_CART',
  PREVIEW: 'PREVIEW',
  EDIT_MODE: 'EDIT_MODE',
  SUBMITTING: 'SUBMITTING',
});

function getNextStep(currentStep) {
  console.warn(`[StateMachine] getNextStep() not implemented for step: ${currentStep}`);
  return null;
}

function getStepPrompt(step) {
  console.warn(`[StateMachine] getStepPrompt() not implemented for step: ${step}`);
  return '';
}

function validateInput(step, input) {
  return { valid: true, step, input, error: null };
}

module.exports = { STEPS, getNextStep, getStepPrompt, validateInput };