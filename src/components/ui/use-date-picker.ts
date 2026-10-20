"use client";

import { useState } from "react";
import { isCalendarDate } from "@/lib/billing";
import {
  buildMonthGrid,
  formatYearMonthLabel,
  shiftMonth,
  type YearMonth,
  yearMonthOf,
} from "@/lib/calendar-grid";
import {
  formatCalendarDate,
  toMalaysiaInputValue,
  todayInMalaysia,
} from "@/lib/dates";

type CalendarPopoverOptions = {
  selected: string; // 'YYYY-MM-DD' or ''
  onSelectDate: (date: string) => void;
  closeOnSelect: boolean;
};

type DatePickerOptions = {
  value: string; // 'YYYY-MM-DD' or ''
  onChange: (value: string) => void;
};

type DateTimePickerOptions = {
  value: string; // 'YYYY-MM-DDTHH:mm' (Malaysia wall clock) or ''
  onChange: (value: string) => void;
};

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/;

// Open state, the visible month and "today" for a calendar popover. "Today"
// is Malaysia's date, read when the popover opens (an event), never during
// render, so server and browser HTML always match.
const useCalendarPopover = ({
  selected,
  onSelectDate,
  closeOnSelect,
}: CalendarPopoverOptions) => {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState<string | null>(null);
  const [visible, setVisible] = useState<YearMonth | null>(null);

  const onOpenChange = (next: boolean) => {
    if (next) {
      const now = todayInMalaysia(new Date());
      setToday(now);
      setVisible(yearMonthOf(selected) ?? yearMonthOf(now));
    }
    setOpen(next);
  };

  const move = (delta: number) =>
    setVisible((month) => (month ? shiftMonth(month, delta) : month));

  const selectDate = (date: string) => {
    onSelectDate(date);
    setVisible(yearMonthOf(date));
    if (closeOnSelect) {
      setOpen(false);
    }
  };

  return {
    open,
    onOpenChange,
    close: () => setOpen(false),
    today,
    monthLabel: visible ? formatYearMonthLabel(visible) : "",
    grid: visible ? buildMonthGrid(visible) : [],
    prevMonth: () => move(-1),
    nextMonth: () => move(1),
    prevYear: () => move(-12),
    nextYear: () => move(12),
    selectDate,
    reveal: (date: string) => setVisible(yearMonthOf(date)),
    selectToday: () => selectDate(todayInMalaysia(new Date())),
  };
};

/** A calendar date field: emits 'YYYY-MM-DD', shows '20 Oct 2026'. */
export const useDatePicker = ({ value, onChange }: DatePickerOptions) => {
  const calendar = useCalendarPopover({
    selected: value,
    onSelectDate: onChange,
    closeOnSelect: true,
  });
  return {
    ...calendar,
    selected: value,
    label: isCalendarDate(value) ? formatCalendarDate(value) : null,
  };
};

/**
 * A Malaysia wall-clock date and time: emits 'YYYY-MM-DDTHH:mm' (the same
 * string datetime-local produced; the server reads it as UTC+8).
 */
export const useDateTimePicker = ({
  value,
  onChange,
}: DateTimePickerOptions) => {
  const match = LOCAL_DATE_TIME.exec(value);
  const date = match?.[1] && isCalendarDate(match[1]) ? match[1] : "";
  const hour = match?.[2] ?? "00";
  const minute = match?.[3] ?? "00";

  const calendar = useCalendarPopover({
    selected: date,
    onSelectDate: (next) => onChange(`${next}T${hour}:${minute}`),
    closeOnSelect: false,
  });

  const setHour = (next: string) => {
    if (date) {
      onChange(`${date}T${next}:${minute}`);
    }
  };
  const setMinute = (next: string) => {
    if (date) {
      onChange(`${date}T${hour}:${next}`);
    }
  };
  const setNow = () => {
    const now = toMalaysiaInputValue(new Date());
    onChange(now);
    calendar.reveal(now.slice(0, 10));
  };

  return {
    ...calendar,
    selected: date,
    hour,
    minute,
    hasDate: date !== "",
    setHour,
    setMinute,
    setNow,
    label: date ? `${formatCalendarDate(date)}, ${hour}:${minute}` : null,
  };
};
