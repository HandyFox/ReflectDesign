// Ready-made looks for calendars (Calendar Tools › Colors & Style).

import type { CalendarStyle } from '../model/types'

export interface CalendarTheme {
  id: string
  name: string
  style: CalendarStyle
}

const base: CalendarStyle = {
  font: 'Arial',
  titleFont: 'Georgia',
  titleColor: '#1F3864',
  titleBold: true,
  headerFill: '#1F3864',
  headerColor: '#FFFFFF',
  numberColor: '#1F3864',
  gridColor: '#8EA9DB',
  gridWidth: 0.75,
  cellFill: '#FFFFFF',
  weekendFill: '#F2F6FC',
  otherMonths: 'hide',
  dayNames: 'short',
  numberPosition: 'topLeft',
  eventColor: '#333333',
  corner: 6
}

export const CALENDAR_THEMES: CalendarTheme[] = [
  { id: 'classic', name: 'Classic Blue', style: base },
  {
    id: 'classroom', name: 'Bright Classroom', style: {
      ...base, titleFont: 'Arial Black', titleColor: '#E53935', headerFill: '#FFB300', headerColor: '#3E2723',
      numberColor: '#1565C0', gridColor: '#26A69A', gridWidth: 1.5, weekendFill: '#FFF8E1', dayNames: 'long', eventColor: '#263238', corner: 10
    }
  },
  {
    id: 'minimal', name: 'Modern Minimal', style: {
      ...base, titleFont: 'Arial', titleColor: '#222222', titleBold: false, headerFill: '#FFFFFF', headerColor: '#888888',
      numberColor: '#222222', gridColor: '#D9D9D9', gridWidth: 0.5, cellFill: null, weekendFill: null, otherMonths: 'show',
      numberPosition: 'topRight', eventColor: '#444444', corner: 0
    }
  },
  {
    id: 'garden', name: 'Garden', style: {
      ...base, font: 'Georgia', titleColor: '#2E7D32', headerFill: '#A5D6A7', headerColor: '#1B5E20', numberColor: '#33691E',
      gridColor: '#81C784', weekendFill: '#F1F8E9', eventColor: '#33691E', corner: 8
    }
  },
  {
    id: 'sunset', name: 'Sunset', style: {
      ...base, titleColor: '#BF360C', headerFill: '#FF7043', headerColor: '#FFFFFF', numberColor: '#BF360C',
      gridColor: '#FFAB91', weekendFill: '#FBE9E7', eventColor: '#4E342E', corner: 8
    }
  },
  {
    id: 'ink', name: 'Black & White (saves ink)', style: {
      ...base, titleFont: 'Arial', titleColor: '#000000', headerFill: '#FFFFFF', headerColor: '#000000', numberColor: '#000000',
      gridColor: '#000000', gridWidth: 0.75, cellFill: null, weekendFill: null, eventColor: '#000000', corner: 0
    }
  }
]

export function themeById(id: string): CalendarTheme {
  return CALENDAR_THEMES.find((t) => t.id === id) ?? CALENDAR_THEMES[0]
}
