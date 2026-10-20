"use client";

import { CalendarClock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDateTimePicker } from "./use-date-picker";

type DateTimePickerProps = {
  id: string;
  value: string; // 'YYYY-MM-DDTHH:mm' Malaysia wall clock, or ''
  onChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
};

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, m) =>
  String(m).padStart(2, "0"),
);

const SELECT_CLASS =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30";

export const DateTimePicker = ({
  id,
  value,
  onChange,
  placeholder = "Pick a date and time",
  invalid,
  disabled,
  className,
}: DateTimePickerProps) => {
  const picker = useDateTimePicker({ value, onChange });

  return (
    <Popover open={picker.open} onOpenChange={picker.onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid ? true : undefined}
            className={cn(
              "w-full justify-start font-normal dark:bg-input/30",
              className,
            )}
          />
        }
      >
        <CalendarClock className="text-muted-foreground" />
        <span
          className={cn(
            "truncate tabular-nums",
            !picker.label && "text-muted-foreground",
          )}
        >
          {picker.label ?? placeholder}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">MYT</span>
      </PopoverTrigger>
      <PopoverContent className="w-auto">
        <Calendar
          monthLabel={picker.monthLabel}
          grid={picker.grid}
          selected={picker.selected}
          today={picker.today}
          onPrevMonth={picker.prevMonth}
          onNextMonth={picker.nextMonth}
          onPrevYear={picker.prevYear}
          onNextYear={picker.nextYear}
          onSelect={picker.selectDate}
        />
        <fieldset className="mt-3 flex flex-col gap-2 border-t pt-3">
          <legend className="sr-only">Time</legend>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" aria-hidden />
            <label htmlFor={`${id}-hour`} className="sr-only">
              Hour
            </label>
            <select
              id={`${id}-hour`}
              className={SELECT_CLASS}
              value={picker.hour}
              disabled={!picker.hasDate}
              onChange={(event) => picker.setHour(event.target.value)}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground" aria-hidden>
              :
            </span>
            <label htmlFor={`${id}-minute`} className="sr-only">
              Minute
            </label>
            <select
              id={`${id}-minute`}
              className={SELECT_CLASS}
              value={picker.minute}
              disabled={!picker.hasDate}
              onChange={(event) => picker.setMinute(event.target.value)}
            >
              {MINUTES.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">Malaysia time (UTC+8)</p>
        </fieldset>
        <div className="mt-3 flex justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={picker.setNow}
          >
            Now
          </Button>
          <Button type="button" size="sm" onClick={picker.close}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
